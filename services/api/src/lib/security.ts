import { createHmac, createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config";

export type AccessRole = "patient" | "community_health_worker" | "clinician" | "platform_admin";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createOtp(): string {
  return randomInt(100000, 1_000_000).toString();
}

export function hashOtp(code: string): string {
  return createHmac("sha256", config.OTP_PEPPER).update(code).digest("hex");
}

export function safeHexEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function signAccessToken(input: { userId: string; sessionId: string; role: AccessRole }): string {
  return jwt.sign(
    { sub: input.userId, sid: input.sessionId, role: input.role },
    config.JWT_ACCESS_SECRET,
    { expiresIn: "15m", issuer: "mediconnect-api", audience: "mediconnect-mobile" }
  );
}

export function verifyAccessToken(token: string): jwt.JwtPayload {
  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
    issuer: "mediconnect-api",
    audience: "mediconnect-mobile"
  });
  if (typeof decoded === "string" || !decoded.sub || !decoded.sid) throw new Error("Invalid access token");
  return decoded;
}

export function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}
