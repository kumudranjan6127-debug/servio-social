/**
 * validator.ts — quality gate for generated content, run before anything is
 * published. Pure and dependency-free (only type imports) so it is trivially
 * unit-testable and can never touch the network or the filesystem.
 *
 * Checks (per BUILD.md): word counts, emoji counts, hashtag counts, banned
 * phrases and style tics, LinkedIn-vs-Instagram cross-similarity, and
 * similarity against recent history (Dice coefficient on word bigrams).
 */

import type { GeneratedContent, HistoryFile, ValidationIssue, ValidationResult } from "../types";

// ---------------------------------------------------------------------------
// Tunables (all fixed by the brand spec — the only runtime knob is `threshold`)
// ---------------------------------------------------------------------------

/** Target word ranges before the ±15% soft tolerance is applied. */
const WORD_RANGES = {
  linkedin: { min: 100, max: 180 },
  instagram: { min: 80, max: 150 },
} as const;

/** Soft tolerance applied to the word ranges (15% each way). */
const WORD_TOLERANCE = 0.15;

/** Maximum emoji per platform post. */
const EMOJI_LIMITS = { linkedin: 3, instagram: 8 } as const;

/** Required hashtag counts per platform (mirrors normalizeHashtags). */
const HASHTAG_RANGES = {
  linkedin: { min: 4, max: 6 },
  instagram: { min: 8, max: 15 },
} as const;

/** LinkedIn and Instagram must be less similar than this (fixed by spec). */
const CROSS_PLATFORM_LIMIT = 0.85;

/** How many of the most recent history records to compare against. */
const HISTORY_WINDOW = 30;

/** Maximum em-dashes allowed per post before it reads as AI sludge. */
const MAX_EM_DASHES = 4;

/** Maximum rocket emoji before it counts as "🚀 spam". */
const MAX_ROCKETS = 2;

/**
 * Brand-banned phrases (case-insensitive, matched at a word start so
 * inflections like "delves" or "unlocked" are caught too). Multi-word phrases
 * are matched as written.
 */
const BANNED_PHRASES: readonly string[] = [
  "delve",
  "game-changer",
  "unlock",
  "elevate",
  "leverage",
  "in today's fast-paced world",
  "revolutionize",
  "unleash",
  "tag a friend",
  "like if you agree",
];

/** Counts emoji using the Unicode Extended_Pictographic property. */
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

// ---------------------------------------------------------------------------
// Similarity (Dice coefficient on word bigrams)
// ---------------------------------------------------------------------------

