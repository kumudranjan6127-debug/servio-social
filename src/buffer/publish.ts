/**
 * publish.ts — sends one post to one Buffer channel via the createPost GraphQL
 * mutation. This module (with uploadMedia.ts) is the only code that talks to
 * Buffer's publishing API.
 *
 * Design notes:
 * - Enum values (`automatic`, `addToQueue`, `customScheduled`, `post`) are
 *   GraphQL ENUMS and are inlined UNQUOTED in the mutation document, per the
 *   build brief. String values are inlined as JSON-escaped GraphQL string
 *   literals (JSON string syntax is valid GraphQL string syntax), so we never
 *   have to guess Buffer's exact scalar type names for variable declarations.
 * - Both failure surfaces are handled: top-level GraphQL `errors[]` AND the
 *   `MutationError` union arm of the createPost payload.
 * - `publishPost` NEVER throws — it always resolves to a PublishResult. Only
 *   transport-level failures (network errors, non-2xx) are retried; a
 *   MutationError is a definitive business answer and is not retried.
 * - In DRY_RUN mode nothing is sent to Buffer; the exact mutation document is
 *   logged instead so a dry run shows precisely what would have been sent.
 */

import axios from "axios";
import { z } from "zod";
import { env } from "../config/env";
import { logger } from "../services/logger";
import { retry } from "../services/retry";
import type { PublishRequest, PublishResult } from "../types";

/** Buffer's GraphQL endpoint (GraphQL over plain POST, JSON body {query}). */
const BUFFER_ENDPOINT = "https://api.buffer.com";

/** Hard timeout for every outbound HTTP call, per the build brief. */
const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Mutation document
// ---------------------------------------------------------------------------

/**
 * Builds the full createPost mutation document for one request.
 * - queue-now (`mode: addToQueue`) when `req.dueAtIso` is absent, otherwise
 *   `mode: customScheduled` with the exact UTC instant.
 * - Attaches the image asset (public URL + alt text) when provided.
 * - Attaches Instagram metadata (feed post, isAiGenerated from the image) only
 *   for the Instagram target.
 */
function buildCreatePostDocument(req: PublishRequest): string {
  const fields: string[] = [
    `text: ${JSON.stringify(req.text)}`,
    `channelId: ${JSON.stringify(req.channelId)}`,
    "schedulingType: automatic",
  ];

  if (req.dueAtIso) {
    fields.push("mode: customScheduled", `dueAt: ${JSON.stringify(req.dueAtIso)}`);
  } else {
    fields.push("mode: addToQueue");
  }

  if (req.image) {
    fields.push(
      "assets: [{ image: { " +
        `url: ${JSON.stringify(req.image.url)}, ` +
        `metadata: { altText: ${JSON.stringify(req.image.altText)} } } }]`
    );
  }

  if (req.target === "instagram") {
    const isAiGenerated = req.image?.aiGenerated ?? false;
    fields.push(
      "metadata: { instagram: { type: post, shouldShareToFeed: true, " +
        `isAiGenerated: ${String(isAiGenerated)} } }`
    );
  }

  return (
    "mutation Create {\n" +
    `  createPost(input: { ${fields.join(", ")} }) {\n` +
    "    ... on PostActionSuccess { post { id dueAt } }\n" +
    "    ... on MutationError { message }\n" +
    "  }\n" +
    "}"
  );
}

// ---------------------------------------------------------------------------
// Response schema
// ---------------------------------------------------------------------------

const CreatePostBody = z.object({
  errors: z.array(z.object({ message: z.string() })).optional(),
  data: z
    .object({
      createPost: z
        .union([
          // PostActionSuccess arm. dueAt is left loose (unknown) because Buffer
          // may return an ISO string, an epoch number, or null for queued posts.
          z.object({ post: z.object({ id: z.string(), dueAt: z.unknown() }) }),
          // MutationError arm.
          z.object({ message: z.string() }),
        ])
        .nullish(),
    })
    .nullish(),
});

