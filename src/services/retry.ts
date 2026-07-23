/**
 * retry.ts — generic exponential-backoff retry used around every external call.
 *
 * Pure orchestration: no network, no environment access. Delays follow
 * baseMs * 2^(attempt-1) (1s / 2s / 4s with the defaults) plus a small random
 * jitter so parallel runs don't retry in lockstep.
 */

import { logger } from "./logger";

/** Upper bound (ms) of the random jitter added to each backoff delay. */
const JITTER_MS = 250;

/**
 * Resolves after `ms` milliseconds. Exported so callers can pause between
 * steps (e.g. the 2s gap between LinkedIn and Instagram publishes).
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Human-readable one-line description of a thrown value for log messages. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Runs `fn`, retrying with exponential backoff when it throws.
 *
 * @param label Short name of the operation for log lines, e.g. "gemini:writer".
 * @param fn The async operation to attempt.
 * @param opts.attempts Total attempts including the first (default 3).
 * @param opts.baseMs First backoff delay in ms; doubles each retry (default 1000).
 * @returns Whatever `fn` resolves to on the first successful attempt.
 * @throws The last error once every attempt has failed.
 */
export async function retry<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseMs?: number }
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  const baseMs = opts?.baseMs ?? 1000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delayMs = baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * JITTER_MS);
      logger.warn(
        `${label}: attempt ${attempt}/${attempts} failed (${describeError(error)}) — ` +
          `retrying in ${delayMs}ms`
      );
      await sleep(delayMs);
    }
  }

  logger.error(`${label}: all ${attempts} attempts failed (${describeError(lastError)})`);
  if (lastError instanceof Error) throw lastError;
  throw new Error(`${label}: ${String(lastError)}`);
}