/** Lowercases, strips punctuation, and splits a text into words. */
function toWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/** Builds a multiset (token → count) of consecutive word pairs. */
function bigramCounts(words: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const gram = `${words[i]} ${words[i + 1]}`;
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/** Dice coefficient over two multisets: 2·|A∩B| / (|A|+|B|). */
function diceOverCounts(a: Map<string, number>, b: Map<string, number>): number {
  let totalA = 0;
  for (const n of a.values()) totalA += n;
  let totalB = 0;
  for (const n of b.values()) totalB += n;
  if (totalA + totalB === 0) return 0;
  let overlap = 0;
  for (const [gram, countA] of a) {
    const countB = b.get(gram);
    if (countB !== undefined) overlap += Math.min(countA, countB);
  }
  return (2 * overlap) / (totalA + totalB);
}

/** Multiset of single words — fallback when a text is too short for bigrams. */
function unigramCounts(words: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

/**
 * Similarity between two texts in [0, 1]: the Dice coefficient over word
 * bigrams (case-insensitive, punctuation ignored). 0 = nothing in common,
 * 1 = identical word sequences. Texts too short to form bigrams (fewer than
 * two words) fall back to single-word comparison.
 */
export function similarity(a: string, b: string): number {
  const wordsA = toWords(a);
  const wordsB = toWords(b);
  const gramsA = bigramCounts(wordsA);
  const gramsB = bigramCounts(wordsB);
  if (gramsA.size === 0 && gramsB.size === 0) {
    return diceOverCounts(unigramCounts(wordsA), unigramCounts(wordsB));
  }
  return diceOverCounts(gramsA, gramsB);
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/** Counts words the same way the range limits are meant: whitespace-separated. */
function wordCount(text: string): number {
  return toWords(text).length;
}

/** Counts emoji codepoints via \p{Extended_Pictographic}. */
function emojiCount(text: string): number {
  return (text.match(EMOJI_RE) ?? []).length;
}

/** Pushes an issue when the word count is outside the range ±15% tolerance. */
function checkWordCount(
  issues: ValidationIssue[],
  field: string,
  text: string,
  range: { min: number; max: number }
): void {
  const softMin = Math.floor(range.min * (1 - WORD_TOLERANCE));
  const softMax = Math.ceil(range.max * (1 + WORD_TOLERANCE));
  const count = wordCount(text);
  if (count < softMin || count > softMax) {
    issues.push({
      field,
      problem:
        `${count} words — target is ${range.min}-${range.max} ` +
        `(hard limits ${softMin}-${softMax} after 15% tolerance)`,
    });
  }
}

/** Pushes an issue when a text carries more emoji than the platform allows. */
function checkEmojiCount(
  issues: ValidationIssue[],
  field: string,
  text: string,
  limit: number
): void {
  const count = emojiCount(text);
  if (count > limit) {
    issues.push({ field, problem: `${count} emoji — maximum is ${limit}` });
  }
}

/** Pushes an issue when the hashtag list is outside its required range. */
function checkHashtagCount(
  issues: ValidationIssue[],
  field: string,
  hashtags: readonly string[],
  range: { min: number; max: number }
): void {
  if (hashtags.length < range.min || hashtags.length > range.max) {
    issues.push({
      field,
      problem: `${hashtags.length} hashtags — must be ${range.min}-${range.max}`,
    });
  }
}

/** Escapes a phrase so it can be embedded in a RegExp literally. */
function escapeRegExp(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pushes one issue per banned phrase found in the text (case-insensitive). */
function checkBannedPhrases(issues: ValidationIssue[], field: string, text: string): void {
  for (const phrase of BANNED_PHRASES) {
    const re = new RegExp(`\\b${escapeRegExp(phrase)}`, "iu");
    if (re.test(text)) {
      issues.push({ field, problem: `contains banned phrase "${phrase}"` });
    }
  }
}

/** Style tics the brand block bans: em-dash overuse and 🚀 spam. */
function checkStyleTics(issues: ValidationIssue[], field: string, text: string): void {
  const emDashes = (text.match(/—/g) ?? []).length;
  if (emDashes > MAX_EM_DASHES) {
    issues.push({ field, problem: `${emDashes} em-dashes — maximum is ${MAX_EM_DASHES}` });
  }
  const rockets = (text.match(/🚀/gu) ?? []).length;
  if (rockets > MAX_ROCKETS) {
    issues.push({ field, problem: `${rockets}× 🚀 — reads as spam (maximum ${MAX_ROCKETS})` });
  }
}

/** The text a history record contributes to the similarity comparison. */
function historyComparableText(topic: string, angle: string, linkedinText: string): string {
  return `${topic} ${angle} ${linkedinText}`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Validates one day's generated content against the brand rules and against
 * recent history. Returns every problem found (never throws) so the
 * orchestrator can feed the full list back into a regeneration prompt.
 *
 * @param c The candidate content produced by the AI.
 * @param history Past posts (data/posts.json); only the last 30 are compared.
 * @param threshold Maximum allowed similarity (0..1) vs any recent record —
 *   pass env.SIMILARITY_THRESHOLD.
 */
export function validateContent(
  c: GeneratedContent,
  history: HistoryFile,
  threshold: number
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1. Word counts (±15% soft tolerance).
  checkWordCount(issues, "linkedin.text", c.linkedin.text, WORD_RANGES.linkedin);
  checkWordCount(issues, "instagram.text", c.instagram.text, WORD_RANGES.instagram);

  // 2. Emoji counts.
  checkEmojiCount(issues, "linkedin.text", c.linkedin.text, EMOJI_LIMITS.linkedin);
  checkEmojiCount(issues, "instagram.text", c.instagram.text, EMOJI_LIMITS.instagram);

  // 3. Hashtag counts.
  checkHashtagCount(issues, "linkedin.hashtags", c.linkedin.hashtags, HASHTAG_RANGES.linkedin);
  checkHashtagCount(issues, "instagram.hashtags", c.instagram.hashtags, HASHTAG_RANGES.instagram);

  // 4. Banned phrases + style tics on every outgoing text.
  const textFields: ReadonlyArray<readonly [string, string]> = [
    ["linkedin.text", c.linkedin.text],
    ["instagram.text", c.instagram.text],
    ["twitter.text", c.twitter.text],
  ];
  for (const [field, text] of textFields) {
    checkBannedPhrases(issues, field, text);
    checkStyleTics(issues, field, text);
  }

  // 5. LinkedIn and Instagram must express the same topic differently.
  const crossSimilarity = similarity(c.linkedin.text, c.instagram.text);
  if (crossSimilarity >= CROSS_PLATFORM_LIMIT) {
    issues.push({
      field: "linkedin.text/instagram.text",
      problem:
        `LinkedIn and Instagram posts are ${crossSimilarity.toFixed(2)} similar — ` +
        `must be below ${CROSS_PLATFORM_LIMIT} (write them differently)`,
    });
  }

  // 6. Similarity against the last 30 history records (topic + angle + LI text).
  const candidate = historyComparableText(c.topic, c.angle, c.linkedin.text);
  let maxSimilarity = 0;
  let mostSimilarDate: string | undefined;
  for (const record of history.posts.slice(-HISTORY_WINDOW)) {
    const s = similarity(
      candidate,
      historyComparableText(record.topic, record.angle, record.linkedin.text)
    );
    if (s > maxSimilarity) {
      maxSimilarity = s;
      mostSimilarDate = record.date;
    }
  }
  if (maxSimilarity > threshold) {
    issues.push({
      field: "linkedin.text",
      problem:
        `too similar to the post from ${mostSimilarDate ?? "a recent day"} ` +
        `(${maxSimilarity.toFixed(2)} > ${threshold}) — take a genuinely new angle`,
    });
  }

  return { ok: issues.length === 0, issues, maxSimilarity, mostSimilarDate };
}
