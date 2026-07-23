/**
 * listModels.ts — lists the Gemini models the owner's GEMINI_API_KEY can
 * actually use, and which ones support `generateContent` (the method this
 * project calls).
 *
 * Why this exists: a run that fails every Gemini call with HTTP 404 means the
 * configured GEMINI_MODEL is not available to that key/tier — Google returns
 * "404 Not Found" for a model you cannot access. This diagnostic prints the
 * real list so the correct name can be put into the GEMINI_MODEL secret.
 *
 * CLI mode (`npm run models`, i.e. `tsx src/ai/listModels.ts`) is, like
 * getChannels' CLI mode, a documented exception to the "only env.ts reads
 * process.env" rule: it validates ONLY GEMINI_API_KEY with its own tiny schema
 * so it can run before the rest of the configuration is settled.
 */

import "dotenv/config";
import axios from "axios";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Gemini REST base (same host/version the writer uses). */
const MODELS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Hard timeout for the outbound HTTP call. */
const TIMEOUT_MS = 30_000;

/** Only the fields we read from the ListModels response. */
const ModelsBody = z.object({
  models: z
    .array(
      z.object({
        name: z.string(),
        displayName: z.string().optional(),
        supportedGenerationMethods: z.array(z.string()).optional(),
      })
    )
    .optional(),
});

/** Turns any thrown value into a short human-readable message. */
function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body =
      err.response?.data === undefined ? "" : JSON.stringify(err.response.data).slice(0, 300);
    return status === undefined
      ? `network error calling Gemini: ${err.message}`
      : `Gemini responded HTTP ${status}${body ? `: ${body}` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** GETs the model list for the given key and returns the parsed models array. */
async function fetchModels(
  apiKey: string
): Promise<{ id: string; label: string; canGenerate: boolean }[]> {
  const res = await axios.get(MODELS_ENDPOINT, {
    headers: { "x-goog-api-key": apiKey },
    timeout: TIMEOUT_MS,
  });
  const parsed = ModelsBody.safeParse(res.data);
  if (!parsed.success) {
    throw new Error(
      `Unrecognized Gemini models response: ${JSON.stringify(res.data).slice(0, 300)}`
    );
  }
  return (parsed.data.models ?? []).map((m) => ({
    // The API returns "models/gemini-2.0-flash"; GEMINI_MODEL wants the bare id.
    id: m.name.replace(/^models\//, ""),
    label: m.displayName ?? "",
    canGenerate: (m.supportedGenerationMethods ?? []).includes("generateContent"),
  }));
}

// ---------------------------------------------------------------------------
// CLI mode (npm run models)
// ---------------------------------------------------------------------------

const CliEnvSchema = z.object({
  GEMINI_API_KEY: z.string().trim().min(10, "GEMINI_API_KEY looks empty or truncated"),
});

/** True when this file is the process entry point (tsx src/ai/listModels.ts). */
function isRunAsScript(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const thisFile = fileURLToPath(import.meta.url);
  // Case-insensitive: Windows paths can differ in drive-letter casing.
  return path.resolve(entry).toLowerCase() === thisFile.toLowerCase();
}

async function main(): Promise<void> {
  const parsed = CliEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Cannot list models — GEMINI_API_KEY is missing or invalid:");
    for (const issue of parsed.error.issues) console.error(`  - ${issue.message}`);
    console.error(
      "Set GEMINI_API_KEY in a local .env file (copy .env.example) or export it, then rerun " +
        "`npm run models`. Only the Gemini key is needed for this command."
    );
    process.exit(1);
  }

  console.log("Fetching the Gemini models your key can use...\n");
  const models = await fetchModels(parsed.data.GEMINI_API_KEY);
  const usable = models
    .filter((m) => m.canGenerate)
    .map((m) => m.id)
    .sort();

  if (usable.length === 0) {
    console.log(
      "Your key returned no models that support generateContent. Double-check the key at " +
        "https://aistudio.google.com/apikey (it may be restricted or from the wrong project)."
    );
    return;
  }

  console.log(
    "Models your key can use for writing (supportedGenerationMethods includes generateContent):"
  );
  for (const id of usable) console.log(`  - ${id}`);

  // Recommend a sensible default: prefer a current flash model if present.
  const preference = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-1.5-flash",
  ];
  const recommended = preference.find((p) => usable.includes(p)) ?? usable[0];
  console.log(
    `\nRecommended: set the GEMINI_MODEL secret to "${recommended ?? ""}".\n` +
      "  (GitHub → repo Settings → Secrets and variables → Actions → New repository secret,\n" +
      "   name GEMINI_MODEL, value one of the ids above. Leave it unset to use the default.)"
  );
}

if (isRunAsScript()) {
  main().catch((err: unknown) => {
    console.error(`Failed to list models: ${describeError(err)}`);
    process.exit(1);
  });
}
