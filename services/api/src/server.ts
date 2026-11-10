import express from "express";
import cors from "cors";
import helmet from "helmet";
import { z } from "zod";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? false }));
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "mediconnect-api",
    environment: process.env.NODE_ENV ?? "development",
    timestamp: new Date().toISOString()
  });
});

// This endpoint deliberately accepts no patient symptoms or identifiers.
// It is a readiness boundary for future, clinician-governed modules.
app.get("/v1/platform/capabilities", (_req, res) => {
  res.json({
    patientApp: "foundation",
    healthWorkerWorkspace: "planned",
    appointments: "planned",
    teleconsultation: "disabled_until_provider_and_clinical_approval",
    aiClinicalDecisionSupport: "disabled",
    supportedLocales: ["en", "hi"],
    dataCollection: "no_patient_data_in_foundation"
  });
});

const feedbackSchema = z.object({
  category: z.enum(["usability", "language", "accessibility", "technical"]),
  message: z.string().trim().min(3).max(500),
  locale: z.enum(["en", "hi"]).default("en")
});

app.post("/v1/feedback", (req, res) => {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid feedback payload", details: parsed.error.flatten() });
  }
  // Foundation mode: do not persist feedback until retention, consent and privacy controls are approved.
  return res.status(202).json({ accepted: true, stored: false, message: "Feedback endpoint is in non-persistent foundation mode." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`MediConnect API listening on port ${port}`);
});
