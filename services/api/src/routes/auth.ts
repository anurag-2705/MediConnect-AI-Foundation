import { randomUUID } from "node:crypto";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { inTransaction, query } from "../db";
import { config } from "../config";
import { audit } from "../lib/audit";
import {
  createInvitationToken, createOtp, createRefreshToken, hashOtp, hashPassword,
  hashRefreshToken, safeHexEqual, signAccessToken, verifyPassword
} from "../lib/security";
import { sendOtpSms } from "../lib/sms";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use phone format with country code, e.g. +919876543210");
const passwordSchema = z.string().min(12).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be no more than 72 UTF-8 bytes");
const localeSchema = z.string().min(2).max(20).default("hi");

const patientRegistrationSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  phoneE164: phoneSchema,
  password: passwordSchema,
  preferredLocale: localeSchema,
  homeServiceAreaId: z.string().uuid(),
  privacyNoticeAccepted: z.literal(true)
});

const verifySchema = z.object({ phoneE164: phoneSchema, code: z.string().regex(/^\d{6}$/) });
const loginSchema = z.object({ phoneE164: phoneSchema, password: z.string().min(1).max(72) });
const refreshSchema = z.object({ refreshToken: z.string().min(40).max(120) });
const inviteSchema = z.object({
  phoneE164: phoneSchema,
  serviceAreaId: z.string().uuid(),
  expiresInHours: z.number().int().min(1).max(72).default(24)
});
const acceptInviteSchema = z.object({
  invitationToken: z.string().min(32).max(100),
  displayName: z.string().trim().min(2).max(120),
  password: passwordSchema,
  preferredLocale: localeSchema,
  privacyNoticeAccepted: z.literal(true)
});

async function issueOtp(userId: string, phoneE164: string): Promise<void> {
  const code = createOtp();
  await inTransaction(async (client) => {
    await client.query(
      `UPDATE otp_challenges SET consumed_at = now()
       WHERE user_id = $1 AND purpose = 'verify_phone' AND consumed_at IS NULL`,
      [userId]
    );
    await client.query(
      `INSERT INTO otp_challenges (id, user_id, purpose, otp_hash, expires_at)
       VALUES ($1, $2, 'verify_phone', $3, now() + interval '5 minutes')`,
      [randomUUID(), userId, hashOtp(code)]
    );
  });
  await sendOtpSms(phoneE164, code);
}

function validationError(res: Response, error: z.ZodError): void {
  res.status(400).json({ error: "Invalid request", details: error.flatten() });
}

