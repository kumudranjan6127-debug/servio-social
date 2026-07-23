/**
 * generatePost.ts — the Gemini writer for the daily content pack.
 *
 * Two Gemini calls per generation:
 *   1. Research (temperature 0.4, plain text, FAIL-SOFT): gathers 4-6 concrete
 *      grounding points for today's angle. Any failure degrades to "" and the
 *      writer is instructed to stick to evergreen truths with no statistics.
 *   2. Writer (temperature 0.85, JSON): produces the full GeneratedContent
 *      object, validated against a local Zod schema that mirrors
 *      types.GeneratedContent exactly. JSON.parse or schema failures throw
 *      inside the retry wrapper, so they count toward the retry attempts.
 *
 * This file also owns the low-level `geminiCall` helper. Per BUILD.md, ONLY
 * files under src/ai/ talk to Gemini.
 */

import axios from "axios";
import { z } from "zod";

import { env } from "../config/env";
import { logger } from "../services/logger";
import { retry } from "../services/retry";
import type { ChosenTopic, GeneratedContent, HistoryFile } from "../types";

const GEMINI_TIMEOUT_MS = 30_000;
const RESEARCH_TEMPERATURE = 0.4;
const WRITER_TEMPERATURE = 0.85;
const RECENT_POSTS_IN_PROMPT = 8;
const SITE_BASE_URL = "https://servio-0.web.app";

// ---------------------------------------------------------------------------
// Low-level Gemini call (shared by all src/ai/ modules)
// ---------------------------------------------------------------------------

/** Minimal shape of a Gemini generateContent response — only the path we read. */
const GeminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string().optional() })).min(1),
        }),
      })
    )
    .min(1),
});

/** Options for one raw Gemini `generateContent` call. */
export interface GeminiCallOptions {
  /** Sampling temperature — 0.4 for research, 0.85 for writing (per BUILD.md). */
  temperature: number;
  /** When true, request `responseMimeType: "application/json"` (writer call only). */
  json?: boolean;
}

/**
 * Perform ONE raw Gemini `generateContent` call and return the candidate text.
 *
 * Single attempt by design — callers wrap it in `retry(...)` themselves so that
 * downstream JSON.parse / Zod failures share the same attempt budget. Throws on
 * HTTP errors, empty candidates, or a missing/empty text part (e.g. a
 * safety-blocked response), so `retry` can catch and try again.
 *
 * @param prompt  The full user prompt to send.
 * @param options Temperature and whether to request a JSON response.
 * @returns The text at `candidates[0].content.parts[0].text`.
 */
export async function geminiCall(prompt: string, options: GeminiCallOptions): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
  const generationConfig: { temperature: number; responseMimeType?: string } = {
    temperature: options.temperature,
  };
  if (options.json === true) {
    generationConfig.responseMimeType = "application/json";
  }
  const response = await axios.post<unknown>(
    url,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    },
    {
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: GEMINI_TIMEOUT_MS,
    }
  );
  const parsed = GeminiResponseSchema.parse(response.data);
  const text = parsed.candidates[0]?.content.parts[0]?.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Gemini returned no usable text (empty or safety-blocked candidate)");
  }
  return text;
}

// ---------------------------------------------------------------------------
// Local Zod mirror of types.GeneratedContent
// ---------------------------------------------------------------------------

const PlatformPostSchema = z.object({
  text: z.string(),
  hashtags: z.array(z.string()),
});

/**
 * Mirrors types.GeneratedContent exactly. The `satisfies` clause makes the
 * compiler prove the schema's output type is assignable to GeneratedContent —
 * if types.ts ever changes, this file fails to typecheck instead of drifting.
 */
const GeneratedContentSchema = z.object({
  topic: z.string(),
  angle: z.string(),
  research: z.string(),
  linkedin: PlatformPostSchema,
  instagram: PlatformPostSchema,
  twitter: PlatformPostSchema,
  blogDraft: z.string(),
  imagePrompt: z.string(),
}) satisfies z.ZodType<GeneratedContent>;

// ---------------------------------------------------------------------------
// Prompt constants (brand block + platform rules from docs/BUILD.md)
// ---------------------------------------------------------------------------

