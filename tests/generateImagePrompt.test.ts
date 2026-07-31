import { describe, it, expect } from "vitest";
import { refineImagePrompt } from "../src/ai/generateImagePrompt";
import { makeContent } from "./fixtures";

describe("refineImagePrompt", () => {
  it("appends the brand style constants to a normal prompt", () => {
    const out = refineImagePrompt(makeContent({ imagePrompt: "A laptop on a desk" }));
    expect(out.startsWith("A laptop on a desk")).toBe(true);
    expect(out).toContain("glassmorphism");
    expect(out).toContain("#1E4FFF");
    expect(out).toContain("NO TEXT");
  });

  it("collapses runs of whitespace in the base prompt", () => {
    const out = refineImagePrompt(makeContent({ imagePrompt: "A   laptop\n\non   a    desk" }));
    expect(out.startsWith("A laptop on a desk")).toBe(true);
  });

  it("falls back to a topic/angle description when the prompt is empty", () => {
    const out = refineImagePrompt(makeContent({ imagePrompt: "   ", topic: "SEO", angle: "rank higher" }));
    expect(out).toContain("SEO");
    expect(out).toContain("rank higher");
    expect(out).toContain("glassmorphism");
  });

  it("does not append the style block twice when it is already present", () => {
    const once = refineImagePrompt(makeContent({ imagePrompt: "A laptop" }));
    const twice = refineImagePrompt(makeContent({ imagePrompt: once }));
    expect(twice).toBe(once);
  });

  it("uses '. ' as the separator when the base does not end in punctuation", () => {
    const out = refineImagePrompt(makeContent({ imagePrompt: "A laptop" }));
    expect(out).toContain("A laptop. Premium 3D");
  });

  it("uses a single space separator when the base already ends in punctuation", () => {
    const out = refineImagePrompt(makeContent({ imagePrompt: "A laptop!" }));
    expect(out).toContain("A laptop! Premium 3D");
  });
});
