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
import { cloudflareImageConfigured, env, falImageConfigured } from "../config/env";
import { logger } from "../services/logger";
import { retry } from "../services/retry";
import { poolImageProvider } from "../buffer/uploadMedia";
import type { GeneratedContent, ImageProvider, LocalImage } from "../types";

/** Image generation is slow; give it far more than the 30s HTTP default. */
const IMAGE_TIMEOUT_MS = 120_000;

/** Builds the text prompt for an image, falling back when none was produced. */
function imagePromptFor(content: GeneratedContent): string {
  return content.imagePrompt.trim().length > 0
    ? content.imagePrompt.trim()
    : `Modern minimal professional brand graphic about ${content.topic}, ` +
        "blue and white palette, clean, no text, no faces";
}

/** Writes downloaded image bytes to a temp file and returns the LocalImage. */
async function saveTempImage(
  bytes: Buffer,
  content: GeneratedContent,
  source: string
): Promise<LocalImage> {
  const filePath = path.join(os.tmpdir(), `servio-ai-${slugify(content.topic)}.png`);
  await writeFile(filePath, bytes);
  logger.info(`${source}: generated a bespoke image for "${content.topic}"`);
  return { filePath, altText: `Servio illustration about ${content.topic}`, aiGenerated: true };
}

/** "Web Development" -> "web-development" for a readable temp filename. */
function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "post";
}

// ---------------------------------------------------------------------------
// Cloudflare Workers AI (FREE, preferred)
// ---------------------------------------------------------------------------

/** Cloudflare Workers AI flux-1-schnell response: base64 image in result.image. */
const CloudflareResponse = z.object({
  success: z.boolean().optional(),
  result: z.object({ image: z.string().optional() }).optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

/**
 * Free image generation via Cloudflare Workers AI. Returns a LocalImage or null
 * (logged) on any failure, so the caller falls back to fal.ai or the pool.
 */
export const cloudflareImageProvider: ImageProvider = {
  name: "cloudflare",
  async getImage(content: GeneratedContent): Promise<LocalImage | null> {
    if (!cloudflareImageConfigured || !env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
      return null;
    }
    const model = env.CLOUDFLARE_IMAGE_MODEL;
    try {
      const base64 = await retry("cloudflare.generateImage", async () => {
        const res = await axios.post(
          `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
          { prompt: imagePromptFor(content), steps: 6 },
          {
            headers: {
              Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
              "Content-Type": "application/json",
            },
            timeout: IMAGE_TIMEOUT_MS,
          }
        );
        const parsed = CloudflareResponse.parse(res.data);
        const image = parsed.result?.image;
        if (!image || image.length === 0) {
          const why = parsed.errors?.map((e) => e.message).join("; ") ?? "no image in response";
          throw new Error(`Cloudflare returned no image: ${why}`);
        }
        return image;
      });
      return await saveTempImage(Buffer.from(base64, "base64"), content, `cloudflare (${model})`);
    } catch (err) {
      logger.warn(
        `cloudflare.generateImage: failed (${
          err instanceof Error ? err.message : String(err)
        }) — trying the next image source`
      );
      return null;
    }
  },
};

// ---------------------------------------------------------------------------
// fal.ai (PAID)
// ---------------------------------------------------------------------------

/** fal.ai text-to-image response — the shape flux/recraft/sd models share. */
const FalResponse = z.object({
  images: z.array(z.object({ url: z.string().min(1) })).min(1),
});

/**
 * Paid image generation via fal.ai. Generates one square image, downloads it,
 * and returns a LocalImage. Returns null (logged) on any failure.
 */
export const falImageProvider: ImageProvider = {
  name: "fal",
  async getImage(content: GeneratedContent): Promise<LocalImage | null> {
    if (!falImageConfigured || !env.FAL_KEY) {
      return null;
    }
    const model = env.FAL_IMAGE_MODEL;
    try {
      const imageUrl = await retry("fal.generateImage", async () => {
        const res = await axios.post(
          `https://fal.run/${model}`,
          { prompt: imagePromptFor(content), image_size: "square_hd", num_images: 1 },
          {
            headers: { Authorization: `Key ${env.FAL_KEY}`, "Content-Type": "application/json" },
            timeout: IMAGE_TIMEOUT_MS,
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
          timeout: IMAGE_TIMEOUT_MS,
        });
        return Buffer.from(res.data);
      });
      return await saveTempImage(bytes, content, `fal.ai (${model})`);
    } catch (err) {
      logger.warn(
        `fal.generateImage: failed (${
          err instanceof Error ? err.message : String(err)
        }) — trying the next image source`
      );
      return null;
    }
  },
};

/**
 * Resolves today's local image. Order: Cloudflare Workers AI (free) → fal.ai
 * (paid) → branded pool. Each AI source is tried only when configured, and any
 * failure transparently falls through to the next. Shared by the orchestrator
 * and the image diagnostic so both take exactly the same path.
 */
export async function pickLocalImage(content: GeneratedContent): Promise<LocalImage | null> {
  if (cloudflareImageConfigured) {
    const img = await cloudflareImageProvider.getImage(content);
    if (img) return img;
  }
  if (falImageConfigured) {
    const img = await falImageProvider.getImage(content);
    if (img) return img;
  }
  if (cloudflareImageConfigured || falImageConfigured) {
    logger.info("AI image generation unavailable — using the branded pool.");
  }
  return poolImageProvider.getImage(content);
}