const BRAND_BLOCK = [
  "BRAND — Servio",
  `Servio is a web development agency: ${SITE_BASE_URL}`,
  "Services: landing pages, business websites, portfolio sites, e-commerce, custom web apps, maintenance.",
  "Audience: small/medium business owners and non-technical founders (India-first, global-friendly).",
  "Voice: founder mindset — professional, educational, helpful, modern, natural. Short sentences.",
  "Concrete and specific. Never salesy. Never fake statistics or invented client results.",
  "CTA rotation (pick exactly ONE per post): visit the site / see the portfolio / read the blog / DM or comment to talk.",
  'Banned — never use any of these: "delve", "game-changer", "unlock", "elevate", "leverage" (as a verb),',
  '"in today\'s fast-paced world", "revolutionize", "unleash", rocket-emoji spam, emoji walls,',
  'engagement-bait such as "tag a friend" or "like if you agree". Use at most 4 em-dashes (—) per post.',
].join("\n");

const PLATFORM_RULES = [
  "PLATFORM RULES",
  "linkedin.text: 100-180 words. Strong hook as the very first line. One core insight. One CTA. Maximum 3 emojis.",
  'instagram.text: 80-150 words. Storytelling with real line breaks. One CTA. Slightly more energetic than LinkedIn. Maximum 8 emojis. Never paste a URL — write "link in bio" instead.',
  "twitter.text: at most 260 characters INCLUDING its 1-2 hashtags (put those hashtags inside the text AND in twitter.hashtags).",
  "blogDraft: a ~400-600 word markdown blog draft on the same angle (a # title, short sections, short paragraphs).",
  "imagePrompt: one or two sentences describing a branded social image for this post — modern minimal startup-tech style, clean typography, blue and white palette.",
  "linkedin and instagram must cover the SAME topic and angle in clearly DIFFERENT wording, structure and hook — not near-duplicates of each other.",
  'Hashtag arrays: linkedin.hashtags 4-6 tags, instagram.hashtags 8-15 tags, include "Servio" in each; single-word tags only (a leading "#" is optional).',
].join("\n");

const JSON_SHAPE = [
  "Return ONLY one valid JSON object — no markdown fences, no commentary — with EXACTLY these keys:",
  "{",
  '  "topic": string,',
  '  "angle": string,',
  '  "research": string,',
  '  "linkedin": { "text": string, "hashtags": string[] },',
  '  "instagram": { "text": string, "hashtags": string[] },',
  '  "twitter": { "text": string, "hashtags": string[] },',
  '  "blogDraft": string,',
  '  "imagePrompt": string',
  "}",
].join("\n");

// ---------------------------------------------------------------------------
// Small local helpers
// ---------------------------------------------------------------------------

