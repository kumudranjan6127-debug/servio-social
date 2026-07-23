/**
 * logger.ts — leveled, timestamped logging for the whole pipeline.
 *
 * Every line goes to the console AND is appended to a plain-text file at
 * logs/run-YYYY-MM-DD.log (date computed in Asia/Kolkata so the file matches
 * the posting day). `logger.summary(md)` additionally appends markdown to the
 * GitHub Actions step summary when running inside a workflow.
 *
 * Logging must never crash the run: file-system failures degrade to a single
 * console warning and console-only logging.
 */

import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";

/** The four supported log levels, least to most severe. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Numeric rank per level so we can compare against env.LOG_LEVEL. */
const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** The level configured via LOG_LEVEL, typed explicitly for safe indexing. */
const configuredLevel: LogLevel = env.LOG_LEVEL;

/** Minimum rank a message needs to be emitted, from the validated environment. */
const ACTIVE_RANK: number = LEVEL_RANK[configuredLevel];

/** Directory the run logs are written into (created on first write). */
const LOGS_DIR: string = path.resolve(process.cwd(), "logs");

/** Set to true after the first failed file write so we only warn once. */
let fileLoggingBroken = false;

/**
 * Today's date as YYYY-MM-DD in the Asia/Kolkata timezone.
 *
 * Implemented locally (rather than importing history.todayIst) so the logger
 * has no dependency on modules that themselves log, avoiding an import cycle.
 */
function istDateStamp(): string {
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

/** Appends one already-formatted line to today's run log file, never throwing. */
function appendToRunLog(line: string): void {
  if (fileLoggingBroken) return;
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOGS_DIR, `run-${istDateStamp()}.log`), `${line}\n`, "utf8");
  } catch (error) {
    fileLoggingBroken = true;
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`logger: cannot write to ${LOGS_DIR} (${reason}) — continuing console-only`);
  }
}

/** Formats a message with an ISO timestamp and padded level tag. */
function formatLine(level: LogLevel, message: string): string {
  return `${new Date().toISOString()} [${level.toUpperCase().padEnd(5)}] ${message}`;
}

/** Emits one message to console + file if the active level allows it. */
function emit(level: LogLevel, message: string): void {
  if (LEVEL_RANK[level] < ACTIVE_RANK) return;
  const line = formatLine(level, message);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
  appendToRunLog(line);
}

/**
 * The logging surface every module uses. `debug`/`info`/`warn`/`error` write
 * leveled lines; `summary` publishes a markdown block to the GitHub Actions
 * step summary (and mirrors it to the normal log at info level).
 */
export interface Logger {
  /** Verbose diagnostics, hidden unless LOG_LEVEL=debug. */
  debug(message: string): void;
  /** Normal progress messages. */
  info(message: string): void;
  /** Something degraded but the run continues. */
  warn(message: string): void;
  /** Something failed. */
  error(message: string): void;
  /**
   * Appends markdown to the GitHub Actions step summary file when running in
   * a workflow (GITHUB_STEP_SUMMARY set); always mirrors it to the run log.
   */
  summary(markdown: string): void;
}

/**
 * The one shared logger instance. Import this — never construct another.
 */
export const logger: Logger = {
  debug(message: string): void {
    emit("debug", message);
  },
  info(message: string): void {
    emit("info", message);
  },
  warn(message: string): void {
    emit("warn", message);
  },
  error(message: string): void {
    emit("error", message);
  },
  summary(markdown: string): void {
    // Documented exception to the "only env.ts reads process.env" rule:
    // GITHUB_STEP_SUMMARY is injected by the GitHub Actions runner itself
    // (it is a runtime file path, not user configuration), per BUILD.md
    // §src/services. It is read here and nowhere else.
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
      try {
        fs.appendFileSync(summaryPath, `${markdown}\n`, "utf8");
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        emit("warn", `logger.summary: could not write step summary (${reason})`);
      }
    }
    // Mirror to the normal channels so local runs also see the summary.
    emit("info", `summary:\n${markdown}`);
  },
};
