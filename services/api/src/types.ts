import { AccessRole } from "./lib/security";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionId: string; role: AccessRole };
    }
  }
}

export {};
