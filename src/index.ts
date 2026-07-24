/**
 * index.ts — the orchestrator. Parses the CLI mode and runs one of three flows:
 *
 *   (no args)   DAILY  — generate today's content, validate it (regenerating
 *               with validator feedback when needed), publish to LinkedIn and
 *               Instagram via Buffer, save the history record + blog draft,
 *               notify the webhook, write the run summary.
 *   --week      WEEK   — generate 7 unique, mutually-dissimilar packs and
 *               schedule one for 09:00 IST on each of the next 7 days.
 *   --health    HEALTH — check every external dependency and print a table.
 *               Never posts.
 *
 * Exit-code contract: the daily run exits 1 ONLY when BOTH platforms failed.
 * A skipped platform (e.g. Instagram without a hosted image) is not a failure,
 * and neither is a dry run. The week run applies the same rule per day.
 */

import axios from "axios";

import { chooseTopic } from "./ai/chooseTopic";
import { normalizeHashtags } from "./ai/generateHashtags";
import { refineImagePrompt } from "./ai/generateImagePrompt";
import { geminiCall, generateContent } from "./ai/generatePost";
import { getChannels } from "./buffer/getChannels";
import { nextNineAmIstIso, nextUpcomingNineAmIstIso, publishPost } from "./buffer/publish";
import { hostImage } from "./buffer/uploadMedia";
import { pickLocalImage } from "./ai/generateImage";
import { env, imageHostingConfigured } from "./config/env";
import {
  hasRecordForDate,
  loadHistory,
  saveBlogDraft,
  saveRecord,
  todayIst,
} from "./services/history";
import { logger } from "./services/logger";
import { sleep } from "./services/retry";
import { validateContent } from "./services/validator";
import type {
  BufferChannel,
  ChosenTopic,
  GeneratedContent,
  HistoryFile,
  HostedImage,
  PlatformPost,
  PostRecord,
  PublishTarget,
} from "./types";

/** Pause between the LinkedIn and Instagram publish calls (per BUILD.md). */
const INTER_PUBLISH_SLEEP_MS = 2_000;
/** Webhook notification timeout (axios rule: 30s everywhere). */
const WEBHOOK_TIMEOUT_MS = 30_000;
/** How many days the --week flow schedules ahead. */
const WEEK_DAYS = 7;

/** The per-platform status union, derived from the frozen PostRecord contract. */
type PlatformStatus = PostRecord["linkedin"]["status"];

/**
 * What happened on one platform during a run — feeds the history record, the
 * summary table, and the exit code.
 */
interface PlatformOutcome {
  status: PlatformStatus;
  postId?: string;
  dueAt?: string;
  /** Human-readable one-liner for the summary table. */
  detail: string;
}

/** One row of the --health table. */
interface HealthCheck {
  name: string;
  ok: boolean;
  /** When false the check is informational only and never fails the run. */
  required: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/**
 * Joins a platform post's text and hashtags into the final outgoing text:
 * the body, a blank line, then the hashtags separated by spaces.
 */
function composeText(post: PlatformPost): string {
  if (post.hashtags.length === 0) return post.text;
  return `${post.text.trimEnd()}\n\n${post.hashtags.join(" ")}`;
}

/**
 * The IST (Asia/Kolkata) calendar date, YYYY-MM-DD, of a UTC ISO instant.
 * Used to label --week records with the day they will be published on.
 */
function istDateOf(utcIso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utcIso));
}

/** Formats any thrown value as a readable message. */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Sends {"text": ...} to NOTIFY_WEBHOOK_URL when configured. Fail-soft by
 * contract: a broken webhook only ever produces a warning, never a failed run.
 */
async function notifyWebhook(text: string): Promise<void> {
  if (!env.NOTIFY_WEBHOOK_URL) return;
  try {
    await axios.post(env.NOTIFY_WEBHOOK_URL, { text }, { timeout: WEBHOOK_TIMEOUT_MS });
    logger.info("webhook: notification sent");
  } catch (err) {
    logger.warn(`webhook: notification failed (ignored) — ${describe(err)}`);
  }
}

