# MediConnect AI — Rural Healthcare Platform

A production-oriented foundation for a multilingual rural healthcare access platform. The intended users are rural patients and community health workers, using smartphones across a large service area.

**This repository is not a clinically validated or production-ready medical system. Do not enter real patient information.** Clinical functions remain disabled.

## What is implemented in this milestone
- React Native / Expo smartphone app with Hindi/English development UI, patient registration, phone OTP verification, sign-in, secure refresh-token storage, worker invitation acceptance and assigned-area display.
- TypeScript / Express API with password hashing, OTP verification, access/refresh tokens, token rotation, logout revocation, role checks, rate limits and audit events.
- PostgreSQL schema for service-area hierarchy, users, worker assignments, invitations, OTP challenges, sessions, consent acknowledgements and audit events.
- Worker onboarding is administrator-invitation-only; workers cannot self-assign a role or service area.
- Fictional demo geography for local testing only.
- Separate FastAPI boundary remains non-clinical.

## What is not implemented
- No patient medical record, diagnosis, prescription, autonomous triage or clinical decision support.
- No doctor booking, teleconsultation, pharmacy stock, ambulance dispatch or emergency-service integration.
- No production SMS provider, legal privacy notice, verified clinician/facility dataset or field deployment.

## Repository layout
- `apps/mobile` — React Native / Expo smartphone app
- `services/api` — TypeScript API and authentication
- `services/api/migrations` — PostgreSQL schema
- `services/api/scripts` — migration, fictional demo seed and one-time admin bootstrap
- `services/ai` — FastAPI non-clinical service boundary
- `infra` — local PostgreSQL and Redis
- `docs` — architecture, safety, privacy, rollout and go-live gates

## Local Windows setup
Use PowerShell. Install Docker Desktop and start it before running the database.

1. At the repository root, copy `.env.example` to `.env`.
2. Generate two different secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste the first into `JWT_ACCESS_SECRET` and the second into `OTP_PEPPER`. Keep `DEV_OTP_MODE=true` only for local development with fictional test accounts.

3. Start PostgreSQL and Redis:

```powershell
docker compose -f infra/docker-compose.yml up -d
```

4. Install and start the API:

```powershell
cd services/api
npm install
npm run db:migrate
npm run db:seed:demo
npm run dev
```

API health check: `http://localhost:4000/health`.

5. In another terminal, start the mobile app:

```powershell
cd apps/mobile
npm install
npx expo install --fix
npx expo start
```

For a physical Android/iPhone on the same Wi-Fi, copy `apps/mobile/.env.example` to `apps/mobile/.env`, then set `EXPO_PUBLIC_API_URL` to your computer's LAN IPv4 address. Find it with `ipconfig` and use a value such as `http://192.168.1.5:4000`. For the Android emulator use `http://10.0.2.2:4000`. `localhost` on a physical phone means the phone itself, not your computer. Allow the API port through Windows Firewall only on your private development network.

The mobile project targets Expo SDK 58, React Native 0.88 and React 19.3. The current Expo compatibility table lists Node 22.13+ as the minimum; the user's previously reported Node 26.13.0 meets that minimum. Run `npx expo-doctor@latest` after install.

## Authentication and local test walkthrough
Read `services/api/README_AUTH.md` for exact PowerShell smoke-test commands, patient registration/OTP/login, optional admin bootstrap and invitation-only community health worker onboarding.

The local seed creates `Demo State / Demo District / Demo Block / Demo Village`; these are fictional records, not a real launch geography. In development, OTP codes are printed in the API terminal. Do not use real patient details.

## AI service

```powershell
cd services/ai
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The AI service currently exposes health/readiness and a disabled translation-provider placeholder. It does not process symptoms or provide medical guidance.

## Before any real pilot
Complete `docs/GO_LIVE_GATES.md`, confirm the deployment geography and launch languages, secure written local implementation partnerships, approve clinical workflows with qualified clinicians, complete India-specific legal/privacy review, integrate a contracted SMS provider, verify all providers/facilities, and conduct independent security and field testing.