router.post("/register/patient", async (req: Request, res: Response) => {
  const parsed = patientRegistrationSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const body = parsed.data;

  try {
    const area = await query<{ id: string }>(
      "SELECT id FROM service_areas WHERE id = $1 AND is_active = true AND level = 'village'",
      [body.homeServiceAreaId]
    );
    if (!area.rows[0]) return res.status(400).json({ error: "Select an active village service area" });

    const passwordHash = await hashPassword(body.password);
    const userId = randomUUID();
    const code = createOtp();
    const created = await inTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (id, display_name, phone_e164, password_hash, role, status, preferred_locale, home_service_area_id)
         VALUES ($1, $2, $3, $4, 'patient', 'pending_verification', $5, $6)
         ON CONFLICT (phone_e164) DO NOTHING RETURNING id`,
        [userId, body.displayName, body.phoneE164, passwordHash, body.preferredLocale, body.homeServiceAreaId]
      );
      if (!inserted.rows[0]) return false;
      await client.query(
        `INSERT INTO otp_challenges (id, user_id, purpose, otp_hash, expires_at)
         VALUES ($1, $2, 'verify_phone', $3, now() + interval '5 minutes')`,
        [randomUUID(), userId, hashOtp(code)]
      );
      await client.query(
        `INSERT INTO consent_records (id, user_id, purpose, notice_version, source)
         VALUES ($1, $2, 'account_registration_notice', $3, 'mobile_app')`,
        [randomUUID(), userId, config.PRIVACY_NOTICE_VERSION]
      );
      await audit(client, {
        action: "patient.registration_started", targetType: "user", targetId: userId,
        serviceAreaId: body.homeServiceAreaId
      });
      // Keep account, OTP and acknowledgement atomic if delivery is unavailable.
      await sendOtpSms(body.phoneE164, code);
      return true;
    });

    if (!created) {
      // Avoid revealing whether a phone number already has an account.
      return res.status(202).json({ message: "If this number can be registered, verification instructions will be sent." });
    }
    return res.status(202).json({ message: "Verification code sent. Verify your phone before signing in." });
  } catch (error) {
    console.error("Patient registration failed:", error);
    return res.status(503).json({ error: "Registration is temporarily unavailable. Please try again later." });
  }
});

router.post("/resend-verification", async (req: Request, res: Response) => {
  const parsed = z.object({ phoneE164: phoneSchema }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const user = await query<{ id: string; phone_e164: string }>(
    `SELECT id, phone_e164 FROM users
     WHERE phone_e164 = $1 AND status = 'pending_verification' AND phone_verified_at IS NULL`,
    [parsed.data.phoneE164]
  );
  if (user.rows[0]) {
    try { await issueOtp(user.rows[0].id, user.rows[0].phone_e164); }
    catch (error) { console.error("OTP resend failed:", error); }
  }
  return res.status(202).json({ message: "If verification is pending for this number, a new code will be sent." });
});

router.post("/verify-phone", async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const { phoneE164, code } = parsed.data;

  try {
    const outcome = await inTransaction(async (client) => {
      const result = await client.query<{ challenge_id: string; user_id: string; otp_hash: string; attempts: number }>(
        `SELECT o.id AS challenge_id, o.user_id, o.otp_hash, o.attempts
         FROM otp_challenges o JOIN users u ON u.id = o.user_id
         WHERE u.phone_e164 = $1 AND u.status = 'pending_verification'
           AND o.purpose = 'verify_phone' AND o.consumed_at IS NULL AND o.expires_at > now()
         ORDER BY o.created_at DESC LIMIT 1 FOR UPDATE OF o`,
        [phoneE164]
      );
      const challenge = result.rows[0];
      if (!challenge) return { ok: false as const, reason: "invalid" };
      if (challenge.attempts >= 5) return { ok: false as const, reason: "locked" };

      if (!safeHexEqual(challenge.otp_hash, hashOtp(code))) {
        await client.query("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1", [challenge.challenge_id]);
        return { ok: false as const, reason: "invalid" };
      }

      await client.query("UPDATE otp_challenges SET consumed_at = now() WHERE id = $1", [challenge.challenge_id]);
      await client.query(
        "UPDATE users SET phone_verified_at = now(), status = 'active', updated_at = now() WHERE id = $1",
        [challenge.user_id]
      );
      await audit(client, { action: "user.phone_verified", targetType: "user", targetId: challenge.user_id });
      return { ok: true as const };
    });

    if (!outcome.ok) return res.status(outcome.reason === "locked" ? 429 : 400).json({ error: "Code is invalid, expired, or has reached its attempt limit" });
    return res.json({ verified: true, message: "Phone verified. You can now sign in." });
  } catch (error) {
    console.error("Phone verification failed:", error);
    return res.status(503).json({ error: "Verification is temporarily unavailable" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const { phoneE164, password } = parsed.data;

  try {
    const result = await query<{
      id: string; password_hash: string; role: "patient" | "community_health_worker" | "clinician" | "platform_admin";
      status: string; phone_verified_at: Date | null; locked_until: Date | null;
    }>(
      `SELECT id, password_hash, role, status, phone_verified_at, locked_until
       FROM users WHERE phone_e164 = $1`, [phoneE164]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "Phone number or password is incorrect" });
    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      return res.status(423).json({ error: "Account temporarily locked. Try again later." });
    }
    const passwordOk = await verifyPassword(password, user.password_hash);
    if (!passwordOk) {
      await query(
        `UPDATE users SET failed_login_count = failed_login_count + 1,
         locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
         updated_at = now() WHERE id = $1`, [user.id]
      );
      return res.status(401).json({ error: "Phone number or password is incorrect" });
    }
    if (user.status !== "active" || !user.phone_verified_at) {
      return res.status(403).json({ error: "Verify your phone before signing in" });
    }

    const sessionId = randomUUID();
    const refreshToken = createRefreshToken();
    await inTransaction(async (client) => {
      await client.query("UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = now() WHERE id = $1", [user.id]);
      await client.query(
        `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at)
         VALUES ($1, $2, $3, now() + ($4::text || ' days')::interval)`,
        [sessionId, user.id, hashRefreshToken(refreshToken), config.REFRESH_TOKEN_DAYS]
      );
      await audit(client, { actorUserId: user.id, action: "auth.login_succeeded", targetType: "auth_session", targetId: sessionId });
    });
    return res.json({
      accessToken: signAccessToken({ userId: user.id, sessionId, role: user.role }),
      refreshToken,
      tokenType: "Bearer",
      expiresInSeconds: 900,
      role: user.role
    });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(503).json({ error: "Sign-in is temporarily unavailable" });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const oldHash = hashRefreshToken(parsed.data.refreshToken);
  const newRefreshToken = createRefreshToken();
  const newSessionId = randomUUID();

  try {
    const result = await inTransaction(async (client) => {
      const sessionResult = await client.query<{
        id: string; user_id: string; role: "patient" | "community_health_worker" | "clinician" | "platform_admin";
      }>(
        `SELECT s.id, s.user_id, u.role FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.refresh_token_hash = $1 AND s.revoked_at IS NULL
           AND s.expires_at > now() AND u.status = 'active'
         FOR UPDATE OF s`, [oldHash]
      );
      const session = sessionResult.rows[0];
      if (!session) return null;
      await client.query(
        `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at)
         VALUES ($1, $2, $3, now() + ($4::text || ' days')::interval)`,
        [newSessionId, session.user_id, hashRefreshToken(newRefreshToken), config.REFRESH_TOKEN_DAYS]
      );
      await client.query("UPDATE auth_sessions SET revoked_at = now(), replaced_by_session_id = $2 WHERE id = $1", [session.id, newSessionId]);
      return { userId: session.user_id, role: session.role };
    });
    if (!result) return res.status(401).json({ error: "Refresh token is invalid or expired" });
    return res.json({
      accessToken: signAccessToken({ userId: result.userId, sessionId: newSessionId, role: result.role }),
      refreshToken: newRefreshToken,
      tokenType: "Bearer",
      expiresInSeconds: 900
    });
  } catch (error) {
    console.error("Token refresh failed:", error);
    return res.status(503).json({ error: "Session refresh is temporarily unavailable" });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  await query("UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL", [hashRefreshToken(parsed.data.refreshToken)]);
  return res.status(204).send();
});

router.post("/accept-worker-invitation", async (req: Request, res: Response) => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const body = parsed.data;
  const tokenHash = hashRefreshToken(body.invitationToken);

  try {
    const invitation = await query<{ id: string; phone_e164: string; service_area_id: string }>(
      `SELECT id, phone_e164, service_area_id FROM worker_invitations
       WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()`, [tokenHash]
    );
    const invite = invitation.rows[0];
    if (!invite) return res.status(400).json({ error: "Invitation is invalid or expired" });
    const userId = randomUUID();
    const passwordHash = await hashPassword(body.password);
    const code = createOtp();

    await inTransaction(async (client) => {
      const locked = await client.query(
        `SELECT id FROM worker_invitations WHERE id = $1 AND accepted_at IS NULL AND expires_at > now() FOR UPDATE`,
        [invite.id]
      );
      if (!locked.rows[0]) throw new Error("Invitation already used");
      await client.query(
        `INSERT INTO users (id, display_name, phone_e164, password_hash, role, status, preferred_locale)
         VALUES ($1, $2, $3, $4, 'community_health_worker', 'pending_verification', $5)`,
        [userId, body.displayName, invite.phone_e164, passwordHash, body.preferredLocale]
      );
      await client.query(
        `INSERT INTO worker_area_assignments (id, user_id, service_area_id, assigned_by)
         VALUES ($1, $2, $3, (SELECT created_by FROM worker_invitations WHERE id = $4))`,
        [randomUUID(), userId, invite.service_area_id, invite.id]
      );
      await client.query("UPDATE worker_invitations SET accepted_at = now() WHERE id = $1", [invite.id]);
      await client.query(
        `INSERT INTO otp_challenges (id, user_id, purpose, otp_hash, expires_at)
         VALUES ($1, $2, 'verify_phone', $3, now() + interval '5 minutes')`,
        [randomUUID(), userId, hashOtp(code)]
      );
      await client.query(
        `INSERT INTO consent_records (id, user_id, purpose, notice_version, source)
         VALUES ($1, $2, 'staff_account_notice', $3, 'mobile_app')`,
        [randomUUID(), userId, config.PRIVACY_NOTICE_VERSION]
      );
      await audit(client, { actorUserId: userId, action: "worker.invitation_accepted", targetType: "user", targetId: userId, serviceAreaId: invite.service_area_id });
      await sendOtpSms(invite.phone_e164, code);
    });
    return res.status(202).json({ message: "Invitation accepted. Verify the invited phone number before signing in.", phoneE164: invite.phone_e164 });
  } catch (error) {
    console.error("Worker invitation acceptance failed:", error);
    return res.status(400).json({ error: "Invitation could not be accepted. Contact your platform administrator." });
  }
});

router.post("/resend-worker-verification", async (req: Request, res: Response) => {
  const parsed = z.object({ phoneE164: phoneSchema }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const user = await query<{ id: string; phone_e164: string }>(
    `SELECT id, phone_e164 FROM users WHERE phone_e164 = $1
     AND role = 'community_health_worker' AND status = 'pending_verification'`, [parsed.data.phoneE164]
  );
  if (user.rows[0]) {
    try { await issueOtp(user.rows[0].id, user.rows[0].phone_e164); }
    catch (error) { console.error("Worker OTP resend failed:", error); }
  }
  return res.status(202).json({ message: "If worker verification is pending, a new code will be sent." });
});

router.get("/me", authenticate, async (req: Request, res: Response) => {
  const result = await query<{
    id: string; display_name: string; phone_e164: string; role: string; preferred_locale: string;
    home_service_area_id: string | null; area_name: string | null; area_level: string | null;
  }>(
    `SELECT u.id, u.display_name, u.phone_e164, u.role, u.preferred_locale,
            u.home_service_area_id, sa.name AS area_name, sa.level AS area_level
     FROM users u LEFT JOIN service_areas sa ON sa.id = u.home_service_area_id
     WHERE u.id = $1`, [req.auth!.userId]
  );
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: "Account not found" });
  return res.json({
    id: user.id, displayName: user.display_name, phoneE164: user.phone_e164,
    role: user.role, preferredLocale: user.preferred_locale,
    homeServiceArea: user.home_service_area_id ? { id: user.home_service_area_id, name: user.area_name, level: user.area_level } : null
  });
});

router.get("/worker/assigned-areas", authenticate, requireRole("community_health_worker"), async (req: Request, res: Response) => {
  const result = await query(
    `SELECT sa.id, sa.name, sa.level, sa.code, sa.parent_id
     FROM worker_area_assignments waa JOIN service_areas sa ON sa.id = waa.service_area_id
     WHERE waa.user_id = $1 AND waa.starts_at <= now() AND (waa.ends_at IS NULL OR waa.ends_at > now())
       AND sa.is_active = true
     ORDER BY sa.level, sa.name`, [req.auth!.userId]
  );
  return res.json({ areas: result.rows });
});

router.post("/admin/worker-invitations", authenticate, requireRole("platform_admin"), async (req: Request, res: Response) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const body = parsed.data;
  const area = await query("SELECT id FROM service_areas WHERE id = $1 AND is_active = true", [body.serviceAreaId]);
  if (!area.rows[0]) return res.status(400).json({ error: "Service area does not exist or is inactive" });

  const token = createInvitationToken();
  const invitationId = randomUUID();
  try {
    await inTransaction(async (client) => {
      await client.query(
        `INSERT INTO worker_invitations (id, phone_e164, token_hash, service_area_id, created_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + ($6::text || ' hours')::interval)`,
        [invitationId, body.phoneE164, hashRefreshToken(token), body.serviceAreaId, req.auth!.userId, body.expiresInHours]
      );
      await audit(client, { actorUserId: req.auth!.userId, action: "worker.invitation_created", targetType: "worker_invitation", targetId: invitationId, serviceAreaId: body.serviceAreaId });
    });
    // The raw invitation token is returned once to the authenticated administrator for secure out-of-band delivery.
    return res.status(201).json({ invitationId, invitationToken: token, expiresInHours: body.expiresInHours, delivery: "administrator_must_share_securely" });
  } catch (error) {
    console.error("Worker invitation creation failed:", error);
    return res.status(503).json({ error: "Invitation could not be created" });
  }
});

export default router;
