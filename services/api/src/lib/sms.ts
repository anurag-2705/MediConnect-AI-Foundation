import { config } from "../config";

export async function sendOtpSms(phoneE164: string, code: string): Promise<void> {
  const message = `Your MediConnect verification code is ${code}. It expires in 5 minutes. Do not share this code.`;

  if (config.NODE_ENV === "development" && config.devOtpMode) {
    // Development-only convenience. Never enable this in a deployed environment.
    console.info(`[DEVELOPMENT OTP] ${phoneE164}: ${code}`);
    return;
  }

  if (!config.SMS_PROVIDER_URL || !config.SMS_PROVIDER_TOKEN) {
    throw new Error("SMS provider is not configured. OTP cannot be delivered.");
  }

  const response = await fetch(config.SMS_PROVIDER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.SMS_PROVIDER_TOKEN}`
    },
    body: JSON.stringify({ to: phoneE164, message }),
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(`SMS provider returned HTTP ${response.status}`);
  }
}
