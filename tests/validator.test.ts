import { describe, it, expect } from "vitest";
import { similarity, validateContent } from "../src/services/validator";
import { makeContent, makeHistory, makeRecord, words } from "./fixtures";

describe("similarity", () => {
  it("returns 1 for identical text", () => {
    expect(similarity("the quick brown fox", "the quick brown fox")).toBe(1);
  });

  it("returns 0 for texts with no shared bigrams", () => {
    expect(similarity("alpha beta gamma", "delta epsilon zeta")).toBe(0);
  });

  it("is case-insensitive and ignores punctuation", () => {
    expect(similarity("Hello, World!", "hello world")).toBe(1);
  });

  it("is between 0 and 1 for partial overlap", () => {
    const s = similarity("the quick brown fox jumps", "the quick red fox runs");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it("falls back to single words when text is too short for bigrams", () => {
    expect(similarity("hello", "hello")).toBe(1);
    expect(similarity("hello", "world")).toBe(0);
  });

  it("returns 0 when both texts are empty", () => {
    expect(similarity("", "")).toBe(0);
  });
});

describe("validateContent", () => {
  const THRESHOLD = 0.7;

  it("passes clean, in-spec content with no history", () => {
    const result = validateContent(makeContent(), makeHistory(), THRESHOLD);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.maxSimilarity).toBe(0);
  });

  it("flags a LinkedIn post that is too short", () => {
    const result = validateContent(
      makeContent({ linkedin: { text: words("alpha", 10), hashtags: ["#a", "#b", "#c", "#d"] } }),
      makeHistory(),
      THRESHOLD
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.field === "linkedin.text" && i.problem.includes("words"))).toBe(true);
  });

  it("flags too many emoji on LinkedIn", () => {
    const result = validateContent(
      makeContent({ linkedin: { text: `${words("alpha", 120)} 😀😀😀😀`, hashtags: ["#a", "#b", "#c", "#d"] } }),
      makeHistory(),
      THRESHOLD
    );
    expect(result.issues.some((i) => i.problem.includes("emoji"))).toBe(true);
  });

  it("flags an out-of-range hashtag count", () => {
    const result = validateContent(
      makeContent({ linkedin: { text: words("alpha", 120), hashtags: ["#only", "#two"] } }),
      makeHistory(),
      THRESHOLD
    );
    expect(result.issues.some((i) => i.field === "linkedin.hashtags")).toBe(true);
  });

  it("flags a banned phrase", () => {
    const result = validateContent(
      makeContent({ linkedin: { text: `${words("alpha", 119)} leverage`, hashtags: ["#a", "#b", "#c", "#d"] } }),
      makeHistory(),
      THRESHOLD
    );
    expect(result.issues.some((i) => i.problem.includes('banned phrase "leverage"'))).toBe(true);
  });

  it("flags em-dash overuse", () => {
    const result = validateContent(
      makeContent({ instagram: { text: `${words("beta", 100)} — — — — —`, hashtags: makeContent().instagram.hashtags } }),
      makeHistory(),
      THRESHOLD
    );
    expect(result.issues.some((i) => i.problem.includes("em-dash"))).toBe(true);
  });

  it("flags rocket-emoji spam", () => {
    const result = validateContent(
      makeContent({ linkedin: { text: `${words("alpha", 120)} 🚀🚀🚀`, hashtags: ["#a", "#b", "#c", "#d"] } }),
      makeHistory(),
      THRESHOLD
    );
    expect(result.issues.some((i) => i.problem.includes("🚀"))).toBe(true);
  });

  it("flags LinkedIn and Instagram that are too similar to each other", () => {
    const shared = words("alpha", 120);
    const result = validateContent(
      makeContent({
        linkedin: { text: shared, hashtags: ["#a", "#b", "#c", "#d"] },
        instagram: { text: shared, hashtags: makeContent().instagram.hashtags },
      }),
      makeHistory(),
      THRESHOLD
    );
    expect(result.issues.some((i) => i.field.includes("instagram"))).toBe(true);
  });

  it("flags content too similar to a recent history record", () => {
    const content = makeContent();
    const twin = makeRecord({
      topic: content.topic,
      angle: content.angle,
      linkedin: { text: content.linkedin.text, hashtags: [], status: "published" },
    });
    const result = validateContent(content, makeHistory([twin]), THRESHOLD);
    expect(result.ok).toBe(false);
    expect(result.maxSimilarity).toBeGreaterThan(THRESHOLD);
    expect(result.mostSimilarDate).toBe(twin.date);
  });

  it("does not flag content that is dissimilar from history", () => {
    const result = validateContent(makeContent(), makeHistory([makeRecord()]), THRESHOLD);
    expect(result.ok).toBe(true);
    expect(result.maxSimilarity).toBeLessThan(THRESHOLD);
  });
});