/** Logs a three-line banner so every run is easy to find in the logs. */
function banner(title: string): void {
  const line = "=".repeat(60);
  logger.info(line);
  logger.info(`${title}${env.DRY_RUN ? "  [DRY RUN — nothing will be sent]" : ""}`);
  logger.info(line);
}

// ---------------------------------------------------------------------------
// Channel verification (warn-only)
// ---------------------------------------------------------------------------

/**
 * Confirms one configured channel id exists in the Buffer account and that its
 * service name looks like the expected platform. Warn-only: a mismatch is
 * logged loudly but never stops the run (publishing surfaces the real error).
 */
function verifyChannel(
  channels: BufferChannel[],
  id: string,
  expectedService: PublishTarget
): void {
  const found = channels.find((c) => c.id === id);
  if (!found) {
    logger.warn(
      `Channel check: no channel with id "${id}" in this Buffer account — ` +
        `check BUFFER_${expectedService.toUpperCase()}_CHANNEL_ID (run \`npm run channels\`)`
    );
    return;
  }
  if (!found.service.toLowerCase().includes(expectedService)) {
    logger.warn(
      `Channel check: channel "${found.name}" (${id}) reports service "${found.service}" ` +
        `but is configured as the ${expectedService} channel — the ids may be swapped`
    );
    return;
  }
  logger.info(`Channel check ok: ${expectedService} → "${found.name}" (${id})`);
}

/**
 * Lists Buffer channels and verifies both configured channel ids. Entirely
 * fail-soft: even Buffer being unreachable only warns, because the publish
 * step will report the definitive error if there is one.
 */
async function verifyChannels(): Promise<void> {
  try {
    const channels = await getChannels();
    verifyChannel(channels, env.BUFFER_LINKEDIN_CHANNEL_ID, "linkedin");
    verifyChannel(channels, env.BUFFER_INSTAGRAM_CHANNEL_ID, "instagram");
  } catch (err) {
    logger.warn(
      `Channel check skipped — could not list Buffer channels (${describe(err)}). ` +
        "Publishing will surface the real error if the credentials are wrong."
    );
  }
}

// ---------------------------------------------------------------------------
// Generation with validation + regeneration feedback loop
// ---------------------------------------------------------------------------

/**
 * Generates one content pack and validates it. When validation fails, the
 * validator's issues are fed back into the writer prompt (the optional
 * `feedback` parameter of generateContent) and generation is retried, up to
 * env.MAX_REGEN_ATTEMPTS regenerations after the initial draft. Throws when
 * every attempt is rejected — the caller fails the run.
 */
async function generateValidated(
  choice: ChosenTopic,
  history: HistoryFile
): Promise<GeneratedContent> {
  const totalAttempts = 1 + env.MAX_REGEN_ATTEMPTS;
  let feedback: string[] | undefined;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    if (attempt > 1) {
      logger.warn(
        `Regenerating (attempt ${attempt}/${totalAttempts}) with ` +
          `${feedback?.length ?? 0} validator issue(s) as feedback`
      );
    }
    let content = await generateContent(choice, history, feedback);
    content = normalizeHashtags(content);
    content = { ...content, imagePrompt: refineImagePrompt(content) };

    const verdict = validateContent(content, history, env.SIMILARITY_THRESHOLD);
    if (verdict.ok) {
      logger.info(
        `Validation passed (max similarity vs history: ${verdict.maxSimilarity.toFixed(2)})`
      );
      return content;
    }
    logger.warn(`Validation rejected the draft with ${verdict.issues.length} issue(s):`);
    for (const issue of verdict.issues) {
      logger.warn(`  - ${issue.field}: ${issue.problem}`);
    }
    feedback = verdict.issues.map((i) => `${i.field}: ${i.problem}`);
  }

  throw new Error(
    `Content failed validation after ${totalAttempts} attempts ` +
      `(1 initial + ${env.MAX_REGEN_ATTEMPTS} regenerations) — see the log for the issues`
  );
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/**
 * Selects today's image — a bespoke fal.ai image when configured, otherwise the
 * branded pool — and hosts it publicly (Cloudinary). Returns null — and logs
 * why — whenever no public image can be produced; Instagram is then skipped by
 * the caller. Never called in DRY_RUN (per BUILD.md, both image steps are
 * skipped entirely there).
 */
