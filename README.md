# MediConnect AI — Rural Healthcare Platform

A production-oriented foundation for a multilingual rural healthcare access platform.
This repository is a **development foundation, not a clinically validated or production-ready medical system**.

## First milestone
- Smartphone app shell (Expo / React Native)
- TypeScript API service
- Separate Python AI-service boundary (non-diagnostic placeholder only)
- PostgreSQL + Redis local infrastructure
- Architecture, safety, privacy and rollout documentation

## Important safety boundary
Do not enter real patient information into this starter. The AI endpoint does not diagnose, prescribe,
triage, or determine that a patient is safe. Clinical workflows require qualified clinical governance,
verified providers, legal review, security testing, and field validation before any patient deployment.

## Repository layout
- `apps/mobile` — React Native / Expo app
- `services/api` — TypeScript API
- `services/ai` — FastAPI service boundary; no clinical decision logic
- `infra` — local PostgreSQL and Redis
- `docs` — architecture, safeguards, rollout and open decisions

## Run the API locally
Requirements: Node.js LTS and npm.

```bash
cd services/api
npm install
npm run dev
```

Health check: `http://localhost:4000/health`

## Run the AI service locally
Requirements: Python 3.11+ and pip.

```bash
cd services/ai
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check: `http://localhost:8000/health`

## Start local infrastructure
Install Docker Desktop, then from the repository root:

```bash
docker compose -f infra/docker-compose.yml up -d
```

## Mobile app
Install Node.js LTS and Expo Go on a test phone. Then:

```bash
cd apps/mobile
npm install
npx expo start
```

The mobile shell currently demonstrates navigation and language selection only. It does not collect or transmit health data.

## Before any pilot
Complete `docs/GO_LIVE_GATES.md`. Obtain written approval from qualified clinicians and local implementation partners.
