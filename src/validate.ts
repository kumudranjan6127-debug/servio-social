// =============================================================================
// validate.ts - the content checker for servio-social. Run with: npm run validate
//
// It reads every YAML content file in this repo and checks two things:
//
//   1. Shape - each file matches its JSON Schema in schemas/ (right fields,
//      right kinds of values, no typos in field names).
//   2. Sense - rules a single schema cannot see, because they span files:
//        - calendar ids are globally unique and start with the entry's date
//        - every "cta:" actually exists in brand/ctas.yml
//        - every "slot:" actually exists in config/settings.yml
//        - evergreen entries have no date (they are date-less by design)
//        - holiday dates are real calendar dates
//        - a draft's folder name matches the id inside its post.yml
//
// Every error is written in plain English: which file, which entry, what is
// wrong, and how to fix it. The script exits with code 1 when anything is
// wrong (which turns the GitHub Actions check red) and prints a green summary
// when everything is fine.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import Ajv from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

// The script is always run from the repo root (that is what "npm run validate" does).
const ROOT = process.cwd();

const PLATFORM_NAMES = ["linkedin", "x", "instagram", "facebook"] as const;
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// Hard character limits per platform. A draft whose text is longer than this
// would be rejected by the platform itself at publish time, so we catch it
// here, while a human can still fix it. Note on X: this simple count is
// slightly conservative - X counts every link as 23 characters regardless of
// its real length, so a long-URL post may actually fit even if it fails here.
const PLATFORM_TEXT_LIMITS: Record<string, number> = {
  x: 280,
  linkedin: 3000,
  instagram: 2200,
  facebook: 63206,
};

// ---------------------------------------------------------------------------
// Problem collection. We gather every problem first and print them all at the
// end, so one mistake does not hide the others.
// ---------------------------------------------------------------------------

interface Problem {
  file: string; // which file the problem is in
  entry?: string; // which entry inside the file (id, slug, holiday name, ...)
  what: string; // what is wrong, in plain English
  fix: string; // how to fix it, in plain English
}

const problems: Problem[] = [];
const warnings: string[] = [];

function fail(file: string, entry: string | undefined, what: string, fix: string): void {
  problems.push({ file, entry, what, fix });
}

function warn(message: string): void {
  warnings.push(message);
}

// Console colors (work in GitHub Actions and every modern terminal).
const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string): string => `\x1b[33m${s}\x1b[0m`;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// True only for a real calendar date written as YYYY-MM-DD (so 2026-02-30 fails).
function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Read and parse one YAML file. A syntax error becomes a plain-English problem.
function readYaml(relPath: string): unknown {
  const text = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  try {
    return parseYaml(text);
  } catch (error) {
    const firstLine = error instanceof Error ? error.message.split("\n")[0] : String(error);
    fail(
      relPath,
      undefined,
      `the file is not valid YAML (${firstLine})`,
      "Fix the YAML syntax. This is usually an indentation or quoting mistake near the position mentioned above."
    );
    return undefined;
  }
}

// Like readYaml, but the file is required to exist.
function requireYaml(relPath: string, fixIfMissing: string): unknown {
  if (!fs.existsSync(path.join(ROOT, relPath))) {
    fail(relPath, undefined, "the file is missing", fixIfMissing);
    return undefined;
  }
  return readYaml(relPath);
}

// ---------------------------------------------------------------------------
// Schema setup. Schemas live in schemas/ as JSON files; Ajv is the library
// that checks data against them.
// ---------------------------------------------------------------------------

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

for (const [key, fileName] of [
  ["settings", "settings.schema.json"],
  ["brand", "brand.schema.json"],
  ["ctas", "ctas.schema.json"],
  ["calendar", "calendar.schema.json"],
  ["draft", "draft.schema.json"],
] as const) {
  const schemaPath = path.join(ROOT, "schemas", fileName);
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as object;
  ajv.addSchema(schema, key);
}

function schemaFor(ref: string): ValidateFunction {
  const fn = ajv.getSchema(ref);
  if (!fn) {
    // This can only happen if the tooling itself is broken, not the content.
    throw new Error(`Internal error: schema "${ref}" not found. This is a bug in the tooling, not in your content files.`);
  }
  return fn;
}

