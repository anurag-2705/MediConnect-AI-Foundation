import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: process.env.ENV_FILE ?? "../../.env" });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  OTP_PEPPER: z.string().min(32),
  PRIVACY_NOTICE_VERSION: z.string().min(1).default("dev-draft-v1"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  DEV_OTP_MODE: z.enum(["true", "false"]).default("false"),
  SMS_PROVIDER_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  SMS_PROVIDER_TOKEN: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  CORS_ORIGINS: z.string().default(""),
  TRUST_PROXY: z.enum(["true", "false"]).default("false")
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid API environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("API configuration is invalid. Check services/api/.env.example and root .env.example.");
}

export const config = {
  ...parsed.data,
  devOtpMode: parsed.data.DEV_OTP_MODE === "true",
  trustProxy: parsed.data.TRUST_PROXY === "true",
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((v) => v.trim()).filter(Boolean)
};

if (config.NODE_ENV === "production" && config.devOtpMode) {
  throw new Error("DEV_OTP_MODE must be false in production.");
}
if (config.NODE_ENV === "production" && config.PRIVACY_NOTICE_VERSION.startsWith("dev-")) {
  throw new Error("Production requires a legally reviewed PRIVACY_NOTICE_VERSION.");
}
if (config.NODE_ENV === "production" && (!config.SMS_PROVIDER_URL || !config.SMS_PROVIDER_TOKEN)) {
  throw new Error("Production requires a configured SMS provider for phone verification.");
}
