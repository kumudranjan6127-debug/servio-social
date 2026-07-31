/**
 * getChannels.ts — lists the Buffer channels (social accounts) connected to the
 * owner's Buffer organization(s), via Buffer's GraphQL API.
 *
 * Two ways in:
 *
 * 1. `getChannels()` — used by the orchestrator. Reads the API key from the
 *    validated `env` object like every other module.
 *
 * 2. CLI mode (`npm run channels`, i.e. `tsx src/buffer/getChannels.ts`) — the
 *    ONE documented exception to the "only env.ts reads process.env" rule.
 *    This mode exists so the owner can discover their channel IDs BEFORE the
 *    channel-ID environment variables exist. Importing `../config/env` would
 *    exit immediately ("BUFFER_LINKEDIN_CHANNEL_ID is required") — a chicken
 *    and egg problem. So this file:
 *      - never STATICALLY imports env/logger/retry (their import chain pulls in
 *        the full env validation);
 *      - in CLI mode, parses ONLY `BUFFER_API_KEY` with its own tiny Zod schema
 *        and prints results with plain `console` output;
 *      - in library mode, `getChannels()` dynamically imports env/logger/retry,
 *        which is safe because the orchestrator has already validated the env.
 */

import "dotenv/config";
import axios from "axios";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BufferChannel } from "../types";

/** Buffer's GraphQL endpoint (GraphQL over plain POST, JSON body {query}). */
const BUFFER_ENDPOINT = "https://api.buffer.com";

/** Hard timeout for every outbound HTTP call, per the build brief. */
const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// GraphQL documents + response schemas
// ---------------------------------------------------------------------------

const ORGANIZATIONS_QUERY = "query { account { organizations { id } } }";

/**
 * Builds the channels query for one organization. The organization id is
 * inlined as a JSON-escaped GraphQL string literal (JSON string syntax is
 * valid GraphQL string syntax) instead of a typed variable, so we never have
 * to guess Buffer's exact input scalar name for `organizationId`. The id comes
 * from Buffer's own API response, so inlining it is safe.
 */
function buildChannelsQuery(orgId: string): string {
  return `query { channels(input: { organizationId: ${JSON.stringify(orgId)} }) { id name service } }`;
}

const GraphqlErrorList = z.array(z.object({ message: z.string() })).optional();

const OrganizationsBody = z.object({
  errors: GraphqlErrorList,
  data: z
    .object({
      account: z.object({ organizations: z.array(z.object({ id: z.string() })) }).nullish(),
    })
    .nullish(),
});

const ChannelsBody = z.object({
  errors: GraphqlErrorList,
  data: z
    .object({
      channels: z
        .array(z.object({ id: z.string(), name: z.string(), service: z.string() }))
        .nullish(),
    })
    .nullish(),
});

// ---------------------------------------------------------------------------
// Core fetching (shared by library mode and CLI mode)
// ---------------------------------------------------------------------------

/** Sends one GraphQL query to Buffer and returns the raw (unknown) JSON body. */
async function postGraphql(apiKey: string, query: string): Promise<unknown> {
  const res = await axios.post(
    BUFFER_ENDPOINT,
    { query },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: TIMEOUT_MS,
    }
  );
  const body: unknown = res.data;
  return body;
}

