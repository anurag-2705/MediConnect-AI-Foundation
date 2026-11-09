import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { authenticate, requireRole, assertWorkerAreaAccess } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/me', async (req, res) => {
  const result = await query(`SELECT u.id, u.phone, u.role, u.status, p.display_name, p.preferred_language, p.service_area_id
    FROM users u LEFT JOIN patient_profiles p ON p.user_id=u.id WHERE u.id=$1`, [req.auth!.userId]);
  res.json({ user: result.rows[0] ?? null });
});

router.put('/patient-profile', requireRole('patient'), async (req, res) => {
  const parsed = z.object({ displayName: z.string().trim().min(2).max(120), preferredLanguage: z.string().trim().min(2).max(16), serviceAreaId: z.string().uuid().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid profile', details: parsed.error.flatten() });
  const { displayName, preferredLanguage, serviceAreaId } = parsed.data;
  if (serviceAreaId) {
    const area = await query('SELECT 1 FROM service_areas WHERE id=$1 AND is_active=true', [serviceAreaId]);
    if (!area.rowCount) return res.status(400).json({ error: 'Unknown or inactive service area' });
  }
  const result = await query(`INSERT INTO patient_profiles(user_id,display_name,preferred_language,service_area_id)
    VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name,
    preferred_language=EXCLUDED.preferred_language, service_area_id=EXCLUDED.service_area_id, updated_at=now()
    RETURNING user_id,display_name,preferred_language,service_area_id`, [req.auth!.userId, displayName, preferredLanguage, serviceAreaId ?? null]);
  res.json({ profile: result.rows[0] });
});

router.get('/facilities', async (req, res) => {
  const areaId = typeof req.query.serviceAreaId === 'string' ? req.query.serviceAreaId : undefined;
  if (areaId && !z.string().uuid().safeParse(areaId).success) return res.status(400).json({ error: 'Invalid serviceAreaId' });
  if (req.auth!.role === 'community_health_worker' && areaId && !(await assertWorkerAreaAccess(req.auth!.userId, areaId))) return res.status(403).json({ error: 'Outside assigned service area' });
  const result = await query(`SELECT f.id,f.name,f.facility_type,f.address,f.phone,f.service_area_id
    FROM facilities f WHERE f.is_active=true AND f.is_verified=true AND ($1::uuid IS NULL OR f.service_area_id=$1)
    ORDER BY f.name LIMIT 100`, [areaId ?? null]);
  res.json({ facilities: result.rows });
});

router.post('/appointment-requests', requireRole('patient','community_health_worker'), async (req, res) => {
  const parsed = z.object({ patientUserId: z.string().uuid().optional(), facilityId: z.string().uuid().optional(), requestedDate: z.string().date().optional(), preferredPeriod: z.enum(['morning','afternoon','evening','any']).default('any'), purposeLabel: z.string().trim().min(2).max(100).default('General appointment request') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  const patientId = req.auth!.role === 'patient' ? req.auth!.userId : parsed.data.patientUserId;
  if (!patientId) return res.status(400).json({ error: 'patientUserId is required for health-worker requests' });
  const patient = await query(`SELECT u.id,p.service_area_id FROM users u LEFT JOIN patient_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.role='patient' AND u.status='active'`, [patientId]);
  if (!patient.rowCount) return res.status(404).json({ error: 'Patient account not found' });
  if (req.auth!.role === 'community_health_worker') {
    const areaId = patient.rows[0].service_area_id;
    if (!areaId || !(await assertWorkerAreaAccess(req.auth!.userId, areaId))) return res.status(403).json({ error: 'Patient is outside assigned service area' });
  }
  if (parsed.data.facilityId) {
    const facility = await query('SELECT 1 FROM facilities WHERE id=$1 AND is_active=true AND is_verified=true', [parsed.data.facilityId]);
    if (!facility.rowCount) return res.status(400).json({ error: 'Facility unavailable' });
  }
  const result = await query(`INSERT INTO appointment_requests(patient_user_id,facility_id,requested_by_user_id,requested_date,preferred_period,purpose_label)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status,created_at`, [patientId, parsed.data.facilityId ?? null, req.auth!.userId, parsed.data.requestedDate ?? null, parsed.data.preferredPeriod, parsed.data.purposeLabel]);
  res.status(201).json({ request: result.rows[0], notice: 'This is an administrative appointment request, not clinical triage or emergency support.' });
});

router.get('/appointment-requests', requireRole('patient', 'community_health_worker', 'platform_admin'), async (req, res) => {
  const patientId = req.auth!.role === 'patient' ? req.auth!.userId : (typeof req.query.patientUserId === 'string' ? req.query.patientUserId : undefined);
if (req.auth!.role !== 'platform_admin' && !patientId) return res.status(400).json({ error: 'patientUserId is required' });
  if (req.auth!.role === 'community_health_worker' && patientId) {
    const p = await query('SELECT service_area_id FROM patient_profiles WHERE user_id=$1', [patientId]);
    if (!p.rowCount || !p.rows[0].service_area_id || !(await assertWorkerAreaAccess(req.auth!.userId, p.rows[0].service_area_id))) return res.status(403).json({ error: 'Outside assigned service area' });
  }
  const result = await query(`SELECT a.id,a.patient_user_id,a.facility_id,a.requested_date,a.preferred_period,a.purpose_label,a.status,a.created_at,f.name AS facility_name
    FROM appointment_requests a LEFT JOIN facilities f ON f.id=a.facility_id
    WHERE ($1::uuid IS NULL OR a.patient_user_id=$1) ORDER BY a.created_at DESC LIMIT 100`, [patientId ?? null]);
  res.json({ requests: result.rows });
});

export default router;
