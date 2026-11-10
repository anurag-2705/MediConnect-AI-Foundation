import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { config } from "./config";
import { pool } from "./db";

import authRoutes from "./routes/auth";
import serviceAreaRoutes from "./routes/serviceAreas";
import doctorRoutes from "./routes/doctors";
import appointmentRoutes from "./routes/appointments";

const app = express();

app.disable("x-powered-by");

if (config.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(helmet());

app.use(
  cors({
    origin: config.corsOrigins.length
      ? config.corsOrigins
      : false,
    credentials: false
  })
);

app.use(express.json({ limit: "16kb" }));

// ========================================
// RATE LIMITING
// ========================================

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(generalLimiter);

// ========================================
// HEALTH CHECK
// ========================================

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      status: "ok",
      service: "mediconnect-api",
      database: "reachable"
    });

  } catch {
    res.status(503).json({
      status: "degraded",
      service: "mediconnect-api",
      database: "unavailable"
    });
  }
});

// ========================================
// PLATFORM CAPABILITIES
// ========================================

app.get("/v1/platform/capabilities", (_req, res) => {
  res.json({
    patientRegistration: "enabled_after_database_migration",
    workerOnboarding: "administrator_invitation_only",
    roleBasedAccess: true,
    serviceAreaScoping: true,
    doctorManagement: "enabled",
    appointments: "enabled",
    teleconsultation: "disabled_until_provider_and_clinical_approval",
    aiClinicalDecisionSupport: "disabled",
    emergencyDispatch: "not_integrated",
    patientMedicalRecords: "not_implemented"
  });
});

// ========================================
// API ROUTES
// ========================================

app.use("/v1/service-areas", serviceAreaRoutes);

app.use("/v1/auth", authLimiter, authRoutes);

app.use("/v1/doctors", doctorRoutes);

app.use("/v1/appointments", appointmentRoutes);

// ========================================
// 404 HANDLER
// ========================================

app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});

// ========================================
// GLOBAL ERROR HANDLER
// ========================================

app.use((
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("Unhandled API error:", error);

  res.status(500).json({
    error: "Internal server error"
  });
});

// ========================================
// START SERVER
// ========================================

const server = app.listen(config.PORT, "0.0.0.0", () => {
  console.log(
    `MediConnect API listening on port ${config.PORT}`
  );
});

// ========================================
// GRACEFUL SHUTDOWN
// ========================================

async function shutdown(signal: string) {
  console.info(`${signal} received; shutting down API`);

  server.close(async () => {
    await pool.end();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("SIGTERM", () => void shutdown("SIGTERM"));