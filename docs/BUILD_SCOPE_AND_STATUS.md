# MediConnect AI — Build scope and verified status

## Current code included
This package contains the existing runnable foundation for the first implementation milestone:
- Expo/React Native smartphone application (`apps/mobile`)
- Express + TypeScript API (`services/api`)
- PostgreSQL initial schema and migration (`services/api/migrations`)
- Patient registration/login, OTP verification, refresh-token rotation and logout
- Invitation-only community health worker onboarding and role checks
- Service-area hierarchy and worker assignment scoping
- Audit events, local demo seed, administrator bootstrap script
- FastAPI non-clinical service boundary (`services/ai`)
- Docker Compose for local PostgreSQL and Redis

## Not yet built
The following are future milestones, not features to assume exist: complete doctor portal, clinical record system, teleconsultation, pharmacy integration, production voice transcription/translation, offline sync conflict resolution, production analytics and deployment infrastructure.

## Configuration decisions intentionally left open
Do not hard-code a real state, district, block, village, or language set until the project owner confirms the initial geography and launch languages. The demo seed uses fictional labels only.

## Safety boundary
This is a software development foundation, not a validated healthcare product. Use fictional data only. No autonomous diagnosis, prescribing, clinical triage, emergency dispatch, or clinical decision support is enabled. Any clinical workflow requires qualified clinical ownership, validation, regulatory/legal review and partner approval before implementation or use.

## Verification disclosure
The ZIP contents and project files were inspected. This packaging step does not establish that npm dependencies install, migrations execute, services start, or end-to-end flows pass on the user's Windows machine. Those checks must be run locally using `docs/WINDOWS_SETUP.md`.
