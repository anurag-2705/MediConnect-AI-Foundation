import { NextFunction, Request, Response } from "express";
import { query } from "../db";
import { verifyAccessToken, AccessRole } from "../lib/security";

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const token = header.slice("Bearer ".length).trim();
    const payload = verifyAccessToken(token);
    const result = await query<{ id: string; role: AccessRole; status: string }>(
      `SELECT u.id, u.role, u.status
       FROM users u JOIN auth_sessions s ON s.user_id = u.id
       WHERE u.id = $1 AND s.id = $2 AND s.revoked_at IS NULL AND s.expires_at > now()`,
      [payload.sub, payload.sid]
    );
    const user = result.rows[0];
    if (!user || user.status !== "active") {
      res.status(401).json({ error: "Account is unavailable" });
      return;
    }
    req.auth = { userId: user.id, sessionId: String(payload.sid), role: user.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired access token" });
  }
}

export function requireRole(...roles: AccessRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: "You do not have permission to access this resource" });
      return;
    }
    next();
  };
}

export async function assertWorkerAreaAccess(userId: string, serviceAreaId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM worker_area_assignments
     WHERE user_id = $1 AND service_area_id = $2
       AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`,
    [userId, serviceAreaId]
  );
  return result.rowCount === 1;
}