// Turn Ajv's technical error objects into plain-English problems.
function explainAjvErrors(errors: ErrorObject[] | null | undefined, file: string, entry?: string): void {
  for (const err of errors ?? []) {
    // Where inside the entry the problem is, e.g. (in "platforms > 2").
    const at = err.instancePath
      ? ` (in "${err.instancePath.replace(/^\//, "").replace(/\//g, " > ")}")`
      : "";

    switch (err.keyword) {
      case "required": {
        const missing = (err.params as { missingProperty: string }).missingProperty;
        fail(file, entry, `is missing the required field "${missing}"${at}`, `Add a "${missing}:" line. docs/ARCHITECTURE.md shows the expected shape.`);
        break;
      }
      case "additionalProperties": {
        const extra = (err.params as { additionalProperty: string }).additionalProperty;
        fail(file, entry, `has an unexpected field "${extra}"${at}`, "Remove that field, or fix its spelling. docs/ARCHITECTURE.md lists the allowed fields.");
        break;
      }
      case "enum": {
        const allowed = (err.params as { allowedValues: unknown[] }).allowedValues.map(String).join(", ");
        fail(file, entry, `has a value that is not one of the allowed options${at}`, `Use one of: ${allowed}.`);
        break;
      }
      case "pattern": {
        const pattern = (err.params as { pattern: string }).pattern;
        fail(file, entry, `has a value written in the wrong format${at}`, `The value must match the pattern ${pattern}. See docs/ARCHITECTURE.md for examples.`);
        break;
      }
      case "type": {
        const expected = String((err.params as { type: string }).type);
        fail(file, entry, `has the wrong kind of value${at} (expected: ${expected})`, "Compare with the example shapes in docs/ARCHITECTURE.md.");
        break;
      }
      case "format": {
        const format = (err.params as { format: string }).format;
        fail(file, entry, `has a value that is not a valid ${format}${at}`, "Examples of valid values: 2026-07-23 (date), 2026-07-23T10:00:00Z (date-time), https://example.com (link).");
        break;
      }
      case "minItems":
      case "minProperties": {
        fail(file, entry, `has an empty list or section${at}`, "Add at least one item, or remove the section entirely if it is not needed.");
        break;
      }
      case "uniqueItems": {
        fail(file, entry, `has duplicate items in a list${at}`, "Remove the duplicate. Each platform may appear only once.");
        break;
      }
      case "maxLength": {
        const limit = (err.params as { limit: number }).limit;
        fail(file, entry, `has text that is longer than the ${limit}-character limit${at}`, `Shorten the text to at most ${limit} characters.`);
        break;
      }
      case "propertyNames": {
        fail(file, entry, `has a badly formed name${at}`, "Names must be lowercase words joined by hyphens, like get-quote or morning.");
        break;
      }
      default: {
        fail(file, entry, `${err.message ?? "is invalid"}${at}`, "Compare the file with the shapes in docs/ARCHITECTURE.md.");
      }
    }
  }
}

// Validate one piece of data against one schema, recording plain-English
// problems. Returns true when the data is valid.
function checkShape(ref: string, data: unknown, file: string, entry?: string): boolean {
  const validateFn = schemaFor(ref);
  const ok = validateFn(data) === true;
  if (!ok) explainAjvErrors(validateFn.errors, file, entry);
  return ok;
}

// ---------------------------------------------------------------------------
// Counters for the final summary
// ---------------------------------------------------------------------------

let filesChecked = 0;
let calendarEntries = 0;
let holidayCount = 0;
let draftsChecked = 0;

// ---------------------------------------------------------------------------
// 1. config/settings.yml
// ---------------------------------------------------------------------------

// Filled from settings; used later to cross-check every "slot:" in the calendar.
let slotNames: Set<string> | null = null;

const settingsDoc = requireYaml(
  "config/settings.yml",
  "Create config/settings.yml. The canonical version is shown in docs/ARCHITECTURE.md."
);

