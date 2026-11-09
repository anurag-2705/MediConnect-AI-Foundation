# Identity, access control and first database model

## Roles
- `patient`: can access only their own account/profile in the initial milestone.
- `community_health_worker`: onboarding is invitation-only; access is limited to active assigned service areas.
- `clinician`: reserved in the data model; clinician onboarding and clinical workflows are not enabled.
- `platform_admin`: provisioned through a one-time operator-controlled bootstrap process.

The server reloads the current role and active session from PostgreSQL for every authenticated request. Do not rely on a role value sent by the mobile app.

## Registration and login
- Patient registration requires a village service-area ID, E.164 phone number, 12+ character password and acknowledgement of the server-configured privacy notice version.
- Phone verification uses a six-digit one-time code, five-minute expiry and five-attempt limit.
- Passwords are bcrypt-hashed (12 rounds). Access tokens last 15 minutes; opaque refresh tokens are stored only as SHA-256 hashes and rotated on refresh.
- Failed password attempts trigger a 15-minute account lock after five failures.
- Community health workers cannot self-select their role. A platform administrator issues a single-use, expiring invitation tied to a service area. The worker must then verify the invited phone.
- Logout revokes the refresh session; middleware also checks the session so the access token stops working immediately.

## Database tables
`service_areas`, `users`, `worker_area_assignments`, `worker_invitations`, `otp_challenges`, `auth_sessions`, `consent_records`, `audit_events`.

Service-area hierarchy is enforced as state -> district -> block -> village. Do not load actual geography until the launch geography and authoritative area dataset are confirmed.

## Local-only OTP mode
The development mode prints OTPs to the API terminal. It must only be used with fictional test accounts and must never be enabled in production. Production OTP delivery requires an approved SMS vendor adapter and credentials. The generic adapter in `src/lib/sms.ts` expects an HTTP POST with `{ "to": "...", "message": "..." }` and bearer authentication; adapt it to the chosen provider's documented API.

## API endpoints

| Method | Endpoint | Access |
|---|---|---|
| GET | `/health` | Public readiness check |
| GET | `/v1/service-areas?level=village` | Public active area directory |
| POST | `/v1/auth/register/patient` | Public; patient only |
| POST | `/v1/auth/verify-phone` | Public; OTP required |
| POST | `/v1/auth/resend-verification` | Public; rate-limited |
| POST | `/v1/auth/login` | Public; rate-limited |
| POST | `/v1/auth/refresh` | Public; refresh token required |
| POST | `/v1/auth/logout` | Public; refresh token required |
| POST | `/v1/auth/accept-worker-invitation` | Public; single-use invitation |
| GET | `/v1/auth/me` | Authenticated |
| GET | `/v1/auth/worker/assigned-areas` | Community health worker only |
| POST | `/v1/auth/admin/worker-invitations` | Platform administrator only |

## Local Windows setup
Run commands from PowerShell. Keep Docker Desktop running.

```powershell
# From the repository root
Copy-Item .env.example .env
```

Edit `.env`: replace `JWT_ACCESS_SECRET` and `OTP_PEPPER` with two different random 48-byte hex strings. Leave `PRIVACY_NOTICE_VERSION=dev-draft-v1` for local testing only. Generate each with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Keep `DEV_OTP_MODE=true` only for local development. Then:

```powershell
docker compose -f infra/docker-compose.yml up -d
cd services/api
npm install
npm run db:migrate
npm run db:seed:demo
npm run dev
```

The seed creates fictional `Demo State / Demo District / Demo Block / Demo Village` records. These are not real service locations.

## Patient registration smoke test (PowerShell)
Open a second terminal at the repository root. The API terminal prints the development OTP for the fictional phone below.

```powershell
$base = "http://localhost:4000"
$areaResponse = Invoke-RestMethod -Uri "$base/v1/service-areas?level=village"
$area = $areaResponse.serviceAreas | Select-Object -First 1
$body = @{
  displayName = "Demo Patient"
  phoneE164 = "+12025550123"
  password = "DemoPass123!Secure"
  preferredLocale = "en"
  homeServiceAreaId = $area.id
  privacyNoticeAccepted = $true
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/v1/auth/register/patient" -ContentType "application/json" -Body $body
```

Use the OTP printed in the API terminal:

