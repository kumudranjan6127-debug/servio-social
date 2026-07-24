/**
 * chooseTopic.ts — deterministic least-recently-used topic rotation plus one
 * cheap Gemini call that turns the picked topic into a fresh, specific angle.
 *
 * Selection is fully deterministic (no AI involved): topics used in the last
 * 10 history records are excluded, then the remaining pool topic with the
 * oldest last-use wins (never-used topics first, pool order breaks ties).
 * Only the angle wording comes from Gemini — and if that call fails, a
 * deterministic template angle is used instead, so a Gemini outage can never
 * stop the daily run at this step.
 */

import { logger } from "../services/logger";
import { retry } from "../services/retry";
import type { ChosenTopic, HistoryFile } from "../types";
import { geminiCall } from "./generatePost";

/** How many most-recent history records exclude their topics from selection. */
const RECENT_EXCLUSION_COUNT = 10;
/** How many of the topic's past angles are shown to Gemini to avoid repeats. */
const PAST_ANGLES_IN_PROMPT = 5;
/** Angle writing is creative work — writer temperature per BUILD.md. */
const ANGLE_TEMPERATURE = 0.85;
/** Cheap call: fewer attempts than usual — a template fallback exists anyway. */
const ANGLE_RETRY_ATTEMPTS = 2;
/** Hard cap so a rambling model reply cannot bloat prompts and history. */
const MAX_ANGLE_LENGTH = 220;

/**
 * The rotating topic pool from docs/BUILD.md. Exported so health checks and
 * tests can inspect it; treat it as read-only.
 */
export const TOPIC_POOL: readonly string[] = [
  "AI",
  "Automation",
  "Startups",
  "SaaS",
  "Web Development",
  "React",
  "Next.js",
  "Node.js",
  "Firebase",
  "UI/UX",
  "SEO",
  "Cloud",
  "Open Source",
  "GitHub",
  "Developer Productivity",
  "Business Growth",
  "Digital Transformation",
  "Software Engineering",
];

/** Deterministic template angles used when the Gemini angle call fails. */
const FALLBACK_ANGLE_TEMPLATES: readonly ((topic: string) => string)[] = [
  (topic) =>
    `Common ${topic} mistakes small businesses make on their websites, and the simple fixes`,
  (topic) => `What small business owners should know about ${topic} before hiring a web agency`,
  (topic) => `How ${topic} quietly decides whether a business website wins or loses customers`,
  (topic) => `A practical, no-hype look at using ${topic} well on a small business website`,
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Deterministic LRU pick: exclude last-N topics, oldest last-use wins. */
function pickLeastRecentlyUsed(history: HistoryFile): { topic: string; reason: string } {
  const posts = history.posts;

  const recentTopics = new Set(
    posts.slice(-RECENT_EXCLUSION_COUNT).map((post) => post.topic.toLowerCase())
  );

  // Most recent index each topic was used at (lowercased for safe matching).
  const lastUsedIndex = new Map<string, number>();
  posts.forEach((post, index) => {
    lastUsedIndex.set(post.topic.toLowerCase(), index);
  });

  // Pool (18) is larger than the exclusion window (10), so candidates is never
  // empty in practice — the fallback to the full pool is purely defensive.
  let candidates = TOPIC_POOL.filter((topic) => !recentTopics.has(topic.toLowerCase()));
  if (candidates.length === 0) {
    candidates = [...TOPIC_POOL];
  }

  let bestTopic: string | undefined;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const topic of candidates) {
    const index = lastUsedIndex.get(topic.toLowerCase()) ?? -1;
    if (bestTopic === undefined || index < bestIndex) {
      bestTopic = topic;
      bestIndex = index;
    }
  }
  const topic = bestTopic ?? "Web Development"; // unreachable: candidates is never empty

  const usedAt = lastUsedIndex.get(topic.toLowerCase());
  const reason =
    usedAt === undefined
      ? `"${topic}" has never been posted about — least-recently-used pick from the pool`
      : `"${topic}" was last used on ${posts[usedAt]?.date ?? "an earlier run"} and is outside ` +
        `the last ${RECENT_EXCLUSION_COUNT} posts — least-recently-used pick`;

  return { topic, reason };
}

