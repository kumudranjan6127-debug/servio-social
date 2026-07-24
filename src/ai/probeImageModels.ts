/**
 * probeImageModels.ts — tests whether the owner's GEMINI_API_KEY can generate
 * IMAGES for free. Gemini image models (e.g. gemini-2.5-flash-image) use the
 * same generateContent endpoint as text, but with responseModalities including
 * "IMAGE"; a successful call returns the picture as inline base64 data.
 *
 * A 200 with image bytes on a key with no billing == free image generation for
 * this key (the cleanest possible option: same key, no new service, $0). A 429
 * means the model needs a paid plan; a 404 means it is not available.
 *
 * Run via workflow mode `gemini-image` (or `npm run gemini-image`). Validates
 * ONLY GEMINI_API_KEY, like the other diagnostics.
 */

import "dotenv/config";
import axios from "axios";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GENERATE_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 60_000;

const CliEnvSchema = z.object({
  GEMINI_API_KEY: z.string().trim().min(10, "GEMINI_API_KEY looks empty or truncated"),
});

/** Loose parse of a generateContent image response: is there inline image data? */
const ImageResponse = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  inlineData: z.object({ mimeType: z.string(), data: z.string() }).optional(),
                  inline_data: z.object({ mime_type: z.string(), data: z.string() }).optional(),
                })
              )
              .optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

/** Turns any thrown value into a short human-readable message. */
function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body =
      err.response?.data === undefined ? "" : JSON.stringify(err.response.data).slice(0, 260);
    return status === undefined
      ? `network error: ${err.message}`
      : `HTTP ${status}${body ? `: ${body}` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Returns the size (in base64 chars) of the first inline image, or 0 if none. */
function imageBytes(data: unknown): number {
  const parsed = ImageResponse.safeParse(data);
  if (!parsed.success) return 0;
  for (const c of parsed.data.candidates ?? []) {
    for (const p of c.content?.parts ?? []) {
      const d = p.inlineData?.data ?? p.inline_data?.data;
      if (d && d.length > 0) return d.length;
    }
  }
  return 0;
}

/** Attempts one image generation. Returns "ok (...)" or a status+body string. */
async function probeImageModel(apiKey: string, model: string): Promise<string> {
  try {
    const res = await axios.post(
      `${GENERATE_BASE}/${model}:generateContent`,
      {
        contents: [
          {
            role: "user",
            parts: [
              { text: "A simple minimal blue circle centered on a white background, no text" },
            ],
          },
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      },
      { headers: { "x-goog-api-key": apiKey }, timeout: TIMEOUT_MS }
    );
    const size = imageBytes(res.data);
    return size > 0
      ? `ok (image returned, ~${Math.round(size / 1000)}KB base64)`
      : "200 but no image in response";
  } catch (err) {
    return describeError(err);
  }
}

/** True when this file is the process entry point (tsx src/ai/probeImageModels.ts). */
function isRunAsScript(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(entry).toLowerCase() === thisFile.toLowerCase();
}

async function main(): Promise<void> {
  const parsed = CliEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Cannot test image models — GEMINI_API_KEY is missing or invalid:");
    for (const issue of parsed.error.issues) console.error(`  - ${issue.message}`);
    process.exit(1);
  }

  const candidates = [
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image",
    "gemini-3.1-flash-lite-image",
    "gemini-3-pro-image",
  ];

  console.log("Testing whether your Gemini key can generate images (free) ...\n");
  let firstWorking = "";
  for (const model of candidates) {
    const result = await probeImageModel(parsed.data.GEMINI_API_KEY, model);
    const ok = result.startsWith("ok");
    console.log(`  ${ok ? "WORKS " : "FAIL  "} ${model}${ok ? "  — " + result : "  — " + result}`);
    if (ok && firstWorking === "") firstWorking = model;
  }

  if (firstWorking === "") {
    console.log(
      "\nNo Gemini image model generated for free with this key (see reasons above).\n" +
        "429 = needs a paid plan; 404 = not available. Free Gemini images are not an option\n" +
        "for this key — use Cloudflare Workers AI (free) or fal.ai (paid) instead."
    );
    return;
  }
  console.log(
    `\n>>> FREE image generation works: "${firstWorking}".\n` +
      "This reuses your existing Gemini key at no cost — the cleanest option. Tell me and\n" +
      "I'll wire it in as the image provider (replacing the paid fal.ai path)."
  );
}

if (isRunAsScript()) {
  main().catch((err: unknown) => {
    console.error(`Image-model test failed: ${describeError(err)}`);
    process.exit(1);
  });
}
