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

/**
 * Brand style constants appended to every image prompt. Steers toward a premium
 * 3D glassmorphism look — vibrant gradients, translucent frosted glass, depth and
 * studio lighting — while hard-forbidding text, UI writing and photorealistic
 * faces: the free/fast image models (e.g. FLUX-schnell) render any on-image text
 * as gibberish and faces poorly, so the reliable fix is to keep both out entirely.
 */
const IMAGE_STYLE =
  "Premium 3D-rendered concept art with rich glassmorphism: translucent frosted-glass " +
  "panels, layered transparency, soft blur, glossy reflections and inner glow, with real " +
  "depth and dimensional studio lighting. Vibrant saturated gradients — electric blue " +
  "(#1E4FFF) flowing into cyan, indigo, violet and magenta — over a clean soft-lit " +
  "background with gentle bloom and a shallow depth of field. Floating glossy geometric " +
  "shapes, frosted-glass cards, glowing orbs and abstract nodes and connectors that suggest " +
  "sleek modern web technology and digital craft. Polished, high-detail, dimensional, " +
  "energetic yet professional. NO TEXT, no words, no letters, no numbers, no readable labels " +
  "or UI writing, no photorealistic human faces, no logos or brand marks, no watermarks";

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