async function prepareImage(content: GeneratedContent): Promise<HostedImage | null> {
  const local = await pickLocalImage(content);
  if (local === null) return null;
  const hosted = await hostImage(local);
  if (hosted === null) {
    logger.warn(
      "Image could not be hosted publicly " +
        `(Cloudinary ${imageHostingConfigured ? "upload failed" : "not configured"}) — ` +
        "posts go out without an image and Instagram will be skipped"
    );
  }
  return hosted;
}

/**
 * Publishes one platform's post and converts the result into a
 * PlatformOutcome. Wrapped defensively so one platform's problem can never
 * abort the other (publishPost itself already never throws by contract).
 */
async function publishTo(
  target: PublishTarget,
  channelId: string,
  post: PlatformPost,
  image: HostedImage | undefined,
  dueAtIso: string | undefined
): Promise<PlatformOutcome> {
  try {
    const result = await publishPost({
      target,
      channelId,
      text: composeText(post),
      image,
      dueAtIso,
    });
    if (!result.ok) {
      const reason = result.error ?? "unknown Buffer error";
      logger.error(`${target}: publish failed — ${reason}`);
      return { status: "failed", detail: reason };
    }
    if (env.DRY_RUN) {
      return { status: "dry-run", detail: "payload logged, nothing sent" };
    }
    if (dueAtIso !== undefined) {
      return {
        status: "scheduled",
        postId: result.postId,
        dueAt: result.dueAt,
        detail: `scheduled for ${result.dueAt ?? dueAtIso}`,
      };
    }
    return {
      status: "published",
      postId: result.postId,
      dueAt: result.dueAt,
      detail: "queued via Buffer",
    };
  } catch (err) {
    const reason = describe(err);
    logger.error(`${target}: unexpected publish error — ${reason}`);
    return { status: "failed", detail: reason };
  }
}

/**
 * Publishes (or schedules) both platforms for one content pack: LinkedIn
 * first, a 2-second pause, then Instagram — each independently, so one
 * failing never stops the other. Instagram is skipped (not failed) when no
 * hosted image exists outside DRY_RUN.
 */
async function publishBoth(
  content: GeneratedContent,
  hosted: HostedImage | null,
  dueAtIso: string | undefined
): Promise<{ linkedin: PlatformOutcome; instagram: PlatformOutcome }> {
  const image = hosted ?? undefined;
  const linkedin = await publishTo(
    "linkedin",
    env.BUFFER_LINKEDIN_CHANNEL_ID,
    content.linkedin,
    image,
    dueAtIso
  );

  let instagram: PlatformOutcome;
  if (!env.DRY_RUN && hosted === null) {
    instagram = {
      status: "skipped",
      detail: "no hosted image (Cloudinary not configured or upload failed)",
    };
    logger.warn(`instagram: skipped — ${instagram.detail}`);
  } else {
    await sleep(INTER_PUBLISH_SLEEP_MS);
    instagram = await publishTo(
      "instagram",
      env.BUFFER_INSTAGRAM_CHANNEL_ID,
      content.instagram,
      image,
      dueAtIso
    );
  }
  return { linkedin, instagram };
}

// ---------------------------------------------------------------------------
// Records and summaries
// ---------------------------------------------------------------------------

/** Assembles the PostRecord for one day's run from its parts. */
function buildRecord(
  date: string,
  content: GeneratedContent,
  linkedin: PlatformOutcome,
  instagram: PlatformOutcome,
  hosted: HostedImage | null
): PostRecord {
  const record: PostRecord = {
    date,
    topic: content.topic,
    angle: content.angle,
    linkedin: {
      text: content.linkedin.text,
      hashtags: content.linkedin.hashtags,
      status: linkedin.status,
    },
    instagram: {
      text: content.instagram.text,
      hashtags: content.instagram.hashtags,
      status: instagram.status,
    },
    twitter: { text: content.twitter.text, hashtags: content.twitter.hashtags },
    imagePrompt: content.imagePrompt,
    createdAtIso: new Date().toISOString(),
  };
  if (linkedin.postId !== undefined) record.linkedin.postId = linkedin.postId;
  if (instagram.postId !== undefined) record.instagram.postId = instagram.postId;
  if (hosted !== null) record.imageUrl = hosted.url;
  return record;
}