```powershell
$otp = Read-Host "Enter the development OTP"
$verify = @{ phoneE164 = "+12025550123"; code = $otp } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/v1/auth/verify-phone" -ContentType "application/json" -Body $verify

$loginBody = @{ phoneE164 = "+12025550123"; password = "DemoPass123!Secure" } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$base/v1/auth/login" -ContentType "application/json" -Body $loginBody
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod -Uri "$base/v1/auth/me" -Headers $headers
```

The number above is a fictional test number. Do not substitute a real patient's details in local development.

## Bootstrap an administrator (optional; one time only)
Only an authorised operator should do this. Independently verify control of the administrator phone first. Add these temporary values to root `.env`:

```dotenv
BOOTSTRAP_ADMIN_PHONE=+12025550124
BOOTSTRAP_ADMIN_PASSWORD=Use-A-Different-Strong-Local-Secret
BOOTSTRAP_ADMIN_NAME=Local Demo Administrator
BOOTSTRAP_ADMIN_PHONE_VERIFIED=true
```

Then from `services/api`:

```powershell
npm run admin:bootstrap
```

Remove the bootstrap variables immediately after the command succeeds. The sample phone is fictional and only for local development.

After bootstrap, use the full community health worker invitation smoke test below.

## Before production
- Replace the generic SMS adapter with a contracted, tested provider; never log OTPs.
- Replace the draft notice version with a legally reviewed privacy notice and accessible consent UI.
- Add MFA/stronger authentication for staff and administrators.
- Add account recovery, phone-change verification, device/session management and abuse monitoring.
- Conduct threat modelling, penetration testing, restore drills and independent security review.
- Load only verified official service-area records and enforce operational area approvals.
- Do not enable clinical workflows until clinician governance, legal review and field validation are complete.

## Community health worker invitation smoke test (PowerShell)
Run this after the one-time administrator bootstrap, using the same terminal where `$base` is set. Re-fetch the demo village in case this is a new terminal:

```powershell
$base = "http://localhost:4000"
$areaResponse = Invoke-RestMethod -Uri "$base/v1/service-areas?level=village"
$area = $areaResponse.serviceAreas | Select-Object -First 1
$adminBody = @{ phoneE164 = "+12025550124"; password = "Use-A-Different-Strong-Local-Secret" } | ConvertTo-Json
$adminLogin = Invoke-RestMethod -Method Post -Uri "$base/v1/auth/login" -ContentType "application/json" -Body $adminBody
$adminHeaders = @{ Authorization = "Bearer $($adminLogin.accessToken)" }
$inviteBody = @{ phoneE164 = "+12025550125"; serviceAreaId = $area.id; expiresInHours = 24 } | ConvertTo-Json
$invite = Invoke-RestMethod -Method Post -Uri "$base/v1/auth/admin/worker-invitations" -Headers $adminHeaders -ContentType "application/json" -Body $inviteBody

$workerBody = @{ invitationToken = $invite.invitationToken; displayName = "Demo Worker"; password = "DemoWorkerPass123!"; preferredLocale = "en"; privacyNoticeAccepted = $true } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/v1/auth/accept-worker-invitation" -ContentType "application/json" -Body $workerBody
```

The API terminal prints the OTP for the fictional worker number. Verify and sign in:

```powershell
$workerOtp = Read-Host "Enter the worker development OTP"
$workerVerify = @{ phoneE164 = "+12025550125"; code = $workerOtp } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/v1/auth/verify-phone" -ContentType "application/json" -Body $workerVerify
$workerLoginBody = @{ phoneE164 = "+12025550125"; password = "DemoWorkerPass123!" } | ConvertTo-Json
$workerLogin = Invoke-RestMethod -Method Post -Uri "$base/v1/auth/login" -ContentType "application/json" -Body $workerLoginBody
$workerHeaders = @{ Authorization = "Bearer $($workerLogin.accessToken)" }
Invoke-RestMethod -Uri "$base/v1/auth/worker/assigned-areas" -Headers $workerHeaders
```

Expected access-control checks:
- A patient token calling `/v1/auth/worker/assigned-areas` must receive HTTP `403`.
- After logout revokes a refresh session, the previous access token must receive HTTP `401` on `/v1/auth/me`.

Use only these fictional local accounts and demo areas. Never run this walkthrough with real patient or worker data.
