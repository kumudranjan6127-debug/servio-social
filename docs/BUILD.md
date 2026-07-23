# BUILD BRIEF — servio-social production system (v2, owner-specced)

Authoritative brief for implementing the fully-automatic pipeline. The contract files
`src/types.ts` and `src/config/env.ts` are ALREADY WRITTEN — import from them, never redefine
their shapes, never read `process.env` outside env.ts (single documented exception: the
channel-listing CLI, see §Buffer). ESM (`"type": "module"`), strict TypeScript, run via `tsx`
(no build step). Relative imports may omit extensions (moduleResolution: bundler). Every file
fully implemented — no placeholders, no TODOs.

Owner decisions now in force: FULLY AUTOMATIC (no PR review step — this supersedes the old
review-mode design), Gemini writer, Buffer publisher, LinkedIn Company Page + Instagram Business,
daily 09:00 IST, zero manual intervention after setup.

## Verified external contracts (do not deviate)

### Buffer GraphQL (verified from official docs 2026-07-22)
- Endpoint: `POST https://api.buffer.com` (GraphQL over POST, JSON body `{query, variables}`)
- Auth header: `Authorization: Bearer <BUFFER_API_KEY>`
- Org id: `query { account { organizations { id } } }`
- Channels: `query { channels(input: { organizationId: $orgId }) { id name service } }`
- Create post:
```graphql
mutation Create($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess { post { id dueAt } }
    ... on MutationError { message }
  }
}
```
  input fields: `text: String!`, `channelId: String!`, `schedulingType: automatic`,
  `mode: addToQueue` (publish via queue now) OR `mode: customScheduled` + `dueAt: ISO-UTC string`,
  optional `assets: [AssetInput!]` where AssetInput = exactly-one-variant object:
  `{ image: { url: String!, metadata: { altText } } }` (images are PUBLIC URLS ONLY — Buffer has
  NO upload mutation), optional `metadata` per channel:
  `{ instagram: { type: post, shouldShareToFeed: true, isAiGenerated: Boolean } }`,
  `{ linkedin: { firstComment: String } }` (firstComment: only if we ever want it — omit for now).
  Handle BOTH failure surfaces: top-level GraphQL `errors[]` AND the `MutationError` union arm.
- Enum values like `automatic` / `addToQueue` / `post` are GraphQL ENUMS — send them unquoted in
  the query document or use typed variables; easiest reliable approach: inline enums in the query
  string, pass strings via variables only for String-typed fields.

### Gemini REST (official v1beta)
- `POST https://generativelanguage.googleapis.com/v1beta/models/{env.GEMINI_MODEL}:generateContent`
- Header `x-goog-api-key: <GEMINI_API_KEY>`, JSON body:
  `{ contents: [{ role: "user", parts: [{ text }] }], generationConfig: { temperature, responseMimeType } }`
- Writer call uses `responseMimeType: "application/json"`; research call uses plain text (no mime).
- Response text at `candidates[0].content.parts[0].text`. JSON.parse then Zod-validate; on parse
  or schema failure → retry (counts toward the 3 attempts).
- Never send unsupported params. Temperature 0.85 for writing, 0.4 for research.

### Cloudinary unsigned upload (image hosting for Buffer/Instagram)
- Only when `imageHostingConfigured` (env.ts): `POST https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload`
  multipart form: `file` (the binary), `upload_preset` (CLOUDINARY_UPLOAD_PRESET). Response JSON
  has `secure_url`. No secret beyond the unsigned preset. Failure → return null (caller degrades).

## Brand block (embed into AI prompts verbatim-ish)
Servio — web development agency, https://servio-0.web.app . Services: landing pages, business
websites, portfolio sites, e-commerce, custom web apps, maintenance. Audience: small/medium
business owners & non-technical founders (India-first, global-friendly). Voice: founder mindset,
professional, educational, helpful, modern, natural; short sentences; concrete and specific;
never salesy, never fake statistics or invented client results. CTA rotation: visit the site /
see the portfolio / read the blog / DM or comment to talk. Site links carry
`?utm_source=<platform>&utm_medium=social&utm_campaign=<YYYY-MM-DD>-<topic-slug>`.
Banned (regenerate if present): "delve", "game-changer", "unlock", "elevate", "leverage" (as verb),
"in today's fast-paced world", "revolutionize", "unleash", "🚀" spam, emoji walls, engagement-bait
("tag a friend", "like if you agree"), em-dash overuse (>4 per post).

## Topic pool (chooseTopic rotates through; least-recently-used first)
AI, Automation, Startups, SaaS, Web Development, React, Next.js, Node.js, Firebase, UI/UX, SEO,
Cloud, Open Source, GitHub, Developer Productivity, Business Growth, Digital Transformation,
Software Engineering.

## Files to implement (exact list)

