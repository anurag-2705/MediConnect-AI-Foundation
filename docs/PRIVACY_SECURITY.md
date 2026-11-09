# Privacy and security baseline

This is an engineering checklist, not legal advice.

- Complete a data inventory and purpose map before collecting personal or health data.
- Collect the minimum data necessary for a clearly stated purpose.
- Provide clear, accessible notices and consent flows; support withdrawal and applicable user rights.
- Define retention and deletion schedules before launch.
- Encrypt data in transit and at rest; use managed secrets, never commit keys.
- Enforce role-based and service-area-based authorization on the server for every request.
- Require strong staff authentication; consider MFA for privileged roles.
- Record access to sensitive records in tamper-resistant audit logs; redact sensitive values from logs.
- Use secure session handling, rate limiting, input validation and dependency scanning.
- Establish incident response, breach assessment/notification procedures and backup restoration tests.
- Do not use production patient data in development, analytics, model training or demos without a
  separately reviewed lawful basis and safeguards.
- Conduct independent security testing before pilot.

Review the Digital Personal Data Protection Act, 2023 and notified Rules, 2025, including their
phased commencement provisions, with Indian privacy counsel. Also assess applicable health-sector,
medical-record, telemedicine and ABDM requirements.
