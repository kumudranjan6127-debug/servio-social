/**
 * generateImagePrompt.ts — pure refinement of the AI-written image prompt.
 *
 * No AI calls here. Guarantees every image prompt ends with the Servio brand
 * style constants (modern, minimal, startup branding, blue/white palette,
 * clean typography, no photorealistic faces) regardless of what the writer
 * produced. This is the modular seam for future AI image generation: an image
 * provider can feed the returned prompt straight into any generator.
 */

import type { GeneratedContent } from "../types";

/** Brand style constants appended to every image prompt (per BUILD.md). */
const IMAGE_STYLE =
  "Modern minimal startup-tech style: clean flat composition, generous white space, " +
  "clean typography, blue (#1E4FFF family) and white palette, simple abstract geometric " +
  "shapes, professional and calm, no photorealistic faces, no clutter, no watermarks";

/**
 * Refine the generated image prompt into the final, brand-safe prompt.
 *
 * Pure function: whitespace is collapsed, an empty prompt falls back to a
 * topic/angle description, and the Servio style constants are appended exactly
 * once (skipped only when the prompt already contains them verbatim).
 *
 * @param content The generated content pack (uses imagePrompt, topic, angle).
 * @returns The final image prompt, ready for a future AI image generator.
 */
export function refineImagePrompt(content: GeneratedContent): string {
  const cleaned = content.imagePrompt.replace(/\s+/g, " ").trim();
  const base =
    cleaned.length > 0
      ? cleaned
      : `Abstract branded social media graphic representing ${content.topic}: ${content.angle}`;

  if (base.toLowerCase().includes(IMAGE_STYLE.toLowerCase())) {
    return base;
  }

  const separator = /[.!?]$/.test(base) ? " " : ". ";
  return `${base}${separator}${IMAGE_STYLE}.`;
}