/** One markdown table row for a platform outcome. */
function outcomeRow(label: string, o: PlatformOutcome): string {
  return `| ${label} | ${o.status} | ${o.postId ?? "—"} | ${o.detail} |`;
}

/** The markdown summary for a completed daily run. */
function dailySummaryMd(
  date: string,
  content: GeneratedContent,
  linkedin: PlatformOutcome,
  instagram: PlatformOutcome,
  hosted: HostedImage | null,
  draftPath: string
): string {
  const reviewNote =
    env.REVIEW_WINDOW && !env.DRY_RUN
      ? `\n\n> **Scheduled for ${date} 09:00 IST.** Open your Buffer dashboard to review, edit, or delete it before then — otherwise it publishes automatically.`
      : "";
  return [
    `## Servio social — daily run ${date}${env.DRY_RUN ? " (dry run)" : ""}`,
    reviewNote,
    "",
    `**Topic:** ${content.topic} — ${content.angle}`,
    "",
    "| Platform | Status | Post id | Detail |",
    "| --- | --- | --- | --- |",
    outcomeRow("LinkedIn", linkedin),
    outcomeRow("Instagram", instagram),
    "",
    `**Image:** ${hosted ? hosted.url : "none"}`,
    "",
    `**Blog draft:** ${draftPath}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// DAILY flow
// ---------------------------------------------------------------------------

/**
 * The daily flow, exactly per BUILD.md: idempotency guard, warn-only channel
 * verification, generate + validate (with regeneration feedback), image
 * selection + hosting (skipped in DRY_RUN), independent per-platform
 * publishing, record + blog draft, webhook, summary.
 *
 * @returns The process exit code: 1 only when BOTH platforms failed.
 */
async function runDaily(): Promise<number> {
  // Review window (default): schedule the post for the NEXT 09:00 IST so it
  // waits in Buffer for review; the record + idempotency then key on the
  // PUBLISH date (that morning), not the generation moment. 03:30 UTC == 09:00
  // IST on the same calendar date, so the ISO's date part IS the IST post date.
  const dueAtIso = env.REVIEW_WINDOW ? nextUpcomingNineAmIstIso() : undefined;
  const postDate = dueAtIso ? dueAtIso.slice(0, 10) : todayIst();
  banner(
    env.REVIEW_WINDOW
      ? `servio-social — daily run: scheduling for ${postDate} 09:00 IST (review in Buffer)`
      : `servio-social — daily run for ${postDate} (IST)`
  );

  const history = loadHistory();
  if (hasRecordForDate(history, postDate)) {
    logger.info(
      `A post for ${postDate} already exists — nothing to do (idempotency guard). Exiting 0.`
    );
    return 0;
  }

  await verifyChannels();

  const choice = await chooseTopic(history);
  logger.info(`Topic: "${choice.topic}" — ${choice.angle} (${choice.reason})`);
  const content = await generateValidated(choice, history);

  let hosted: HostedImage | null = null;
  if (env.DRY_RUN) {
    logger.info("[dry-run] skipping image selection and hosting");
  } else {
    hosted = await prepareImage(content);
  }

  const { linkedin, instagram } = await publishBoth(content, hosted, dueAtIso);

  if (env.DRY_RUN) {
    logger.info("[dry-run] skipping saveRecord — data/posts.json stays untouched");
  } else {
    saveRecord(buildRecord(postDate, content, linkedin, instagram, hosted));
  }
  const draftPath = saveBlogDraft(postDate, content.topic, content.blogDraft);

  const bothFailed = linkedin.status === "failed" && instagram.status === "failed";
  const statusLine = `LinkedIn ${linkedin.status}, Instagram ${instagram.status}`;
  const verb = env.REVIEW_WINDOW ? "scheduled for" : "posted";
  await notifyWebhook(
    bothFailed
      ? `Servio social ${postDate}: FAILED — ${statusLine}`
      : `Servio social ${postDate}: "${content.topic}" ${verb} ${postDate} 09:00 IST — ${statusLine}` +
          (env.REVIEW_WINDOW ? " (review/edit/delete in Buffer before then)" : "")
  );

  logger.summary(dailySummaryMd(postDate, content, linkedin, instagram, hosted, draftPath));
  return bothFailed ? 1 : 0;
}

// ---------------------------------------------------------------------------
// WEEK flow
// ---------------------------------------------------------------------------

/** What the week flow remembers about each day, for the summary table. */
interface WeekRow {
  date: string;
  topic: string;
  linkedin: PlatformOutcome;
  instagram: PlatformOutcome;
}

/**
 * The --week flow: generates 7 unique packs and schedules each for 09:00 IST
 * on the next 7 days (customScheduled via nextNineAmIstIso(1..7)). Accepted
 * packs are appended to a working copy of the history before the next one is
 * generated, so chooseTopic's LRU and the validator's similarity checks make
 * the 7 packs mutually unique and dissimilar, not just dissimilar from the
 * past. Days that already have a history record are skipped.
 *
 * @returns Exit code: 1 when any scheduled day had BOTH platforms fail
 *   (the daily exit rule, applied per day).
 */
async function runWeek(): Promise<number> {
  banner("servio-social — week run: scheduling the next 7 days at 09:00 IST");

  const working: HistoryFile = { posts: [...loadHistory().posts] };
  await verifyChannels();

  const rows: WeekRow[] = [];
  let anyDayBothFailed = false;

  for (let daysAhead = 1; daysAhead <= WEEK_DAYS; daysAhead++) {
    const dueAtIso = nextNineAmIstIso(daysAhead);
    const date = istDateOf(dueAtIso);
    logger.info(`--- Day ${daysAhead}/${WEEK_DAYS}: ${date} (dueAt ${dueAtIso}) ---`);

    if (hasRecordForDate(working, date)) {
      logger.info(`${date} already has a history record — skipping this day.`);
      continue;
    }

    const choice = await chooseTopic(working);
    logger.info(`Topic: "${choice.topic}" — ${choice.angle} (${choice.reason})`);
    const content = await generateValidated(choice, working);

    let hosted: HostedImage | null = null;
    if (env.DRY_RUN) {
      logger.info("[dry-run] skipping image selection and hosting");
    } else {
      hosted = await prepareImage(content);
    }

    const { linkedin, instagram } = await publishBoth(content, hosted, dueAtIso);

    const record = buildRecord(date, content, linkedin, instagram, hosted);
    if (env.DRY_RUN) {
      logger.info("[dry-run] skipping saveRecord for this day");
    } else {
      saveRecord(record);
    }
    saveBlogDraft(date, content.topic, content.blogDraft);

    // Feed the accepted pack into the working history so the remaining days
    // are generated against it (uniqueness + mutual dissimilarity).
    working.posts.push(record);

    if (linkedin.status === "failed" && instagram.status === "failed") {
      anyDayBothFailed = true;
    }
    rows.push({ date, topic: content.topic, linkedin, instagram });
  }

  const scheduled = rows.filter(
    (r) => r.linkedin.status !== "failed" || r.instagram.status !== "failed"
  ).length;
  await notifyWebhook(
    `Servio social week run: ${scheduled}/${rows.length} day(s) scheduled` +
      (anyDayBothFailed ? " — at least one day FAILED on both platforms" : "")
  );

  logger.summary(
    [
      `## Servio social — week run${env.DRY_RUN ? " (dry run)" : ""}`,
      "",
      "| Date | Topic | LinkedIn | Instagram |",
      "| --- | --- | --- | --- |",
      ...rows.map(
        (r) => `| ${r.date} | ${r.topic} | ${r.linkedin.status} | ${r.instagram.status} |`
      ),
    ].join("\n")
  );
  return anyDayBothFailed ? 1 : 0;
}