/** YYYY-MM-DD for "now" in Asia/Kolkata (en-CA locale formats as ISO date). */
function todayIstDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "Next.js" → "next-js" (for UTM campaign slugs). */
function topicSlug(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Builds the branded UTM link for one platform (see brand block in BUILD.md). */
function siteUrl(platform: string, date: string, slug: string): string {
  return `${SITE_BASE_URL}?utm_source=${platform}&utm_medium=social&utm_campaign=${date}-${slug}`;
}

/** Strips optional ```json fences some models wrap around JSON output. */
function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const inner = match?.[1];
  return inner !== undefined ? inner : trimmed;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildResearchPrompt(choice: ChosenTopic): string {
  return [
    "You are a careful researcher preparing notes for a social media post by Servio,",
    "a web development agency serving small/medium business owners and non-technical founders.",
    "",
    `Topic: ${choice.topic}`,
    `Angle: ${choice.angle}`,
    "",
    "List 4-6 concrete, current, verifiable points about this angle — one short bullet per line.",
    "Rules:",
    "- No fabricated numbers or statistics. If you are not sure a fact is current, write evergreen truths instead — no stats at all.",
    "- Practical and specific enough to be useful to a non-technical business owner.",
    "- Plain-text bullets only. No preamble, no closing line.",
  ].join("\n");
}

function buildWriterPrompt(
  choice: ChosenTopic,
  research: string,
  history: HistoryFile,
  feedback?: string[]
): string {
  const date = todayIstDate();
  const slug = topicSlug(choice.topic);

  const researchBlock =
    research.length > 0
      ? `RESEARCH NOTES (ground the posts in these; do not copy them verbatim; never add numbers that are not in them):\n${research}`
      : "RESEARCH NOTES: none available — write evergreen, verifiable truths only; absolutely no statistics.";

  const recentPosts = history.posts
    .slice(-RECENT_POSTS_IN_PROMPT)
    .map((post) => `- ${post.date} | ${post.topic} — ${post.angle}`)
    .join("\n");
  const recentBlock =
    recentPosts.length > 0
      ? `RECENT POSTS (do not repeat these ideas, hooks, or phrasings):\n${recentPosts}`
      : "";

  const feedbackBlock =
    feedback !== undefined && feedback.length > 0
      ? `A PREVIOUS DRAFT WAS REJECTED by our validator. Fix EVERY one of these problems in the new draft:\n${feedback
          .map((issue) => `- ${issue}`)
          .join("\n")}`
      : "";

  const parts = [
    "You write today's social media content for Servio.",
    "",
    BRAND_BLOCK,
    "",
    `TODAY (${date})`,
    `Topic: ${choice.topic}`,
    `Angle: ${choice.angle}`,
    "",
    researchBlock,
    "",
    "SITE LINKS — when a post links to the site, use the matching URL EXACTLY:",
    `- LinkedIn: ${siteUrl("linkedin", date, slug)}`,
    `- Twitter/X (only if it fits the 260-character budget): ${siteUrl("twitter", date, slug)}`,
    `- Blog draft: ${siteUrl("blog", date, slug)}`,
    '- Instagram: never paste a URL — write "link in bio" instead.',
    "",
    PLATFORM_RULES,
    "",
    recentBlock,
    feedbackBlock,
    JSON_SHAPE,
    `Set "topic" to ${JSON.stringify(choice.topic)}, "angle" to ${JSON.stringify(
      choice.angle
    )}, and "research" to the research notes above (or "" if none were provided).`,
  ];

  return parts.filter((part) => part.length > 0).join("\n");
}

// ---------------------------------------------------------------------------
// Generation steps
// ---------------------------------------------------------------------------

/** Research call — FAIL-SOFT: any error after retries degrades to "". */
async function researchAngle(choice: ChosenTopic): Promise<string> {
  try {
    const text = await retry("gemini:research", () =>
      geminiCall(buildResearchPrompt(choice), { temperature: RESEARCH_TEMPERATURE })
    );
    logger.debug(`Research notes gathered for "${choice.topic}" (${text.length} chars)`);
    return text.trim();
  } catch (error) {
    logger.warn(
      `gemini:research failed — continuing without research notes: ${errorMessage(error)}`
    );
    return "";
  }
}

/**
 * Parses and validates one writer response. Pins topic/angle/research to our
 * authoritative values BEFORE validation so minor model drift on those three
 * fields can never fail a run. Throws (inside retry) on bad JSON or bad shape.
 */
function parseGenerated(rawText: string, choice: ChosenTopic, research: string): GeneratedContent {
  const parsedJson: unknown = JSON.parse(stripJsonFences(rawText));
  if (typeof parsedJson !== "object" || parsedJson === null || Array.isArray(parsedJson)) {
    throw new Error("Writer output is not a JSON object");
  }
  const candidate: Record<string, unknown> = {
    ...(parsedJson as Record<string, unknown>),
    topic: choice.topic,
    angle: choice.angle,
    research,
  };
  return GeneratedContentSchema.parse(candidate);
}

/**
 * Generate the full daily content pack (LinkedIn, Instagram, Twitter, blog
 * draft, image prompt) for the chosen topic and angle.
 *
 * Research first (fail-soft), then the JSON writer call wrapped in retry —
 * HTTP errors, JSON.parse failures, and Zod schema failures all count toward
 * the same attempts, per BUILD.md.
 *
 * @param choice   Today's topic + angle from chooseTopic().
 * @param history  Recent post history — embedded in the prompt so the writer
 *                 avoids repeating recent ideas, hooks, and phrasings.
 * @param feedback Optional validator issues from a rejected previous draft;
 *                 appended to the prompt so the regeneration fixes them.
 * @returns A validated GeneratedContent object.
 */
export async function generateContent(
  choice: ChosenTopic,
  history: HistoryFile,
  feedback?: string[]
): Promise<GeneratedContent> {
  const research = await researchAngle(choice);
  const prompt = buildWriterPrompt(choice, research, history, feedback);
  const content = await retry("gemini:writer", async () => {
    const raw = await geminiCall(prompt, { temperature: WRITER_TEMPERATURE, json: true });
    return parseGenerated(raw, choice, research);
  });
  logger.info(
    `Writer finished for "${choice.topic}" — linkedin ${countWords(content.linkedin.text)} words, ` +
      `instagram ${countWords(content.instagram.text)} words, twitter ${content.twitter.text.length} chars`
  );
  return content;
}
