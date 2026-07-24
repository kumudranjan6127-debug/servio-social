/**
 * generateImage.ts — optional AI image generation via fal.ai.
 *
 * When FAL_KEY is set, each post gets a bespoke professional image generated
 * from the day's `imagePrompt` (which the writer already produces), instead of
 * the static branded pool. This is PAID (a few cents per image) and entirely
 * optional: any failure — or no FAL_KEY — falls back to the free branded pool,
 * so the pipeline never breaks because of image generation.
 *
 * fal.ai returns a hosted image URL; we download it to a temp file and return a
 * LocalImage, so the rest of the pipeline (Cloudinary hosting → Buffer) is
 * unchanged and every image still ends up on a stable public URL.
 */

import axios from "axios";
import { z } from "zod";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { aiImageConfigured, env } from "../config/env";
import { logger } from "../services/logger";
import { retry } from "../services/retry";
import { poolImageProvider } from "../buffer/uploadMedia";
import type { GeneratedContent, ImageProvider, LocalImage } from "../types";

/** Image generation is slow; give it far more than the 30s HTTP default. */
const FAL_TIMEOUT_MS = 120_000;

/** fal.ai text-to-image response — the shape flux/recraft/sd models share. */
const FalResponse = z.object({
  images: z.array(z.object({ url: z.string().min(1) })).min(1),
});

/** "Web Development" -> "web-development" for a readable temp filename. */
function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "post";
}

/**
 * The fal.ai image provider. Generates one square image from the content's
 * imagePrompt, downloads it to a temp file, and returns it as a LocalImage
 * (aiGenerated: true). Returns null — and logs why — on any failure, so the
 * caller falls back to the branded pool.
 */
export const falImageProvider: ImageProvider = {
  name: "fal",
  async getImage(content: GeneratedContent): Promise<LocalImage | null> {
    if (!aiImageConfigured || !env.FAL_KEY) {
      return null;
    }
    const model = env.FAL_IMAGE_MODEL;
    const prompt =
      content.imagePrompt.trim().length > 0
        ? content.imagePrompt.trim()
        : `Modern minimal professional brand graphic about ${content.topic}, ` +
          "blue and white palette, clean, no text, no faces";

    try {
      const imageUrl = await retry("fal.generateImage", async () => {
        const res = await axios.post(
          `https://fal.run/${model}`,
          { prompt, image_size: "square_hd", num_images: 1 },
          {
            headers: { Authorization: `Key ${env.FAL_KEY}`, "Content-Type": "application/json" },
            timeout: FAL_TIMEOUT_MS,
          }
        );
        const parsed = FalResponse.parse(res.data);
        const first = parsed.images[0];
        if (!first) throw new Error("fal.ai returned no image");
        return first.url;
      });

      const bytes = await retry("fal.downloadImage", async () => {
        const res = await axios.get<ArrayBuffer>(imageUrl, {
          responseType: "arraybuffer",
          timeout: FAL_TIMEOUT_MS,
        });
        return Buffer.from(res.data);
      });

      const filePath = path.join(os.tmpdir(), `servio-ai-${slugify(content.topic)}.png`);
      await writeFile(filePath, bytes);
      logger.info(
        `fal.generateImage: generated a bespoke image via "${model}" for "${content.topic}"`
      );
      return {
        filePath,
        altText: `Servio illustration about ${content.topic}`,
        aiGenerated: true,
      };
    } catch (err) {
      logger.warn(
        `fal.generateImage: failed (${
          err instanceof Error ? err.message : String(err)
        }) — falling back to the branded pool`
      );
      return null;
    }
  },
};

/**
 * Resolves today's local image, preferring AI generation when configured and
 * falling back to the branded pool. Shared by the orchestrator and the image
 * diagnostic so both take exactly the same path.
 */
export async function pickLocalImage(content: GeneratedContent): Promise<LocalImage | null> {
  if (aiImageConfigured) {
    const generated = await falImageProvider.getImage(content);
    if (generated) return generated;
    logger.info("Using the branded pool (fal.ai unavailable or failed).");
  }
  return poolImageProvider.getImage(content);
}
