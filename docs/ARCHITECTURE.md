# MediConnect AI architecture

## Product objective
Improve access to verified healthcare services for rural communities through a smartphone-first,
multilingual, low-bandwidth platform used by both patients and community health workers.

## System shape
1. Mobile client: React Native / Expo. Patient and health-worker experiences share a design system,
   but permissions and available actions differ by role.
2. API: TypeScript service. Owns identity, consent, service-area scoping, appointment coordination,
   referrals, audit events and provider/facility directories.
3. AI service: Python / FastAPI. Isolated behind an internal API boundary. Initial release supports
   language assistance and structured intake only. It must not produce diagnoses, prescriptions,
   medication doses, or reassurance that urgent care is unnecessary.
4. Data: PostgreSQL for transactional records; Redis for queues, rate limits and short-lived state.
   Private object storage for documents only after retention, encryption and access policies exist.
5. Integrations: SMS/push, maps, video, ABDM or public health systems only after provider review,
   contractual approval, security assessment and official integration access.

## Deployment topology
Use a modular monolith for the first production pilot. Deploy API and AI service separately.
Use managed PostgreSQL with encryption, backups and point-in-time recovery; private networking;
centralised logs with sensitive fields redacted; monitoring and alerting. Add read replicas,
regional deployment or service extraction only when measured scale and availability needs justify it.

## Tenant and geography model
Every operational record must be scoped to a service area. Model the hierarchy as:
State -> District -> Block -> Village -> Facility / outreach team.
A central administrator may have cross-area access; local staff only see assigned areas.
Do not treat a village name or phone number as a secure authorization boundary.

## Core bounded modules
- Identity, roles and consent
- Patient profile and caregiver relationship
- Community health worker workspace
- Verified clinician and facility directory
- Appointment and teleconsultation coordination
- Referral and follow-up workflow
- Medicine availability directory (availability timestamp + pharmacy verification)
- Multilingual content and accessibility
- Audit, privacy requests and operational analytics

## Offline strategy
Cache public educational content and app shell. Queue low-risk administrative actions with idempotency
keys and explicit sync status. Do not cache clinical records or sensitive documents by default.
For shared devices, provide logout, session expiry and a clear local-data removal action.
