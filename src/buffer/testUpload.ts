/**
 * testUpload.ts — verifies the Cloudinary image pipeline end to end WITHOUT
 * posting anything: it picks today's branded pool image, uploads it to
 * Cloudinary via the same `hostImage` path the daily run uses, and prints the
 * resulting public URL (open it in a browser to see the image).
 *
 * Run via `npm run cloudinary` (or workflow mode `cloudinary`). Unlike the
 * channels/models diagnostics this uses the full validated env (all four
 * required secrets must be present), because hostImage reads the Cloudinary
 * config through the normal `env` object.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { aiImageConfigured, imageHostingConfigured } from "../config/env";
import { hostImage } from "./uploadMedia";
import { pickLocalImage } from "../ai/generateImage";
import { refineImagePrompt } from "../ai/generateImagePrompt";
import type { GeneratedContent } from "../types";

/**
 * A minimal content stub with a realistic, abstract concept prompt (icons/flow,
 * not a literal screen). The pool provider only reads `topic`; the AI providers
 * read `imagePrompt`. We run it through refineImagePrompt below so the test
 * uses the exact same brand-safe prompt the daily run does.
 */
const STUB: GeneratedContent = {
  topic: "Web development",
  angle: "automating lead qualification on your website",
  research: "",
  linkedin: { text: "", hashtags: [] },
  instagram: { text: "", hashtags: [] },
  twitter: { text: "", hashtags: [] },
  blogDraft: "",
  imagePrompt:
    "Abstract concept of an automated web workflow: a simple form icon flowing " +
    "into a gear/AI node, branching to a calendar icon and an envelope icon, " +
    "connected by clean lines",
};
STUB.imagePrompt = refineImagePrompt(STUB);

/** True when this file is the process entry point (tsx src/buffer/testUpload.ts). */
function isRunAsScript(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const thisFile = fileURLToPath(import.meta.url);
  // Case-insensitive: Windows paths can differ in drive-letter casing.
  return path.resolve(entry).toLowerCase() === thisFile.toLowerCase();
}

async function main(): Promise<void> {
  if (!imageHostingConfigured) {
    console.log(
      "Cloudinary is NOT configured.\n" +
        "Add both secrets and rerun:\n" +
        "  - CLOUDINARY_CLOUD_NAME     (Cloudinary dashboard, top of the page)\n" +
        "  - CLOUDINARY_UPLOAD_PRESET  (Settings > Upload > an UNSIGNED preset)\n" +
        "Until then, posts go out without an image and Instagram is skipped."
    );
    process.exit(1);
  }

  console.log(
    `Cloudinary is configured. Image source: ${
      aiImageConfigured
        ? "AI generation (Cloudflare/fal), branded pool as fallback"
        : "branded pool"
    }.\nProducing today's image and uploading it to test the full pipeline...\n`
  );
  const local = await pickLocalImage(STUB);
  if (!local) {
    console.log("No image could be produced (fal.ai failed and no pool image in assets/pool).");
    process.exit(1);
  }
  console.log(`Chosen image: ${path.basename(local.filePath)} (aiGenerated: ${local.aiGenerated})`);

  const hosted = await hostImage(local);
  if (!hosted) {
    console.log(
      "\nUpload FAILED (see the cloudinary.upload error above). Most common causes:\n" +
        "  - the upload preset is SIGNED, not UNSIGNED (make it unsigned in Cloudinary\n" +
        "    Settings > Upload), or\n" +
        "  - the cloud name / preset name has a typo.\n" +
        "Instagram will stay skipped until this succeeds."
    );
    process.exit(1);
  }

  console.log(
    "\nSUCCESS — Cloudinary works. Public image URL:\n" +
      `  ${hosted.url}\n\n` +
      "Open that URL in a browser to confirm the image loads. From the next real run,\n" +
      "both posts carry this image and Instagram is no longer skipped."
  );
}

if (isRunAsScript()) {
  main().catch((err: unknown) => {
    console.error(`Cloudinary test failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
