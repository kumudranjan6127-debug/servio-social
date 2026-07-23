/**
 * history.ts — durable memory of what was posted, backed by data/posts.json.
 *
 * Reading is tolerant: a missing or corrupt file degrades to an empty history
 * with a warning (the pipeline must never be blocked by its own bookkeeping).
 * Writing is atomic: the JSON is written to a temp file and renamed into
 * place so a crash mid-write can never leave a half-written posts.json.
 */

import fs from "node:fs";
import path from "node:path";
import type { HistoryFile, PostRecord } from "../types";
import { logger } from "./logger";

/** Repo-relative data locations (the workflow always runs from the repo root). */
const DATA_DIR: string = path.resolve(process.cwd(), "data");
const HISTORY_PATH: string = path.join(DATA_DIR, "posts.json");
const DRAFTS_DIR: string = path.join(DATA_DIR, "blog-drafts");

/** True when `value` is a plain object (and not null/array). */
function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when `value` has the string `text` + string[] `hashtags` core of a platform entry. */
function isPlatformEntry(value: unknown): boolean {
  return (
    isRecordObject(value) &&
    typeof value.text === "string" &&
    Array.isArray(value.hashtags) &&
    value.hashtags.every((h) => typeof h === "string")
  );
}

/**
 * Structural check that an unknown JSON value is usable as a PostRecord.
 * Deliberately checks only the fields the pipeline reads (date, topic, angle,
 * per-platform text/hashtags) so older records with extra or missing optional
 * fields survive a reload.
 */
function isPostRecordLike(value: unknown): value is PostRecord {
  return (
    isRecordObject(value) &&
    typeof value.date === "string" &&
    typeof value.topic === "string" &&
    typeof value.angle === "string" &&
    isPlatformEntry(value.linkedin) &&
    isPlatformEntry(value.instagram)
  );
}

/**
 * Loads data/posts.json. Never throws: a missing file, unreadable file,
 * invalid JSON, or unexpected shape all degrade to `{ posts: [] }` with a
 * warning. Individual malformed records are dropped (with a warning) while
 * the valid ones are kept.
 */
export function loadHistory(): HistoryFile {
  if (!fs.existsSync(HISTORY_PATH)) {
    logger.warn(`history: ${HISTORY_PATH} does not exist yet — starting with empty history`);
    return { posts: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(`history: could not read/parse ${HISTORY_PATH} (${reason}) — treating as empty`);
    return { posts: [] };
  }
  if (!isRecordObject(parsed) || !Array.isArray(parsed.posts)) {
    logger.warn(`history: ${HISTORY_PATH} has an unexpected shape — treating as empty`);
    return { posts: [] };
  }
  const valid: PostRecord[] = [];
  let dropped = 0;
  for (const entry of parsed.posts) {
    if (isPostRecordLike(entry)) {
      valid.push(entry);
    } else {
      dropped += 1;
    }
  }
  if (dropped > 0) {
    logger.warn(`history: dropped ${dropped} malformed record(s) while loading ${HISTORY_PATH}`);
  }
  logger.debug(`history: loaded ${valid.length} record(s) from ${HISTORY_PATH}`);
  return { posts: valid };
}

/** Serializes a history file the same way the seed file is formatted. */
function serialize(history: HistoryFile): string {
  return `${JSON.stringify(history, null, 2)}\n`;
}

/**
 * Appends one day's record to data/posts.json atomically (temp file + rename,
 * so a crash can never corrupt the history). If a record for the same date
 * already exists it is replaced — the system keeps exactly one record per day.
 */
export function saveRecord(r: PostRecord): void {
  const history = loadHistory();
  const existingIndex = history.posts.findIndex((p) => p.date === r.date);
  if (existingIndex >= 0) {
    logger.warn(`history: replacing existing record for ${r.date}`);
    history.posts[existingIndex] = r;
  } else {
    history.posts.push(r);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = `${HISTORY_PATH}.tmp`;
  fs.writeFileSync(tmpPath, serialize(history), "utf8");
  fs.renameSync(tmpPath, HISTORY_PATH);
  logger.info(`history: saved record for ${r.date} (${history.posts.length} total)`);
}

/**
 * True when the history already contains a record for `isoDate` (YYYY-MM-DD).
 * The orchestrator uses this to make the daily run idempotent.
 */
export function hasRecordForDate(h: HistoryFile, isoDate: string): boolean {
  return h.posts.some((p) => p.date === isoDate);
}

/**
 * Today's date as YYYY-MM-DD in the Asia/Kolkata timezone, regardless of the
 * machine's local timezone (GitHub runners are UTC).
 */
export function todayIst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Reduces arbitrary topic text to a safe kebab-case filename fragment. */
function toSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "topic";
}

/**
 * Writes the day's blog draft to data/blog-drafts/<date>-<slug>.md and
 * returns the absolute path of the file written. The slug is sanitized so any
 * topic string produces a valid filename.
 */
export function saveBlogDraft(dateIso: string, topicSlug: string, markdown: string): string {
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  const filePath = path.join(DRAFTS_DIR, `${dateIso}-${toSlug(topicSlug)}.md`);
  const content = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
  fs.writeFileSync(filePath, content, "utf8");
  logger.info(`history: blog draft saved to ${filePath}`);
  return filePath;
}
