# MediConnect AI architecture

## Product objective
Improve access to verified healthcare services for rural communities through a smartphone-first,
multilingual, low-bandwidth platform used by both patients and community health workers.

## System shape
1. Mobile client: React Native / Expo. Patient and health-worker experiences share a design system,
   but permissions and available actions differ by role. Refresh tokens are stored in device secure storage.
2. API: TypeScript / Express modular monolith. Owns identity, consent acknowledgements, service-area
   scoping, audit events and future appointment/referral/provider modules.
3. AI service: Python / FastAPI. Isolated behind an internal API boundary. Initial release supports
   readiness and a disabled translation-provider placeholder only. It must not produce diagnoses,
   prescriptions, medication doses, clinical triage or reassurance that urgent care is unnecessary.
4. Data: PostgreSQL for transactional records; Redis is reserved for queues/rate-limit state.
   Private object storage is deferred until retention, encryption and access policies exist.
5. Integrations: SMS/push, maps, video, ABDM or public health systems only after provider review,
   contractual approval, security assessment and official integration access.

## Deployment topology
Use a modular monolith for the first controlled pilot. Deploy API and AI service separately.
Use managed PostgreSQL with encryption, backups and point-in-time recovery; private networking;
centralised logs with sensitive fields redacted; monitoring and alerting. Add read replicas,
regional deployment or service extraction only when measured scale and availability needs justify it.

## Geography and authorization
Model the hierarchy as State -> District -> Block -> Village. Every worker assignment is explicit.
Patient self-registration selects an active village; worker registration is invitation-only and binds
an assignment to a specific service area. The API resolves roles from PostgreSQL and verifies the
active session on authenticated requests. Future patient-data endpoints must enforce patient ownership
or an active worker assignment on the server; never trust a client-supplied area ID alone.

## Core bounded modules
- Identity, roles, sessions and consent acknowledgements
- Patient profile and caregiver relationship (future)
- Community health worker workspace
- Verified clinician and facility directory (future)
- Appointment and teleconsultation coordination (future)
- Referral and follow-up workflow (future)
- Medicine availability directory (future; stock timestamp + pharmacy verification)
- Multilingual content and accessibility
- Audit, privacy requests and operational analytics

## Offline strategy
Cache public educational content and app shell. Queue low-risk administrative actions with idempotency
keys and explicit sync status. Do not cache clinical records or sensitive documents by default.
For shared devices, provide logout, session expiry and a clear local-data removal action.