/** Turns any thrown value into a short human-readable message. */
function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body =
      err.response?.data === undefined ? "" : JSON.stringify(err.response.data).slice(0, 300);
    return status === undefined
      ? `network error calling Buffer: ${err.message}`
      : `Buffer responded HTTP ${status}${body ? `: ${body}` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Formats top-level GraphQL errors into one message, or null if there are none. */
function joinGraphqlErrors(errors: { message: string }[] | undefined): string | null {
  if (!errors || errors.length === 0) return null;
  return errors.map((e) => e.message).join("; ");
}

/**
 * Resolves the organization id(s) for the account, then fetches the channels
 * of every organization and flattens them into one list. Throws on any
 * transport error, top-level GraphQL error, or malformed response — callers
 * decide whether to retry.
 */
async function fetchChannels(apiKey: string): Promise<BufferChannel[]> {
  const orgBodyRaw = await postGraphql(apiKey, ORGANIZATIONS_QUERY);
  const orgBody = OrganizationsBody.safeParse(orgBodyRaw);
  if (!orgBody.success) {
    throw new Error(
      `Unrecognized Buffer organizations response: ${JSON.stringify(orgBodyRaw).slice(0, 300)}`
    );
  }
  const orgErrors = joinGraphqlErrors(orgBody.data.errors);
  if (orgErrors) throw new Error(`Buffer GraphQL errors (organizations): ${orgErrors}`);

  const organizations = orgBody.data.data?.account?.organizations ?? [];
  if (organizations.length === 0) {
    throw new Error(
      "Buffer returned no organizations for this API key — check the key in the Buffer dashboard."
    );
  }

  const channels: BufferChannel[] = [];
  for (const org of organizations) {
    const chBodyRaw = await postGraphql(apiKey, buildChannelsQuery(org.id));
    const chBody = ChannelsBody.safeParse(chBodyRaw);
    if (!chBody.success) {
      throw new Error(
        `Unrecognized Buffer channels response for org ${org.id}: ` +
          JSON.stringify(chBodyRaw).slice(0, 300)
      );
    }
    const chErrors = joinGraphqlErrors(chBody.data.errors);
    if (chErrors) throw new Error(`Buffer GraphQL errors (channels, org ${org.id}): ${chErrors}`);
    for (const c of chBody.data.data?.channels ?? []) {
      channels.push({ id: c.id, name: c.name, service: c.service });
    }
  }
  return channels;
}

// ---------------------------------------------------------------------------
// Library mode
// ---------------------------------------------------------------------------

/**
 * Fetches every Buffer channel across all of the account's organizations,
 * with retry/backoff and logging. This is the entry point the orchestrator
 * uses; it requires a fully valid environment (env.ts validation).
 *
 * env/logger/retry are imported dynamically so that merely loading this module
 * in CLI mode never triggers full env validation (see file header).
 */
export async function getChannels(): Promise<BufferChannel[]> {
  const [{ env }, { logger }, { retry }] = await Promise.all([
    import("../config/env"),
    import("../services/logger"),
    import("../services/retry"),
  ]);
  const channels = await retry("buffer.getChannels", () => fetchChannels(env.BUFFER_API_KEY));
  logger.info(
    `buffer.getChannels: ${channels.length} channel(s): ` +
      channels.map((c) => `${c.service}/${c.name}`).join(", ")
  );
  return channels;
}

// ---------------------------------------------------------------------------
// CLI mode (npm run channels)
// ---------------------------------------------------------------------------

/**
 * The CLI's own tiny env schema: ONLY the Buffer API key. This is the
 * documented exception that lets the owner list channel IDs before the
 * channel-ID env vars exist.
 */
const CliEnvSchema = z.object({
  BUFFER_API_KEY: z.string().min(10, "BUFFER_API_KEY looks empty or truncated"),
});

/** Prints the channels as an aligned plain-text table for easy copying. */
function printChannelTable(channels: BufferChannel[]): void {
  const header = { id: "CHANNEL ID", name: "NAME", service: "SERVICE" };
  const idW = Math.max(header.id.length, ...channels.map((c) => c.id.length));
  const nameW = Math.max(header.name.length, ...channels.map((c) => c.name.length));
  const svcW = Math.max(header.service.length, ...channels.map((c) => c.service.length));
  const row = (a: string, b: string, c: string): string =>
    `| ${a.padEnd(idW)} | ${b.padEnd(nameW)} | ${c.padEnd(svcW)} |`;
  console.log(row(header.id, header.name, header.service));
  console.log(`|${"-".repeat(idW + 2)}|${"-".repeat(nameW + 2)}|${"-".repeat(svcW + 2)}|`);
  for (const c of channels) console.log(row(c.id, c.name, c.service));
}

/** True when this file is the process entry point (tsx src/buffer/getChannels.ts). */
function isRunAsScript(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const thisFile = fileURLToPath(import.meta.url);
  // Case-insensitive: Windows paths can differ in drive-letter casing.
  return path.resolve(entry).toLowerCase() === thisFile.toLowerCase();
}

/** CLI entry: validate the key, fetch channels once (no retry), print table. */
async function main(): Promise<void> {
  const parsed = CliEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Cannot list channels — BUFFER_API_KEY is missing or invalid:");
    for (const issue of parsed.error.issues) console.error(`  - ${issue.message}`);
    console.error(
      "Set BUFFER_API_KEY in a local .env file (copy .env.example) or export it, then rerun " +
        "`npm run channels`. Only the API key is needed for this command."
    );
    process.exit(1);
  }

  console.log("Fetching your Buffer channels...\n");
  const channels = await fetchChannels(parsed.data.BUFFER_API_KEY);
  if (channels.length === 0) {
    console.log(
      "No channels found. Connect your LinkedIn Page and Instagram account inside the " +
        "Buffer dashboard first, then rerun this command."
    );
    return;
  }
  printChannelTable(channels);

  // Optional SECOND Buffer account (BUFFER_API_KEY_2), used to reach channels
  // that don't fit the first account's free-plan channel limit (e.g. X,
  // Facebook). Listed separately so its ids are easy to copy into their secrets.
  const key2 = process.env.BUFFER_API_KEY_2?.trim();
  if (key2 && key2.length >= 10) {
    console.log("\n--- Second Buffer account (BUFFER_API_KEY_2) ---\n");
    try {
      const channels2 = await fetchChannels(key2);
      if (channels2.length === 0) console.log("No channels connected on the second account.");
      else printChannelTable(channels2);
    } catch (err) {
      console.error(`Could not list the second account's channels: ${describeError(err)}`);
    }
  }

  console.log(
    "\nCopy the CHANNEL ID values into your GitHub Actions secrets:\n" +
      "  - BUFFER_LINKEDIN_CHANNEL_ID   (service linkedin)\n" +
      "  - BUFFER_INSTAGRAM_CHANNEL_ID  (service instagram)\n" +
      "  - BUFFER_TWITTER_CHANNEL_ID    (service twitter / x, if present)\n" +
      "  - BUFFER_FACEBOOK_CHANNEL_ID   (service facebook, if present)"
  );
}

if (isRunAsScript()) {
  main().catch((err: unknown) => {
    console.error(`Failed to list channels: ${describeError(err)}`);
    process.exit(1);
  });
}
