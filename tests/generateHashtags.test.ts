import { describe, it, expect } from "vitest";
import { normalizeHashtags } from "../src/ai/generateHashtags";
import { makeContent } from "./fixtures";

describe("normalizeHashtags", () => {
  it("strips a leading '#' and re-adds exactly one", () => {
    const out = normalizeHashtags(
      makeContent({ linkedin: { text: "t", hashtags: ["##WebDev", "#SEO", "#SaaS", "#Growth"] } })
    );
    expect(out.linkedin.hashtags).toContain("#WebDev");
    expect(out.linkedin.hashtags.every((t) => /^#[^#]/.test(t))).toBe(true);
  });

  it("CamelCases multi-word tags and removes stray characters", () => {
    const out = normalizeHashtags(
      makeContent({ linkedin: { text: "t", hashtags: ["web development!", "#s.e.o", "#a", "#b"] } })
    );
    expect(out.linkedin.hashtags).toContain("#WebDevelopment");
    expect(out.linkedin.hashtags).toContain("#Seo");
  });

  it("dedupes case-insensitively, first occurrence wins", () => {
    const out = normalizeHashtags(
      makeContent({ linkedin: { text: "t", hashtags: ["#WebDev", "#webdev", "#WEBDEV", "#SEO", "#SaaS"] } })
    );
    const webdevs = out.linkedin.hashtags.filter((t) => t.toLowerCase() === "#webdev");
    expect(webdevs).toEqual(["#WebDev"]);
  });

  it("clamps LinkedIn to at most 6 tags", () => {
    const out = normalizeHashtags(
      makeContent({
        linkedin: { text: "t", hashtags: ["#a", "#b", "#c", "#d", "#e", "#f", "#g", "#h"] },
      })
    );
    expect(out.linkedin.hashtags).toHaveLength(6);
  });

  it("tops a short LinkedIn list up to the minimum, brand-first", () => {
    const out = normalizeHashtags(makeContent({ linkedin: { text: "t", hashtags: ["#One"] } }));
    expect(out.linkedin.hashtags.length).toBeGreaterThanOrEqual(4);
    expect(out.linkedin.hashtags).toContain("#Servio");
  });

  it("enforces the Instagram range (8-15)", () => {
    const out = normalizeHashtags(makeContent({ instagram: { text: "t", hashtags: ["#Only"] } }));
    expect(out.instagram.hashtags.length).toBeGreaterThanOrEqual(8);
    expect(out.instagram.hashtags.length).toBeLessThanOrEqual(15);
  });

  it("enforces the Twitter range (1-2)", () => {
    const out = normalizeHashtags(
      makeContent({ twitter: { text: "t", hashtags: ["#a", "#b", "#c", "#d"] } })
    );
    expect(out.twitter.hashtags.length).toBeGreaterThanOrEqual(1);
    expect(out.twitter.hashtags.length).toBeLessThanOrEqual(2);
  });

  it("does not mutate the input content", () => {
    const input = makeContent({ linkedin: { text: "t", hashtags: ["#raw tag"] } });
    const snapshot = JSON.stringify(input);
    normalizeHashtags(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
