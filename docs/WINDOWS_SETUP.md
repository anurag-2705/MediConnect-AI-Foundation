# Windows setup (PowerShell)

## Prerequisites
- Git (optional)
- Node.js 22.13+ and npm
- Docker Desktop running
- Python 3.11+ only if running the non-clinical FastAPI boundary
- Expo Go on a phone, or an Android emulator

## 1. Configure environment
Run from the repository root:

```powershell
Copy-Item .env.example .env
```

Generate two different random secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Put one value in `JWT_ACCESS_SECRET` and the other in `OTP_PEPPER` in the root `.env`. Keep development OTP mode enabled only for local fictional test accounts. Never commit `.env`.

## 2. Start local infrastructure

```powershell
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml ps
```

## 3. Start API (Terminal 1)

```powershell
cd services/api
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run db:seed:demo
npm run typecheck
npm run dev
```

API health endpoint: `http://localhost:4000/health`.

## 4. Start mobile app (Terminal 2)

```powershell
cd apps/mobile
Copy-Item .env.example .env
npm install
npx expo install --fix
npx expo-doctor@latest
npx expo start
```

For a physical phone on the same Wi-Fi, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to `http://YOUR_PC_LAN_IPV4:4000` (find the address using `ipconfig`). For Android emulator use `http://10.0.2.2:4000`. Do not use `localhost` on a physical phone.

## 5. Authentication smoke tests
Follow `services/api/README_AUTH.md` for exact PowerShell requests. Use fictional names, test phone numbers and demo geography only. Verify patient registration, OTP verification, login, refresh, logout, and invitation-only worker onboarding. Confirm a worker cannot access an unassigned area.

## 6. Stop services

```powershell
docker compose -f infra/docker-compose.yml down
```

To also delete the local database volume (destructive; removes all local test data):

```powershell
docker compose -f infra/docker-compose.yml down -v
```