/** Normalizes Buffer's dueAt (string | number | null | absent) to a string or undefined. */
function normalizeDueAt(dueAt: unknown): string | undefined {
  if (typeof dueAt === "string") return dueAt;
  if (typeof dueAt === "number") return String(dueAt);
  return undefined;
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

/** Builds a failed PublishResult and logs the reason. */
function failure(req: PublishRequest, error: string): PublishResult {
  logger.error(`buffer.publish.${req.target}: ${error}`);
  return { target: req.target, ok: false, error };
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/**
 * Publishes one post to one Buffer channel. Queue-now by default; scheduled
 * for the exact UTC instant when `req.dueAtIso` is set. Retries transport
 * failures (3 attempts, exponential backoff) and never throws — the outcome
 * is always expressed as a PublishResult.
 */
export async function publishPost(req: PublishRequest): Promise<PublishResult> {
  try {
    const document = buildCreatePostDocument(req);

    if (env.DRY_RUN) {
      logger.info(
        `[dry-run] buffer.publish.${req.target}: NOT sending to Buffer. Mutation would be:\n${document}`
      );
      return { target: req.target, ok: true };
    }

    // Only the HTTP transport is inside retry(): network errors and non-2xx
    // responses throw (axios default) and are retried; the GraphQL body is
    // interpreted once, after a successful transport.
    const body = await retry(`buffer.publish.${req.target}`, async () => {
      const res = await axios.post(
        BUFFER_ENDPOINT,
        { query: document },
        {
          headers: {
            Authorization: `Bearer ${env.BUFFER_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: TIMEOUT_MS,
        }
      );
      const data: unknown = res.data;
      return data;
    });

    const parsed = CreatePostBody.safeParse(body);
    if (!parsed.success) {
      return failure(req, `Unrecognized Buffer response: ${JSON.stringify(body).slice(0, 300)}`);
    }
    if (parsed.data.errors && parsed.data.errors.length > 0) {
      const joined = parsed.data.errors.map((e) => e.message).join("; ");
      return failure(req, `Buffer GraphQL errors: ${joined}`);
    }
    const result = parsed.data.data?.createPost;
    if (result === null || result === undefined) {
      return failure(req, "Buffer response contained no createPost result");
    }
    if ("message" in result) {
      return failure(req, `Buffer MutationError: ${result.message}`);
    }

    const dueAt = normalizeDueAt(result.post.dueAt);
    logger.info(
      `buffer.publish.${req.target}: created post ${result.post.id}` +
        (dueAt ? ` (dueAt ${dueAt})` : " (queued)")
    );
    return { target: req.target, ok: true, postId: result.post.id, dueAt };
  } catch (err) {
    return failure(req, describeError(err));
  }
}

// ---------------------------------------------------------------------------
// Scheduling helper
// ---------------------------------------------------------------------------

/**
 * Returns the UTC ISO instant of 09:00 IST (Asia/Kolkata) `daysAhead` days
 * after TODAY IN IST (default 1 = tomorrow). 09:00 IST is 03:30 UTC on the
 * same calendar date, because IST is UTC+05:30 with no daylight saving.
 * Anchoring on the IST calendar date (not the UTC one) keeps `--week`
 * scheduling correct even when the run happens between 18:30 and 24:00 UTC,
 * when the two dates differ.
 */
export function nextNineAmIstIso(daysAhead = 1): string {
  // en-CA formatting yields YYYY-MM-DD.
  const istToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const nineAmIst = new Date(`${istToday}T03:30:00.000Z`);
  nineAmIst.setUTCDate(nineAmIst.getUTCDate() + daysAhead);
  return nineAmIst.toISOString();
}

/**
 * Returns the UTC ISO instant of the SOONEST upcoming 09:00 IST: today's 09:00
 * if it has not passed yet, otherwise tomorrow's. This lets the evening run
 * (~20:00 IST → tomorrow morning) and a backup morning run (~06:00 IST → the
 * same morning) both target the correct 09:00 slot, so the date-keyed
 * idempotency guard stops them from ever scheduling two posts for one day.
 */
export function nextUpcomingNineAmIstIso(): string {
  const now = new Date();
  const istToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayNineAm = new Date(`${istToday}T03:30:00.000Z`);
  if (now.getTime() < todayNineAm.getTime()) {
    return todayNineAm.toISOString();
  }
  const tomorrow = new Date(todayNineAm);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString();
}
