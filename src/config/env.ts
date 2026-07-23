/**
 * env.ts — the ONLY place environment variables are read.
 *
 * Validated with Zod at startup: if configuration is invalid the process exits
 * immediately with a plain-English explanation, before any external call.
 * Every other module imports the typed `env` object from here — never
 * process.env directly.
 */

import { z } from "zod";
import "dotenv/config";

const EnvSchema = z.object({
  // --- Required: the AI writer ---
  // .trim() on every secret: values pasted into GitHub Secrets often pick up a
  // stray leading/trailing space or newline, which would otherwise silently
  // break the key or make a channel id "not found". Whitespace is never
  // meaningful here, so we strip it before validating.
  GEMINI_API_KEY: z.string().trim().min(10, "GEMINI_API_KEY looks empty or truncated"),

  // --- Required: the publisher ---
  BUFFER_API_KEY: z.string().trim().min(10, "BUFFER_API_KEY looks empty or truncated"),
  BUFFER_LINKEDIN_CHANNEL_ID: z.string().trim().min(1, "BUFFER_LINKEDIN_CHANNEL_ID is required"),
  BUFFER_INSTAGRAM_CHANNEL_ID: z.string().trim().min(1, "BUFFER_INSTAGRAM_CHANNEL_ID is required"),

  // --- Optional: image hosting (Instagram needs a public image URL) ---
  CLOUDINARY_CLOUD_NAME: z.string().trim().optional(),
  CLOUDINARY_UPLOAD_PRESET: z.string().trim().optional(),

  // --- Optional: behavior switches ---
  /** "true" → full pipeline runs but NOTHING is sent to Buffer (payloads are logged). */
  DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v?.trim() === "true" || v?.trim() === "1"),
  // Empty/whitespace (e.g. an unset GitHub secret passed as "") falls back to
  // the default rather than producing a broken ":generateContent" URL.
  // Default is the "flash-latest" alias, which always resolves to the current
  // Gemini flash model — pinned versions (e.g. gemini-2.5-flash) get retired
  // and start returning 404 "no longer available to new users".
  GEMINI_MODEL: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "gemini-flash-latest")),
  /** Similarity above this (0..1) forces regeneration. */
  SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  /** How many regeneration attempts before the run fails. */
  MAX_REGEN_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  /** Optional webhook (Slack/Discord-compatible JSON {text}) for success/failure notifications. */
  NOTIFY_WEBHOOK_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Plain-English startup failure, one line per problem.
    console.error("Configuration is invalid — fix these environment variables:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    console.error(
      "Set them as GitHub Actions secrets (repo Settings > Secrets and variables > Actions) " +
        "or in a local .env file copied from .env.example."
    );
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = loadEnv();

/** True when Cloudinary is configured, i.e. Instagram can receive images. */
export const imageHostingConfigured: boolean = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_UPLOAD_PRESET
);