// ---------------------------------------------------------------------------
// HEALTH flow
// ---------------------------------------------------------------------------

/** Health-table row for one configured Buffer channel id. */
function channelHealth(
  channels: BufferChannel[] | null,
  name: string,
  id: string,
  expectedService: PublishTarget
): HealthCheck {
  if (channels === null) {
    return { name, ok: false, required: true, detail: "could not verify — Buffer unreachable" };
  }
  const found = channels.find((c) => c.id === id);
  if (!found) {
    return {
      name,
      ok: false,
      required: true,
      detail: `channel id "${id}" not found in this Buffer account (run \`npm run channels\`)`,
    };
  }
  const serviceNote = found.service.toLowerCase().includes(expectedService)
    ? ""
    : ` — WARNING: service "${found.service}" does not look like ${expectedService}`;
  return {
    name,
    ok: true,
    required: true,
    detail: `"${found.name}" (service: ${found.service})${serviceNote}`,
  };
}

/**
 * The --health flow: verifies every external dependency without posting
 * anything — env (implicitly valid, since importing env.ts would have exited
 * otherwise), Gemini (one-word generation), Buffer account + channels, both
 * channel ids, Cloudinary configured yes/no (informational), and history
 * readability. Prints the table to the log and the step summary.
 *
 * @returns Exit code: 1 when any REQUIRED check failed.
 */
