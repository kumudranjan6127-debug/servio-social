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

  // --- Optional: a SECOND Buffer account, for channels that don't fit the first
  // account's free 3-channel limit (e.g. X / Facebook). When BUFFER_API_KEY_2 and
  // the matching channel id are both set, that platform publishes via this key. ---
  BUFFER_API_KEY_2: z.string().trim().optional(),
  BUFFER_TWITTER_CHANNEL_ID: z.string().trim().optional(),
  BUFFER_FACEBOOK_CHANNEL_ID: z.string().trim().optional(),

  // --- Optional: image hosting (Instagram needs a public image URL) ---
  CLOUDINARY_CLOUD_NAME: z.string().trim().optional(),
  CLOUDINARY_UPLOAD_PRESET: z.string().trim().optional(),

  // --- Optional: AI image generation (fal.ai). When set, each post gets a
  // bespoke professional image generated from the day's image prompt instead
  // of the static branded pool. PAID (a few cents per image). Falls back to
  // the free pool if unset or if generation fails. Still needs Cloudinary to
  // host the result for Buffer. ---
  FAL_KEY: z.string().trim().optional(),
  /** fal.ai model id. Default flux/dev — strong quality/cost balance. */
  FAL_IMAGE_MODEL: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "fal-ai/flux/dev")),

  // --- Optional: FREE AI image generation via Cloudflare Workers AI. Preferred
  // over fal.ai when configured. Needs a (free) Cloudflare account id + an API
  // token with Workers AI access. Free tier is 10k requests/day. ---
  CLOUDFLARE_ACCOUNT_ID: z.string().trim().optional(),
  CLOUDFLARE_API_TOKEN: z.string().trim().optional(),
  /** Cloudflare Workers AI model. Default FLUX.1 schnell — free, fast, good. */
  CLOUDFLARE_IMAGE_MODEL: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "@cf/black-forest-labs/flux-1-schnell")),

  // --- Optional: behavior switches ---
  /** "true" → full pipeline runs but NOTHING is sent to Buffer (payloads are logged). */
  DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v?.trim() === "true" || v?.trim() === "1"),
  // When true (default), the daily run SCHEDULES the post for the next 09:00 IST
  // instead of publishing immediately — so it waits in the Buffer dashboard,
  // where it can be reviewed, edited, or deleted before it goes live. Set to
  // "false" to publish instantly with no review window.
  REVIEW_WINDOW: z
    .string()
    .optional()
    .transform((v) => v?.trim().toLowerCase() !== "false"),
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

/** True when Cloudflare Workers AI (free image generation) is configured. */
export const cloudflareImageConfigured: boolean = Boolean(
  env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN
);

/** True when fal.ai (paid image generation) is configured. */
export const falImageConfigured: boolean = Boolean(env.FAL_KEY);

/** True when X/Twitter is configured (second Buffer account key + channel id). */
export const twitterConfigured: boolean = Boolean(
  env.BUFFER_API_KEY_2 && env.BUFFER_TWITTER_CHANNEL_ID
);

/** True when Facebook is configured (second Buffer account key + channel id). */
export const facebookConfigured: boolean = Boolean(
  env.BUFFER_API_KEY_2 && env.BUFFER_FACEBOOK_CHANNEL_ID
);

/** True when ANY AI image generator is configured (Cloudflare preferred, then fal). */
export const aiImageConfigured: boolean = cloudflareImageConfigured || falImageConfigured;
