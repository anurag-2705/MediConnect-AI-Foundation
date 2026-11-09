import { randomUUID } from "node:crypto";
import { hashPassword } from "../src/lib/security";
import { pool } from "../src/db";

async function main() {
  const phone = process.env.BOOTSTRAP_ADMIN_PHONE;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME ?? "Platform Administrator";
  const phoneVerified = process.env.BOOTSTRAP_ADMIN_PHONE_VERIFIED === "true";
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone) || !password || password.length < 12 || !phoneVerified) {
    throw new Error("Set BOOTSTRAP_ADMIN_PHONE (E.164), BOOTSTRAP_ADMIN_PASSWORD (12+ characters), and BOOTSTRAP_ADMIN_PHONE_VERIFIED=true only after independently verifying control of that phone.");
  }
  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    `INSERT INTO users (id, display_name, phone_e164, password_hash, role, status, preferred_locale, phone_verified_at)
     VALUES ($1, $2, $3, $4, 'platform_admin', 'active', 'en', now())
     ON CONFLICT (phone_e164) DO NOTHING RETURNING id`,
    [randomUUID(), name, phone, passwordHash]
  );
  if (!result.rows[0]) throw new Error("An account already exists for this phone. Bootstrap did not modify it.");
  console.log("Platform administrator created. Remove bootstrap credentials from the environment now.");
}

main().catch((error) => {
  console.error("Admin bootstrap failed:", error);
  process.exitCode = 1;
}).finally(async () => pool.end());
