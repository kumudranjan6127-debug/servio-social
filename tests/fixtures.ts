/**
 * Shared test fixtures. `makeContent` returns a GeneratedContent that PASSES
 * every validator rule by default; tests override single fields to exercise
 * individual failures. LinkedIn and Instagram use disjoint vocabularies so
 * their cross-similarity is 0 unless a test deliberately makes them match.
 */
import type { GeneratedContent, HistoryFile, PostRecord } from "../src/types";

/** `n` distinct words with the given prefix: "alpha0 alpha1 …". */
export function words(prefix: string, n: number): string {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
}

export function makeContent(overrides: Partial<GeneratedContent> = {}): GeneratedContent {
  return {
    topic: "Web development",
    angle: "How small businesses can ship a fast website that converts.",
    research: "",
    linkedin: {
      text: words("alpha", 120),
      hashtags: ["#Servio", "#WebDev", "#SmallBusiness", "#SEO", "#SaaS"],
    },
    instagram: {
      text: words("beta", 100),
      hashtags: [
        "#Servio",
        "#WebDesign",
        "#SmallBiz",
        "#UIUX",
        "#Tech",
        "#Ecommerce",
        "#Startup",
        "#OnlineBusiness",
        "#WebDev",
        "#Growth",
      ],
    },
    twitter: { text: "A short and punchy note about shipping fast websites.", hashtags: ["#Servio"] },
    blogDraft: "# Draft\n\nSome body text.",
    imagePrompt: "A clean abstract graphic of a website.",
    ...overrides,
  };
}

export function makeRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    date: "2026-07-20",
    topic: "Old topic",
    angle: "An old angle about something unrelated.",
    linkedin: { text: words("gamma", 120), hashtags: [], status: "published" },
    instagram: { text: words("delta", 100), hashtags: [], status: "published" },
    twitter: { text: "old tweet", hashtags: [] },
    imagePrompt: "old prompt",
    createdAtIso: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

export function makeHistory(records: PostRecord[] = []): HistoryFile {
  return { posts: records };
}