async function runHealth(): Promise<number> {
  banner("servio-social — health check (no posting)");
  const checks: HealthCheck[] = [];

  checks.push({
    name: "Environment",
    ok: true,
    required: true,
    detail: "all required variables present (validated on startup by env.ts)",
  });

  try {
    const reply = await geminiCall("Reply with exactly one word: ok", { temperature: 0 });
    checks.push({
      name: "Gemini",
      ok: true,
      required: true,
      detail: `${env.GEMINI_MODEL} replied "${reply.trim().slice(0, 20)}"`,
    });
  } catch (err) {
    checks.push({ name: "Gemini", ok: false, required: true, detail: describe(err) });
  }

  let channels: BufferChannel[] | null = null;
  try {
    channels = await getChannels();
    checks.push({
      name: "Buffer",
      ok: true,
      required: true,
      detail: `account reachable — ${channels.length} channel(s) connected`,
    });
  } catch (err) {
    checks.push({ name: "Buffer", ok: false, required: true, detail: describe(err) });
  }
  checks.push(
    channelHealth(channels, "LinkedIn channel", env.BUFFER_LINKEDIN_CHANNEL_ID, "linkedin")
  );
  checks.push(
    channelHealth(channels, "Instagram channel", env.BUFFER_INSTAGRAM_CHANNEL_ID, "instagram")
  );

  checks.push({
    name: "Cloudinary",
    ok: true,
    required: false,
    detail: imageHostingConfigured
      ? "configured — images will be hosted, Instagram gets posts"
      : "not configured — posts go out without images, Instagram is skipped",
  });

  const history = loadHistory();
  checks.push({
    name: "History",
    ok: true,
    required: true,
    detail: `data/posts.json readable — ${history.posts.length} record(s)`,
  });

  for (const check of checks) {
    const mark = check.ok ? "OK  " : "FAIL";
    logger.info(`[${mark}] ${check.name}: ${check.detail}`);
  }
  logger.summary(
    [
      "## Servio social — health check",
      "",
      "| Check | Result | Detail |",
      "| --- | --- | --- |",
      ...checks.map(
        (c) => `| ${c.name} | ${c.ok ? "ok" : c.required ? "FAILED" : "info"} | ${c.detail} |`
      ),
    ].join("\n")
  );

  const failed = checks.filter((c) => c.required && !c.ok);
  if (failed.length > 0) {
    logger.error(`Health check FAILED: ${failed.map((c) => c.name).join(", ")}`);
    return 1;
  }
  logger.info("Health check passed — every required dependency is reachable.");
  return 0;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** The three run modes the CLI understands. */
type RunMode = "daily" | "week" | "health";

/**
 * Parses the CLI arguments, runs the selected flow, and translates any
 * uncaught error into a logged failure + webhook notification + exit code 1.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode: RunMode = args.includes("--health")
    ? "health"
    : args.includes("--week")
      ? "week"
      : "daily";

  try {
    let code: number;
    switch (mode) {
      case "health":
        code = await runHealth();
        break;
      case "week":
        code = await runWeek();
        break;
      case "daily":
        code = await runDaily();
        break;
    }
    process.exitCode = code;
  } catch (err) {
    const reason = describe(err);
    logger.error(`${mode} run failed: ${reason}`);
    if (mode !== "health") {
      await notifyWebhook(`Servio social (${mode} run, ${todayIst()}): FAILED — ${reason}`);
    }
    logger.summary(`## Servio social — ${mode} run FAILED\n\n${reason}`);
    process.exitCode = 1;
  }
}

void main();
