import { AppError } from "./errors.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError(
      `Missing ${name}. Add it as its own KEY=value line in .env (see .env.example).`,
      503,
    );
  }
  return value;
}

function numberEnv(name: string, fallback: number, min: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) {
    throw new Error(
      `${name} must be a number greater than or equal to ${min}.`,
    );
  }
  return value;
}

export const config = {
  port: numberEnv("PORT", 3001, 1),
  typesafeApiKey: () => required("TYPESAFE_API_KEY"),
  nvidiaApiKey: () => required("NVIDIA_API_KEY"),
  nvidiaBaseUrl: (
    process.env.NVIDIA_BASE_URL?.trim() ||
    "https://integrate.api.nvidia.com/v1"
  ).replace(/\/$/, ""),
  /**
   * gpt-oss-20b is open weights and returns a short reply quickly on the
   * NVIDIA catalog. Reasoning-heavy models often spend the token budget
   * before any customer-visible text.
   */
  nvidiaModel: process.env.NVIDIA_MODEL?.trim() || "openai/gpt-oss-20b",
  nvidiaTimeoutMs: numberEnv("NVIDIA_TIMEOUT_MS", 12_000, 1),
  nvidiaMaxTokens: numberEnv("NVIDIA_MAX_TOKENS", 220, 1),
  /** Explicit cuts. Change these in one place; the writer does not own them. */
  urgencyThreshold: 0.7,
  frustrationThreshold: 2,
  overPromiseThreshold: 0.7,
} as const;

export const SAMPLE_MESSAGES = {
  stripe:
    "Hi, I've been trying to connect my Stripe account for 3 days and the integration keeps failing. I'm losing sales. Please help ASAP.",
  billingA: "Where can I download my March invoice?",
  billingB:
    "This is ridiculous. You charged my card TWICE for March and now my account is locked. I've already emailed three times. Fix the billing charge TODAY or I'm canceling and disputing everything with my bank.",
} as const;
