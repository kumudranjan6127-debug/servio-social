/**
 * uploadMedia.ts — turns a local image into a publicly reachable URL that
 * Buffer can attach to a post (Buffer has NO upload mutation — images must be
 * public URLs). Hosting is Cloudinary's unsigned upload API and is entirely
 * optional: when it is not configured or fails, callers receive null and the
 * pipeline degrades gracefully (Instagram is skipped, LinkedIn posts text-only).
 *
 * Also exports the default ImageProvider: a deterministic picker over the
 * bundled branded pool in assets/pool/*.png, keyed by day-of-year so each day
 * gets a stable choice and the pool rotates naturally.
 */

import axios from "axios";
import { z } from "zod";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, imageHostingConfigured } from "../config/env";
import { logger } from "../services/logger";
import { retry } from "../services/retry";
import type { GeneratedContent, HostedImage, ImageProvider, LocalImage } from "../types";

/** Hard timeout for every outbound HTTP call, per the build brief. */
const TIMEOUT_MS = 30_000;

/** Absolute path to the bundled branded image pool (assets/pool/ at repo root). */
const POOL_DIR = fileURLToPath(new URL("../../assets/pool/", import.meta.url));

// ---------------------------------------------------------------------------
// Cloudinary unsigned upload
// ---------------------------------------------------------------------------

/** The only field we need from Cloudinary's upload response. */
const CloudinaryResponse = z.object({ secure_url: z.string().min(1) });

/** Turns any thrown value into a short human-readable message. */
function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body =
      err.response?.data === undefined ? "" : JSON.stringify(err.response.data).slice(0, 300);
    return status === undefined
      ? `network error calling Cloudinary: ${err.message}`
      : `Cloudinary responded HTTP ${status}${body ? `: ${body}` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Uploads a local image to Cloudinary via the unsigned upload endpoint and
 * returns a HostedImage carrying the public `secure_url`. Returns null (never
 * throws) when Cloudinary is not configured, or when the upload still fails
 * after retries — callers treat null as "no image available".
 */
export async function hostImage(img: LocalImage): Promise<HostedImage | null> {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const preset = env.CLOUDINARY_UPLOAD_PRESET;
  if (!imageHostingConfigured || !cloudName || !preset) {
    logger.info(
      "cloudinary.upload: not configured (CLOUDINARY_CLOUD_NAME / CLOUDINARY_UPLOAD_PRESET) — " +
        "no image will be hosted"
    );
    return null;
  }

  try {
    const bytes = await readFile(img.filePath);
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

    const uploaded = await retry("cloudinary.upload", async () => {
      // A fresh FormData per attempt: request bodies are consumed on send.
      const form = new FormData();
      form.append("file", new Blob([bytes]), path.basename(img.filePath));
      form.append("upload_preset", preset);
      const res = await axios.post(uploadUrl, form, { timeout: TIMEOUT_MS });
      return CloudinaryResponse.parse(res.data);
    });

    logger.info(
      `cloudinary.upload: hosted ${path.basename(img.filePath)} at ${uploaded.secure_url}`
    );
    return { url: uploaded.secure_url, altText: img.altText, aiGenerated: img.aiGenerated };
  } catch (err) {
    logger.error(`cloudinary.upload: giving up — ${describeError(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Default image provider: deterministic pick from the branded pool
// ---------------------------------------------------------------------------

/** Day of year (1..366) for the current date in IST, matching the posting day. */
function dayOfYearIst(now: Date = new Date()): number {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // YYYY-MM-DD
  const parts = iso.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
}

/**
 * The default ImageProvider. Picks deterministically from assets/pool/*.png
 * using day-of-year modulo pool size (filenames sorted, so the choice is
 * stable for a given day regardless of filesystem order). The pool images are
 * pre-rendered brand graphics, so `aiGenerated` is false; alt text is derived
 * from the day's topic. Returns null (Instagram then gets skipped) when the
 * pool is empty or unreadable.
 */
export const poolImageProvider: ImageProvider = {
  name: "pool",
  async getImage(content: GeneratedContent): Promise<LocalImage | null> {
    try {
      const entries = await readdir(POOL_DIR);
      const pngs = entries.filter((f) => f.toLowerCase().endsWith(".png")).sort();
      if (pngs.length === 0) {
        logger.warn(
          "poolImageProvider: no .png files in assets/pool — run `npm run images` to generate " +
            "the branded pool; continuing without an image"
        );
        return null;
      }
      const chosen = pngs[dayOfYearIst() % pngs.length];
      if (chosen === undefined) {
        // Unreachable (length checked above); satisfies strict index checks.
        return null;
      }
      logger.debug(`poolImageProvider: picked ${chosen} (${pngs.length} in pool)`);
      return {
        filePath: path.join(POOL_DIR, chosen),
        altText: `Servio branded graphic for a post about ${content.topic}`,
        aiGenerated: false,
      };
    } catch (err) {
      logger.error(
        `poolImageProvider: could not read assets/pool — ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return null;
    }
  },
};
