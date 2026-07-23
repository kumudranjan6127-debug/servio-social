/**
 * generateHashtags.ts — pure post-processing of the AI-produced hashtag lists.
 *
 * No AI calls here. Tags are sanitized (leading '#' stripped, whitespace
 * collapsed into CamelCase, non-word characters removed), deduplicated
 * case-insensitively, trimmed to the platform maximum, and — when a list runs
 * short — topped up brand-first (#Servio, then curated brand/industry tags)
 * to the platform minimum. '#' is re-added at the very end.
 *
 * Counts enforced (per BUILD.md): LinkedIn 4-6, Instagram 8-15, Twitter 1-2.
 */

import type { GeneratedContent, PlatformPost } from "../types";

const LINKEDIN_MIN = 4;
const LINKEDIN_MAX = 6;
const INSTAGRAM_MIN = 8;
const INSTAGRAM_MAX = 15;
const TWITTER_MIN = 1;
const TWITTER_MAX = 2;

/** Always the first tag added when a list runs short. */
const BRAND_TAG = "Servio";

/** Curated brand/industry pool used to top up short LinkedIn lists. */
const LINKEDIN_POOL: readonly string[] = [
  "WebDevelopment",
  "SmallBusiness",
  "WebDesign",
  "DigitalTransformation",
  "BusinessGrowth",
  "SoftwareEngineering",
  "SEO",
  "SaaS",
];

/** Curated brand/industry pool used to top up short Instagram lists. */
const INSTAGRAM_POOL: readonly string[] = [
  "WebDevelopment",
  "WebDesign",
  "SmallBusinessOwner",
  "WebsiteDesign",
  "DigitalMarketing",
  "Ecommerce",
  "UIUX",
  "TechForBusiness",
  "OnlineBusiness",
  "Entrepreneurship",
  "StartupLife",
  "WebDeveloper",
  "BusinessGrowth",
  "IndianStartups",
];

/**
 * "  #web development!" → "WebDevelopment". Returns "" when nothing survives
 * sanitization (caller drops those).
 */
function sanitizeTag(raw: string): string {
  const stripped = raw.trim().replace(/^#+/, "").trim();
  if (stripped.length === 0) {
    return "";
  }
  const camelCased = stripped
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
  return camelCased.replace(/[^\p{L}\p{N}_]/gu, "");
}

/**
 * Sanitize + dedupe (case-insensitive, first occurrence wins), trim to `max`,
 * top up brand-first to `min`, then re-add the leading '#'.
 */
function normalizeList(
  tags: readonly string[],
  min: number,
  max: number,
  pool: readonly string[]
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    const tag = sanitizeTag(raw);
    const key = tag.toLowerCase();
    if (tag.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(tag);
  }

  if (result.length > max) {
    result.length = max;
  }

  if (result.length < min) {
    // Brand-first top-up: #Servio, then curated brand/industry tags.
    for (const candidate of [BRAND_TAG, ...pool]) {
      if (result.length >= min) {
        break;
      }
      const key = candidate.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(candidate);
    }
  }

  return result.map((tag) => `#${tag}`);
}

/** Pure copy helper — never mutates the input post. */
function withHashtags(post: PlatformPost, hashtags: string[]): PlatformPost {
  return { text: post.text, hashtags };
}

/**
 * Normalize every platform's hashtag list in a GeneratedContent pack.
 *
 * Pure function (exported for testing): the input is never mutated; a new
 * GeneratedContent is returned with cleaned, deduplicated, count-enforced,
 * '#'-prefixed hashtags — LinkedIn 4-6, Instagram 8-15, Twitter 1-2 — topped
 * up brand-first (#Servio, then curated tags) whenever a list runs short.
 *
 * @param content The freshly generated content pack.
 * @returns A new GeneratedContent with normalized hashtag arrays.
 */
export function normalizeHashtags(content: GeneratedContent): GeneratedContent {
  return {
    ...content,
    linkedin: withHashtags(
      content.linkedin,
      normalizeList(content.linkedin.hashtags, LINKEDIN_MIN, LINKEDIN_MAX, LINKEDIN_POOL)
    ),
    instagram: withHashtags(
      content.instagram,
      normalizeList(content.instagram.hashtags, INSTAGRAM_MIN, INSTAGRAM_MAX, INSTAGRAM_POOL)
    ),
    twitter: withHashtags(
      content.twitter,
      normalizeList(content.twitter.hashtags, TWITTER_MIN, TWITTER_MAX, [])
    ),
  };
}