if (settingsDoc !== undefined) {
  filesChecked++;
  if (checkShape("settings", settingsDoc, "config/settings.yml") && isRecord(settingsDoc)) {
    if (isRecord(settingsDoc.slots)) {
      slotNames = new Set(Object.keys(settingsDoc.slots));
    }

    // Is the timezone a real IANA timezone? (The schema can only check it is text.)
    if (typeof settingsDoc.timezone === "string") {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: settingsDoc.timezone });
      } catch {
        fail(
          "config/settings.yml",
          undefined,
          `"${settingsDoc.timezone}" is not a recognized timezone name`,
          'Use an IANA timezone name such as "Asia/Kolkata".'
        );
      }
    }

    // Guard the locked decisions. These are warnings, not errors, because the
    // schema allows the values for later phases - but they should never change
    // without the owner's explicit say-so.
    if (settingsDoc.mode === "auto") {
      warn(
        'config/settings.yml: mode is set to "auto". The owner-approved decision locks this to "review" (a human must merge the pull request before anything is published). Change it back to "review" unless that decision was explicitly revisited.'
      );
    }
    if (isRecord(settingsDoc.platforms)) {
      for (const name of PLATFORM_NAMES) {
        const platform = settingsDoc.platforms[name];
        if (isRecord(platform) && platform.enabled === true) {
          warn(
            `config/settings.yml: platform "${name}" is enabled, but in Phase 0 every platform must stay disabled (the system cannot post yet anyway).`
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. brand/brand.yml
// ---------------------------------------------------------------------------

const brandDoc = requireYaml(
  "brand/brand.yml",
  "Create brand/brand.yml describing the Servio brand (identity, services, pricing, audience, voice, avoid-list)."
);
if (brandDoc !== undefined) {
  filesChecked++;
  checkShape("brand", brandDoc, "brand/brand.yml");
}

// ---------------------------------------------------------------------------
// 3. brand/ctas.yml - also collects the set of valid CTA keys
// ---------------------------------------------------------------------------

let ctaKeys: Set<string> | null = null;

const ctasDoc = requireYaml(
  "brand/ctas.yml",
  'Create brand/ctas.yml with a top-level "ctas:" map of call-to-action entries.'
);
if (ctasDoc !== undefined) {
  filesChecked++;
  if (isRecord(ctasDoc) && !("ctas" in ctasDoc) && Object.keys(ctasDoc).length > 0) {
    // A likely mistake deserves a clearer message than the schema would give.
    fail(
      "brand/ctas.yml",
      undefined,
      'the CTA entries sit at the top level of the file, but they must live under a single "ctas:" key',
      'Add a "ctas:" line at the top of the file and indent every CTA entry one level underneath it.'
    );
  } else if (checkShape("ctas", ctasDoc, "brand/ctas.yml") && isRecord(ctasDoc) && isRecord(ctasDoc.ctas)) {
    ctaKeys = new Set(Object.keys(ctasDoc.ctas));
  }
}

// Cross-check helpers. They quietly skip when the value is absent (the schema
// already reports missing required fields) or when the reference data itself
// failed to load (no point piling extra errors on top).

function checkCta(cta: unknown, file: string, entry: string): void {
  if (typeof cta !== "string" || ctaKeys === null) return;
  if (!ctaKeys.has(cta)) {
    fail(
      file,
      entry,
      `uses the cta "${cta}", which does not exist in brand/ctas.yml`,
      `Use one of: ${[...ctaKeys].sort().join(", ")}. Or add "${cta}" to brand/ctas.yml first.`
    );
  }
}

function checkSlot(slot: unknown, file: string, entry: string): void {
  if (typeof slot !== "string" || slotNames === null) return;
  if (!slotNames.has(slot)) {
    fail(
      file,
      entry,
      `uses the slot "${slot}", which is not defined in config/settings.yml`,
      `Use one of: ${[...slotNames].sort().join(", ")}. Or add the slot under "slots:" in config/settings.yml.`
    );
  }
}

function checkPlatformsList(platforms: unknown, file: string, entry: string): void {
  if (!Array.isArray(platforms)) return; // schema already complains if missing or not a list
  for (const p of platforms) {
    if (typeof p === "string" && !(PLATFORM_NAMES as readonly string[]).includes(p)) {
      fail(file, entry, `lists an unknown platform "${p}"`, `Platforms must be a subset of: ${PLATFORM_NAMES.join(", ")}.`);
    }
  }
}

// Instagram cannot publish a post without an image, so any calendar entry that
// targets instagram must have one ("image: none" only works for the others).
function checkInstagramNeedsImage(platforms: unknown, image: unknown, file: string, entry: string): void {
  if (!Array.isArray(platforms) || !platforms.includes("instagram")) return;
  if (image === "none" || image === undefined) {
    fail(
      file,
      entry,
      'targets instagram but has no image ("image: none" or the image line is missing) - Instagram cannot publish a post without one',
      'Set image to a template (for example "template:tip-card") or an asset path, or remove instagram from the platforms list.'
    );
  }
}

// ---------------------------------------------------------------------------
// 4. calendar/ - monthly files, recurring.yml, evergreen.yml
// ---------------------------------------------------------------------------

// Every dated id lives here (id -> file it was first seen in) so duplicates
// across different monthly files are caught too. Ids are the system's dedup
// key: a duplicate id could make a post publish twice or never.
const allIds = new Map<string, string>();

function handleDatedFile(rel: string, doc: unknown, month: string): void {
  if (doc === null) {
    fail(rel, undefined, "the file is empty", "Add at least one calendar entry, or delete the file.");
    return;
  }
  if (!Array.isArray(doc)) {
    fail(rel, undefined, "should be a list of calendar entries", 'Start each entry with "- id: ..." so the file is a YAML list.');
    return;
  }

  doc.forEach((entryRaw, index) => {
    calendarEntries++;
    const entry = isRecord(entryRaw) ? entryRaw : undefined;
    const label = entry && typeof entry.id === "string" ? entry.id : `entry #${index + 1}`;

    checkShape("calendar#/definitions/datedEntry", entryRaw, rel, label);
    if (!entry) return;

    // Ids must be globally unique - they are the dedup key for publishing.
    if (typeof entry.id === "string") {
      const firstSeenIn = allIds.get(entry.id);
      if (firstSeenIn !== undefined) {
        fail(rel, entry.id, `the id "${entry.id}" is already used in ${firstSeenIn}. Ids must be unique across the whole calendar`, "Give this entry a different id.");
      } else {
        allIds.set(entry.id, rel);
      }
    }

    // Date checks: real date, id starts with it, and it belongs in this file's month.
    if (typeof entry.date === "string") {
      if (!isRealIsoDate(entry.date)) {
        fail(rel, label, `the date "${entry.date}" is not a real calendar date`, "Write dates as YYYY-MM-DD (for example 2026-07-23) and make sure the day exists.");
      } else {
        if (typeof entry.id === "string" && !entry.id.startsWith(`${entry.date}-`)) {
          fail(rel, entry.id, `the id does not start with the entry's date (${entry.date})`, `Rename the id to something like "${entry.date}-short-topic".`);
        }
        if (!entry.date.startsWith(`${month}-`)) {
          fail(rel, label, `the date ${entry.date} does not belong in this file, which covers ${month}`, `Move this entry to calendar/${entry.date.slice(0, 7)}.yml.`);
        }
      }
    } else if (entry.date !== undefined) {
      fail(rel, label, "the date must be written as plain text like 2026-07-23", "Remove any quotes-free special YAML formatting from the date value.");
    }

    checkSlot(entry.slot, rel, label);
    checkCta(entry.cta, rel, label);
    checkPlatformsList(entry.platforms, rel, label);
    checkInstagramNeedsImage(entry.platforms, entry.image, rel, label);
  });
}

function handleEvergreenFile(rel: string, doc: unknown): void {
  if (doc === null) {
    warn(`${rel} is empty. No evergreen backup posts are available yet.`);
    return;
  }
  if (!Array.isArray(doc)) {
    fail(rel, undefined, "should be a list of evergreen entries", 'Start each entry with "- slug: ..." so the file is a YAML list.');
    return;
  }

  const seenSlugs = new Map<string, number>();

  doc.forEach((entryRaw, index) => {
    calendarEntries++;
    const entry = isRecord(entryRaw) ? entryRaw : undefined;
    const label = entry && typeof entry.slug === "string" ? entry.slug : `entry #${index + 1}`;

    // Friendly checks first for the two most likely mistakes, with clearer
    // messages than the schema would produce. We then remove the offending
    // fields from a copy so the schema does not report the same thing twice.
    let toValidate: unknown = entryRaw;
    if (entry) {
      const copy = { ...entry };
      if ("date" in entry) {
        fail(rel, label, "has a date, but evergreen entries must not have one. They are used automatically on days with no planned post", "Remove the date line, or move this entry into the monthly calendar file for that date.");
        delete copy.date;
        toValidate = copy;
      }
      if ("id" in entry && !("slug" in entry)) {
        fail(rel, label, 'uses "id:", but evergreen entries use "slug:" instead (the full id is built as date + slug on the day the entry is used)', 'Rename the field to "slug:" and drop any date prefix from its value.');
        delete copy.id;
        toValidate = copy;
      }
    }
    checkShape("calendar#/definitions/evergreenEntry", toValidate, rel, label);
    if (!entry) return;

    // Slugs must not repeat, or two future posts would collide.
    if (typeof entry.slug === "string") {
      const firstIndex = seenSlugs.get(entry.slug);
      if (firstIndex !== undefined) {
        fail(rel, entry.slug, `the slug "${entry.slug}" is already used by entry #${firstIndex + 1} in this file`, "Give this evergreen entry its own unique slug.");
      } else {
        seenSlugs.set(entry.slug, index);
      }
    }

    checkSlot(entry.slot, rel, label);
    checkCta(entry.cta, rel, label);
    checkPlatformsList(entry.platforms, rel, label);
    checkInstagramNeedsImage(entry.platforms, entry.image, rel, label);
  });
}

function handleRecurringFile(rel: string, doc: unknown): void {
  if (doc === null) {
    warn(`${rel} is empty. No weekly rhythm or holidays are defined.`);
    return;
  }
  checkShape("calendar#/definitions/recurringFile", doc, rel);
  if (!isRecord(doc)) return;

  if (isRecord(doc.weekly)) {
    for (const day of WEEKDAYS) {
      const dayPlan = doc.weekly[day];
      if (!isRecord(dayPlan)) continue;
      checkSlot(dayPlan.slot, rel, `weekly.${day}`);
      checkCta(dayPlan.cta, rel, `weekly.${day}`);
      checkPlatformsList(dayPlan.platforms, rel, `weekly.${day}`);
    }
  }

  if (Array.isArray(doc.holidays)) {
    doc.holidays.forEach((holidayRaw, index) => {
      holidayCount++;
      const holiday = isRecord(holidayRaw) ? holidayRaw : undefined;
      if (!holiday) return; // schema already reported the malformed item
      const label = typeof holiday.name === "string" ? `holiday "${holiday.name}"` : `holiday #${index + 1}`;

      if (typeof holiday.date === "string") {
        if (!isRealIsoDate(holiday.date)) {
          fail(rel, label, `the date "${holiday.date}" is not a real calendar date`, "Write holiday dates as YYYY-MM-DD, for example 2026-08-15, and make sure the day exists.");
        }
      } else if (holiday.date !== undefined) {
        fail(rel, label, "the date must be written as plain text like 2026-08-15", "Remove any special YAML formatting from the date value.");
      }

      checkSlot(holiday.slot, rel, label);
      checkCta(holiday.cta, rel, label);
      checkPlatformsList(holiday.platforms, rel, label);
    });
  }
}

const calendarDir = path.join(ROOT, "calendar");
const calendarFiles = fs.existsSync(calendarDir)
  ? fs
      .readdirSync(calendarDir)
      .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
      .sort()
  : [];

if (calendarFiles.length === 0) {
  warn("calendar/ has no YAML files yet, so nothing is scheduled. Add a monthly file like calendar/2026-08.yml when you are ready.");
}

for (const fileName of calendarFiles) {
  const rel = `calendar/${fileName}`;
  const doc = readYaml(rel);
  filesChecked++;

  const monthMatch = /^(\d{4}-\d{2})\.(yml|yaml)$/.exec(fileName);
  if (monthMatch) {
    if (doc !== undefined) handleDatedFile(rel, doc, monthMatch[1]);
  } else if (fileName === "recurring.yml" || fileName === "recurring.yaml") {
    if (doc !== undefined) handleRecurringFile(rel, doc);
  } else if (fileName === "evergreen.yml" || fileName === "evergreen.yaml") {
    if (doc !== undefined) handleEvergreenFile(rel, doc);
  } else {
    fail(rel, undefined, "is not a recognized calendar file name", 'Calendar files must be a monthly file like "2026-08.yml", or "recurring.yml", or "evergreen.yml".');
  }
}

// ---------------------------------------------------------------------------
// 5. drafts/<id>/post.yml - none exist in Phase 0, but the check is ready
// ---------------------------------------------------------------------------

const draftsDir = path.join(ROOT, "drafts");
if (fs.existsSync(draftsDir)) {
  const draftFolders = fs
    .readdirSync(draftsDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();

  for (const folder of draftFolders) {
    const rel = `drafts/${folder}/post.yml`;
    if (!fs.existsSync(path.join(ROOT, rel))) {
      fail(`drafts/${folder}/`, undefined, "this draft folder has no post.yml file", "Every draft folder must contain a post.yml. Delete the folder if the draft is no longer needed.");
      continue;
    }
    const doc = readYaml(rel);
    if (doc === undefined) continue;
    filesChecked++;
    draftsChecked++;

    checkShape("draft", doc, rel);
    if (!isRecord(doc)) continue;

    const id = typeof doc.id === "string" ? doc.id : undefined;
    if (id !== undefined && id !== folder) {
      fail(rel, id, `the id "${id}" does not match the folder name "${folder}"`, "Rename the folder (or the id) so the two are identical. The folder name is how the system finds the draft.");
    }
    checkCta(doc.cta, rel, id ?? folder);

    // Per-platform character limits, and Instagram's image requirement.
    if (isRecord(doc.platforms)) {
      for (const [platformName, limit] of Object.entries(PLATFORM_TEXT_LIMITS)) {
        const post = doc.platforms[platformName];
        if (isRecord(post) && typeof post.text === "string" && post.text.length > limit) {
          fail(
            rel,
            id ?? folder,
            `the ${platformName} text is ${post.text.length} characters, over the ${limit}-character limit`,
            `Shorten the ${platformName} text to at most ${limit} characters.`
          );
        }
      }
      if (isRecord(doc.platforms.instagram) && !isRecord(doc.image)) {
        fail(
          rel,
          id ?? folder,
          "includes an instagram post but has no image section - Instagram cannot publish without an image",
          'Add an "image:" section (file + alt), or remove the instagram entry from this draft.'
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Report
// ---------------------------------------------------------------------------

for (const w of warnings) {
  console.log(yellow(`Warning: ${w}`));
}

if (problems.length > 0) {
  const count = problems.length === 1 ? "1 problem" : `${problems.length} problems`;
  console.error(red(`\nValidation failed. ${count} found:\n`));
  for (const p of problems) {
    const entryPart = p.entry !== undefined ? ` - ${p.entry}` : "";
    console.error(red(`  [${p.file}${entryPart}]`));
    console.error(`    Problem: ${p.what}`);
    console.error(`    How to fix: ${p.fix}\n`);
  }
  console.error(red('Fix the problems above, then run "npm run validate" again.'));
  process.exit(1);
}

const summary = [
  `${filesChecked} ${filesChecked === 1 ? "file" : "files"}`,
  `${calendarEntries} calendar ${calendarEntries === 1 ? "entry" : "entries"}`,
  `${holidayCount} ${holidayCount === 1 ? "holiday" : "holidays"}`,
  `${ctaKeys ? ctaKeys.size : 0} CTAs`,
  `${draftsChecked} ${draftsChecked === 1 ? "draft" : "drafts"}`,
].join(", ");

console.log(green(`Everything checks out: ${summary}. Nothing to fix.`));