/** Deterministic template angle, rotated by history length so reruns vary. */
function fallbackAngle(topic: string, historyLength: number): string {
  const template = FALLBACK_ANGLE_TEMPLATES[historyLength % FALLBACK_ANGLE_TEMPLATES.length];
  return template !== undefined
    ? template(topic)
    : `A practical look at ${topic} for small business websites`;
}

function buildAnglePrompt(topic: string, pastAngles: readonly string[]): string {
  const pastBlock =
    pastAngles.length > 0 ? pastAngles.map((angle) => `- ${angle}`).join("\n") : "(none yet)";
  return [
    "You are the content strategist for Servio, which builds websites for everyday small business",
    "owners in India (shops, restaurants, clinics, salons, boutiques, local services, first-time founders).",
    "These readers are BUSY and NOT technical.",
    "",
    `Today's topic: "${topic}"`,
    "",
    "Angles already used for this topic (do NOT repeat or closely resemble any of them):",
    pastBlock,
    "",
    "Write ONE fresh, specific angle for today's social posts about this topic.",
    "Requirements:",
    "- One sentence, under 30 words, in plain everyday English (no jargon like webhook, API, CRM, SEO).",
    "- Frame it from the OWNER'S problem or gain, not the technology — e.g. 'why visitors leave your",
    "  website without calling' rather than 'implementing X'. It should make an owner think 'that's my problem'.",
    '- Concrete and practical; generic framings like "why X matters" are not acceptable.',
    "- Clearly different from every past angle listed above. No hype words, no statistics.",
    "Return ONLY the angle sentence — no quotes, no numbering, no explanation.",
  ].join("\n");
}

/** First non-empty line, stripped of quotes/list markers, length-capped. */
function sanitizeAngle(raw: string): string {
  const firstLine = raw
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstLine === undefined) {
    return "";
  }
  return firstLine
    .replace(/^(?:angle\s*:)/i, "")
    .replace(/^(?:[-*]\s+|\d+[.)]\s+)/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ANGLE_LENGTH);
}

/** One cheap Gemini call for the angle; template fallback on any failure. */
async function generateAngle(
  topic: string,
  pastAngles: readonly string[],
  historyLength: number
): Promise<string> {
  try {
    const raw = await retry(
      "gemini:angle",
      () => geminiCall(buildAnglePrompt(topic, pastAngles), { temperature: ANGLE_TEMPERATURE }),
      { attempts: ANGLE_RETRY_ATTEMPTS }
    );
    const angle = sanitizeAngle(raw);
    if (angle.length > 0) {
      return angle;
    }
    logger.warn("gemini:angle returned unusable text — using a template angle instead");
  } catch (error) {
    logger.warn(`gemini:angle failed — using a template angle instead: ${errorMessage(error)}`);
  }
  return fallbackAngle(topic, historyLength);
}

/**
 * Choose today's topic and angle.
 *
 * The topic pick is deterministic LRU over the BUILD.md pool (topics from the
 * last 10 records excluded, oldest last-use first, pool order breaks ties).
 * The angle comes from one cheap Gemini call that is shown the topic's past
 * angles so it produces something fresh; on AI failure a deterministic
 * template angle is used, so this function never throws for AI reasons.
 *
 * @param history The loaded history file (data/posts.json contents).
 * @returns The chosen topic, a fresh specific angle, and a log-friendly reason.
 */
export async function chooseTopic(history: HistoryFile): Promise<ChosenTopic> {
  const { topic, reason } = pickLeastRecentlyUsed(history);

  const pastAngles = history.posts
    .filter((post) => post.topic.toLowerCase() === topic.toLowerCase())
    .map((post) => post.angle)
    .slice(-PAST_ANGLES_IN_PROMPT);

  const angle = await generateAngle(topic, pastAngles, history.posts.length);

  logger.info(`Topic chosen: "${topic}" — ${reason}`);
  logger.info(`Angle: ${angle}`);

  return { topic, angle, reason };
}