### src/ai/ (agent A)
- `geminiCall` helper may live inside generatePost.ts or a tiny shared local fn — but ONLY ai/*
  files call Gemini.
- `chooseTopic.ts` → `export async function chooseTopic(history: HistoryFile): Promise<ChosenTopic>`
  Deterministic LRU pick from the pool (exclude topics used in the last 10 records), then ONE
  cheap Gemini call to produce a fresh specific `angle` (avoid angles similar to that topic's
  past angles, which are provided in the prompt). Falls back to a template angle on AI failure.
- `generatePost.ts` → `export async function generateContent(choice: ChosenTopic, history: HistoryFile): Promise<GeneratedContent>`
  Call 1 (research, fail-soft → ""): 4-6 concrete, current, verifiable points about the angle;
  no fabricated numbers (instruct: if unsure, write evergreen truths, no stats).
  Call 2 (writer, JSON): full GeneratedContent JSON (define a local Zod schema mirroring
  types.GeneratedContent exactly). Prompt embeds: brand block, research, per-platform rules —
  LinkedIn 100-180 words / strong hook first line / one insight / one CTA / max 3 emojis;
  Instagram 80-150 words / storytelling / line breaks / one CTA / slightly more energetic;
  twitter ≤ 260 chars incl. 1-2 hashtags; blogDraft: ~400-600 word markdown draft;
  imagePrompt: modern minimal startup-tech style, clean typography, blue+white palette.
  LinkedIn and Instagram must express the SAME topic differently (not near-duplicates).
- `generateHashtags.ts` → `export function normalizeHashtags(content: GeneratedContent): GeneratedContent`
  Post-process (pure, no AI): dedupe case-insensitively, strip leading '#', re-add '#', enforce
  counts by trimming/merging from a curated brand+industry pool (LinkedIn 4-6, Instagram 8-15,
  include #Servio + 1-2 brand/industry tags if short). Exported pure for testing.
- `generateImagePrompt.ts` → `export function refineImagePrompt(content: GeneratedContent): string`
  (pure) Ensures the style constants (modern, minimal, startup branding, blue/white, clean
  typography, no photorealistic faces) are appended; returns final prompt. Modular seam for
  future AI image generation.

### src/buffer/ (agent B)
- `getChannels.ts` → `export async function getChannels(): Promise<BufferChannel[]>` (resolves org
  id first, then channels across all orgs). PLUS a CLI mode (import.meta.url main-check): reads
  ONLY BUFFER_API_KEY via its own tiny zod parse (documented exception — runs before channel IDs
  exist) and prints a table of id/name/service so the owner can copy channel IDs. `npm run channels`.
- `publish.ts` → `export async function publishPost(req: PublishRequest): Promise<PublishResult>`
  Builds createPost input (queue-now vs customScheduled per req.dueAtIso), attaches assets +
  instagram metadata (type post, shouldShareToFeed true, isAiGenerated from image), wraps the
  HTTP call with retry(3, exponential). Never throws — always returns PublishResult.
  Also `export function nextNineAmIstIso(daysAhead?: number): string` (09:00 IST = 03:30 UTC).
- `uploadMedia.ts` → `export async function hostImage(img: LocalImage): Promise<HostedImage | null>`
  Cloudinary unsigned upload; null when not configured or on final failure (after retry).
  PLUS `export const poolImageProvider: ImageProvider` — default provider choosing
  deterministically from assets/pool/*.png by day-of-year (aiGenerated: false, altText from topic).

### src/services/ (agent C)
- `logger.ts` → leveled logger (env.LOG_LEVEL): timestamped console lines; appends plain-text to
  `logs/run-YYYY-MM-DD.log` (mkdir -p); `logger.summary(md: string)` appends to
  `process.env.GITHUB_STEP_SUMMARY` file when present. Export singleton `logger`.
- `retry.ts` → `export async function retry<T>(label: string, fn: () => Promise<T>, opts?: { attempts?: number; baseMs?: number }): Promise<T>`
  Exponential backoff (default 3 attempts, 1s/2s/4s + jitter), logs each retry; also
  `export const sleep = (ms:number) => ...`.
- `validator.ts` → `export function validateContent(c: GeneratedContent, history: HistoryFile, threshold: number): ValidationResult`
  Checks: word counts (LI 100-180, IG 80-150; ±15% soft tolerance), emoji counts (LI ≤3, IG ≤8;
  count via /\p{Extended_Pictographic}/gu), hashtag counts, banned phrases (case-insensitive),
  LI-vs-IG similarity must be < 0.85, and max similarity vs the last 30 history records'
  (linkedin.text + topic/angle) must be ≤ threshold. Similarity util: Dice coefficient on word
  bigrams — implement here, export as `export function similarity(a: string, b: string): number`.
- `history.ts` → `export function loadHistory(): HistoryFile` (missing/corrupt → {posts: []} with
  warn), `export function saveRecord(r: PostRecord): void` (atomic write: tmp+rename),
  `export function hasRecordForDate(h: HistoryFile, isoDate: string): boolean`,
  `export function todayIst(): string` (YYYY-MM-DD in Asia/Kolkata),
  `export function saveBlogDraft(dateIso: string, topicSlug: string, markdown: string): string`
  (writes data/blog-drafts/<date>-<slug>.md, returns path).

### src/index.ts (agent D)
Orchestrator with arg parsing (`--health`, `--week`, plain = daily run):
DAILY: banner log → hasRecordForDate(today)? exit 0 "already posted" → getChannels + verify the
two env channel ids exist & their services look right (warn-only on mismatch) → chooseTopic →
generateContent → normalizeHashtags → refineImagePrompt → validateContent; if !ok → regenerate
(append validator issues to the writer prompt via a `feedback` param — add optional
`feedback?: string[]` LAST param to generateContent) up to env.MAX_REGEN_ATTEMPTS, else fail run →
image: poolImageProvider.getImage → hostImage (skip both in DRY_RUN) → publish LinkedIn, sleep 2s,
publish Instagram — EACH independently (one failing must not stop the other; Instagram without a
hosted image → status "skipped" + reason) → saveRecord + saveBlogDraft (skip saveRecord in
DRY_RUN) → notify webhook if configured ({text} JSON, fail-soft) → logger.summary markdown table
→ exit 1 ONLY if BOTH platforms failed (skipped ≠ failed).
WEEK (`--week`): generate+validate 7 unique packs (also mutually dissimilar), schedule each via
customScheduled dueAt = nextNineAmIstIso(1..7), records status "scheduled".
HEALTH (`--health`): env ok (implicit by import), Gemini ping (1-word generation), Buffer
account+channels reachable, channel ids present, Cloudinary configured yes/no, history readable,
print table, exit 0/1. No posting.
Also agent D: `.github/workflows/social-post.yml` — name "Daily social post"; on:
schedule cron "30 3 * * *" (= 09:00 IST; comment the conversion + GitHub delay caveat),
workflow_dispatch inputs: dry_run (boolean, default false), mode (choice: daily|health|week);
permissions contents write; concurrency group "social-post" cancel-in-progress false; ubuntu,
node 22 + npm cache, npm ci, npm run typecheck, then run tsx per mode with env from secrets
(GEMINI_API_KEY, BUFFER_API_KEY, BUFFER_LINKEDIN_CHANNEL_ID, BUFFER_INSTAGRAM_CHANNEL_ID,
CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, NOTIFY_WEBHOOK_URL) + DRY_RUN from input;
afterwards commit data/ and logs/ back with github-actions[bot] identity, "[skip ci]" message,
push (guard: only if diff). Also agent D: `scripts/generate-brand-images.mjs` — dependency-free
Node (zlib PNG encoder, same technique as classic icon generators): writes 6 abstract branded
1080x1080 PNGs to assets/pool/ (blue #1E4FFF-family + white palette, gradients + simple geometric
shapes, NO text), deterministic; and `package.json` (deps: axios dotenv zod; dev: typescript tsx
@types/node eslint @eslint/js typescript-eslint globals prettier; scripts: start typecheck lint
format channels health "generate:week" images), `tsconfig.json` (strict, ES2022, ESNext/bundler,
noEmit, include src scripts? src only + allowJs false), `eslint.config.js` (flat, ts recommended,
prettier-friendly: no formatting rules), `.prettierrc` (2 spaces, semi true, printWidth 100),
updated `.gitignore` (+ logs/, keep .env*), fresh `.env.example` matching env.ts exactly with
plain-English comments.
Seeded by the coordinator (do not create): data/posts.json, data/blog-drafts/.gitkeep.

### README.md + docs updates (agent E)
Rewrite README.md fully: what it is (1 diagram), quick start, ALL GitHub Secrets table (4 required
+ 3 optional incl. NOTIFY_WEBHOOK_URL) with where-each-comes-from, `npm run channels` flow for
channel IDs, local dev (.env), manual run & DRY_RUN, workflow/cron explained (IST conversion,
GitHub delay note), folder structure tree, how publishing works (Buffer, queue vs scheduled),
image pipeline (pool → Cloudinary → Buffer; Instagram skipped when unhosted), duplicate
prevention (history + Dice similarity + regen), error handling matrix, troubleshooting (top 8
realistic failures incl. "Instagram skipped: no Cloudinary", "Buffer MutationError", Gemini 429),
future improvements (X/FB channels, AI images, analytics), phase note that review-mode was
superseded by owner decision. Also update docs/SETUP.md: secret name BUFFER_ACCESS_TOKEN →
BUFFER_API_KEY everywhere, add channel-ID step (npm run channels) + the 2 channel-ID secrets +
optional Cloudinary section (reuse website preset), keep the leaked-token warning. Also update
docs/ARCHITECTURE.md: mark the v2 auto pipeline (short section at top pointing to BUILD.md and
noting review-mode superseded 2026-07-22 by owner spec).

## Cross-cutting rules
- Only ai/* talk to Gemini; only buffer/* talk to Buffer/Cloudinary; services are pure/local.
- Everything typed, no `any` (narrow unknowns via zod or type guards). No hardcoded secrets/ids.
- Every catch logs via logger with the label of what failed. Axios: set 30s timeout.
- Keep functions small; JSDoc every export. Costs nothing to be readable.
