# servio-social — Architecture

## V2 — FULLY AUTOMATIC PIPELINE (the current system — read this first)

On **2026-07-22 the owner superseded the review-mode design** documented in the
rest of this file: there is no Pull Request approval step anymore. The system
now runs end-to-end with zero human intervention:

**GitHub Actions (daily, 09:00 IST — cron `30 3 * * *` UTC) → Gemini** picks a
topic and writes the content (LinkedIn + Instagram + a stored X version + a
blog draft) **→ validate/dedup** (quality rules + Dice-similarity scan against
history; failed drafts are regenerated with the validator's feedback) **→
Buffer** (`createPost` mutation; branded pool image hosted via Cloudinary
unsigned upload) **→ LinkedIn Company Page + Instagram Business**. History
lives in `data/posts.json` (one record per IST day — runs are idempotent), and
Instagram is skipped (not failed) when no publicly hosted image exists.

The authoritative technical brief for V2 — the exact file list, the verified
external API contracts (Buffer GraphQL, Gemini REST, Cloudinary), and the
cross-cutting rules — is **[docs/BUILD.md](BUILD.md)**. The frozen shared
contracts are `src/types.ts` and `src/config/env.ts`. The owner-facing docs are
the repository `README.md` and `docs/SETUP.md`.

Everything below this line is the V1 (review-mode) design. It is kept because
its platform research still backs the documented **fallback path** (direct
platform APIs, used only if Buffer ever becomes unavailable). Sections marked
*"(superseded by V2 — kept for the fallback path)"* no longer describe the
running system.

---

AI-powered social media content automation for **Servio** (web development agency).
Runs entirely on GitHub: **Git is the database, GitHub Actions is the runtime, a Pull Request is the approval screen.**

> This repo is completely separate from the Servio website codebase. It never imports from it,
> never writes to it, and shares only the brand identity.

---

## LOCKED DECISIONS (owner-approved 2026-07-22, revised same day — do not change without explicit approval)

*(superseded by V2 — kept for the fallback path: decisions 1 and 5 no longer apply — the system is fully automatic and publishes at 09:00 IST directly; decisions 2, 3, and 4 carried over into V2.)*

1. **Mode: `review`.** Content is generated into a Pull Request; a human merge is the ONLY path to
   publishing. `mode: auto` exists in the schema but must never be enabled without the owner's
   explicit instruction. Phase 0 additionally has every platform `enabled: false` and makes
   **zero external API calls**.
2. **Publisher: Buffer.** All publishing goes through the Buffer GraphQL API (one Bearer token,
   `createPost` mutation, all channels) instead of four direct platform integrations. The
   direct-API designs below are retained as the documented **fallback path** (`publisher: direct`)
   in case Buffer's beta API ever becomes unreliable.
3. **MVP platforms: LinkedIn Company Page + Instagram Business**, both connected as channels
   inside Buffer. (Via Buffer, company-page posting needs NO LinkedIn API approval — the wall
   that forced the earlier "personal profile" decision is gone.) X and Facebook come later by
   connecting their channels in Buffer; no developer accounts needed.
4. **Model: `gemini-flash-latest`** (owner already operates a Gemini key for the Servio website),
   read from `config/settings.yml` (`model:` key). The pipeline must treat the model id as opaque
   config so switching models/providers later stays a one-line + one-client change.
5. **Timing: target publish 9:00 AM IST.** Content is generated the **evening before** (owner
   reviews at leisure); on merge it is sent to Buffer **scheduled for the next 9:00 AM IST** —
   Buffer's scheduler provides exact timing that GitHub's best-effort cron cannot.

---

## System overview

*(superseded by V2 — kept for the fallback path: the running flow is the single `social-post.yml` workflow described in BUILD.md, not the generate/publish PR pair below.)*

```
generate.yml (cron, daily EVENING)            publish.yml (on merge to main)
  └─ src/generate.ts                            └─ src/publish.ts
       1 pick calendar entry (src/calendar.ts)       1 find pending drafts/
       2 Gemini call #1: research (optional)         2 dedup vs published/*.jsonl
       3 Gemini call #2: structured generation       3 Buffer adapter (src/publishers/buffer.ts):
       4 render branded image (src/image/)             one createPost per platform, scheduled
       5 validate (src/validate.ts)                    for the next 9:00 AM IST
       6 write drafts/<id>/ + open PR                4 append JSONL log + archive draft
                                                     5 open Issue for any channel failure
validate.yml (every PR): schemas + lint      health.yml (weekly): calendar-runway warning,
                                             Buffer token sanity check
```

Generation uses two AI calls: call 1 = topic research returning prose notes (skipped when the
calendar entry sets `research: false`); call 2 = generation constrained to a JSON schema
(Gemini `responseSchema`), so the pipeline never parses free-form text.

## Phase roadmap

*(superseded by V2 — kept for the fallback path: the owner skipped straight to full automation on 2026-07-22; there are no phases anymore.)*

- **Phase 0 (this phase):** scaffold, brand system, calendar, prompts, schemas, validator,
  validate.yml CI, docs. The system "thinks" but cannot post. NO generation code, NO publishers,
  NO API calls.
- **Phase 1:** generation pipeline (Gemini two-call), image rendering (SVG template → JPEG via
  sharp), PR preview flow. Value: daily ready-to-paste content packs with zero platform APIs.
- **Phase 2:** the Buffer publisher adapter — LinkedIn Company Page + Instagram first; X and
  Facebook whenever their channels are connected in Buffer.
- **Phase 3:** auto mode + multiple daily slots.
- **Phase 4:** analytics loop (collect → analyze → strategist PR).
- **(Fallback, only if ever needed):** direct platform adapters per the reference section below.

## Repository layout

*(superseded by V2 — kept for the fallback path: the actual layout is in README.md — `src/ai`, `src/buffer`, `src/services`, `data/posts.json`; the calendar/brand/drafts folders below were never built.)*

```
.github/workflows/  validate.yml (Phase 0) · generate.yml, publish.yml, health.yml (Phase 1+)
brand/              brand.yml (identity+voice+avoid) · ctas.yml (CTA library) · examples.md (gold posts)
calendar/           YYYY-MM.yml (dated entries) · recurring.yml (weekly rhythm + holidays) · evergreen.yml
prompts/            system.md · research.md · platforms/{linkedin,x,instagram,facebook}.md
assets/             logo/ · fonts/ · templates/ (SVG image templates, Phase 1)
schemas/            JSON Schemas: settings, brand, ctas, calendar, draft
src/                validate.ts (Phase 0) · generate.ts, publish.ts, calendar.ts, ai.ts (Gemini
                    client), log.ts, image/, publishers/ (buffer.ts primary; direct adapters
                    only if the fallback path is ever activated) (Phase 1+)
config/settings.yml runtime config (mode, model, slots, platforms)
drafts/             generated posts awaiting approval (one folder per post id)
published/          YYYY-MM.jsonl append-only log · archive/ of published drafts
docs/               ARCHITECTURE.md (this file) · SETUP.md (owner runbooks)
```

## Data shapes (canonical — schemas must match these exactly)

*(superseded by V2 — kept for the fallback path: the live data shapes are the TypeScript interfaces in `src/types.ts`, and history lives in `data/posts.json`, not YAML/JSONL files.)*

### config/settings.yml
```yaml
mode: review              # review | auto — LOCKED to review (see decisions)
model: gemini-flash-latest   # opaque model id, switchable
publisher: buffer         # buffer | direct (direct = the documented fallback path)
timezone: Asia/Kolkata
slots:
  morning: "09:00"        # target publish time; generation happens the evening before
platforms:                # ALL false in Phase 0
  linkedin:  { enabled: false, author: company }
  instagram: { enabled: false }
  x:         { enabled: false }
  facebook:  { enabled: false }
limits:
  max_posts_per_day: 4
  research_max_searches: 5
```

### Calendar entry (calendar/YYYY-MM.yml is a list of these)
```yaml
- id: 2026-07-23-page-speed     # ^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$ — globally unique, THE dedup key
  date: 2026-07-23              # ISO date
  slot: morning                 # must exist in settings.slots
  category: education           # education|portfolio|service|case-study|pain-point|holiday|campaign
  topic: "How page speed affects small-business revenue"
  angle: "practical, numbers-first, end with site-audit CTA"   # optional
  platforms: [linkedin, x, facebook, instagram]                 # subset of the 4
  cta: get-quote                # key that MUST exist in brand/ctas.yml
  research: true                # whether Claude web-searches first
  image: template:tip-card      # template:<name> | asset:<path> | none
  source: blog:page-speed-revenue   # optional pointer to existing Servio content
  status: planned               # planned|generated|published|skipped (machine-updated)
```

`recurring.yml`: `weekly:` (mon..sun → default category+platforms) and `holidays:` (list of
{date, name, topic, platforms, cta}). `evergreen.yml`: list of calendar-entry-like items without
dates, consumed in order when a date has no entry (each gets `used: true` when consumed).

Selection precedence (src/calendar.ts, Phase 1): dated entry → holiday → weekly rhythm template →
next unused evergreen → skip with warning.

### Draft (drafts/<id>/post.yml — produced in Phase 1, schema defined now)
```yaml
id: 2026-07-23-page-speed
generated_at: <ISO datetime>
model: gemini-flash-latest
topic: ...
category: education
cta: get-quote
image: { file: image.jpg, alt: "...", headline: "..." }
platforms:
  linkedin:  { text: "...", status: pending }    # status: pending|approved|published|failed|skipped
  x:         { text: "...", status: pending }
  instagram: { text: "...", status: pending }    # caption; image is mandatory for IG
  facebook:  { text: "...", status: pending }
hashtags: { linkedin: [...], x: [...], instagram: [...], facebook: [...] }
research_notes: "..."          # optional, from call #1
```

### Published log line (published/YYYY-MM.jsonl)
```json
{"ts":"...","id":"...","platform":"x","status":"published","url":"...","error":null,"content_hash":"sha256:...","topic":"...","category":"..."}
```

## Brand facts (source of truth for brand/ files — taken from the live Servio site/codebase)

*(superseded by V2 — kept for the fallback path: the brand/ YAML files were never built; V2 embeds the brand block defined in BUILD.md, and the V2 social images are blue/white, not the website palette below.)*

- Name: **Servio** · Website: https://servio-0.web.app · Tagline: "Your Business Deserves a
  Website That Converts" / "High-Performance Web Solutions"
- Services (6): Landing Pages · Business Websites · Portfolio Websites · E-Commerce Stores ·
  Custom Web Applications · Website Maintenance  (detail pages at /services/<slug>)
- Pricing plans shown on site: Starter ₹7,999 · Business ₹65,000 · Premium ₹1,60,000
  (only ever quote prices that appear in brand.yml; when unsure, don't mention price)
- Audience: small & medium business owners (India-first, global-friendly), non-technical startup
  founders; pain points: no website / outdated site / site that doesn't convert / slow site
- Voice: confident, practical, warm; expert but plain-English; short sentences; concrete numbers
  over adjectives; one idea per post; exactly ONE CTA per post
- Visual identity: warm Indian-heritage — copper #B87333, zari gold #C99A3B, peacock teal #0F6F6C,
  sandstone #F5F0E8, ink #1C1815; fonts Fraunces (display) + Inter (body)
- Blog topics that exist (repurposable): why-your-small-business-needs-a-website,
  landing-page-mistakes, page-speed-revenue, seo-basics-small-business,
  ecommerce-vs-booking-site, content-that-converts
- AVOID (hard rules): invented statistics or fake client results/testimonials; hype vocabulary
  ("game-changer", "unleash", "revolutionize", "🚀 to the moon"); emoji walls; engagement-bait
  ("tag a friend", "like if you agree" — Meta demotes this); identical text across platforms
  (X rejects duplicates; Meta demotes unoriginal content); promising prices/timelines not in
  brand.yml; disparaging competitors; em-dash-heavy AI cadence
- UTM convention for every link: `?utm_source=<platform>&utm_medium=social&utm_campaign=<calendar-id>`

## Platform facts that shape the design (web-verified 2026-07-22)

- **Buffer (THE publisher):** new GraphQL API (the 2019-era public API is dead — ignore old
  tutorials). One `createPost` mutation covers all 11 channels incl. our four, with per-channel
  metadata (IG post/story/reel type, LinkedIn first comment, X threads). Auth = one Bearer
  personal API token, no OAuth, no rotation; available on every Buffer plan incl. Free (Free caps
  the number of connected channels). Caveat: **beta** — already shipped one breaking change
  (May 2026 assets-input migration), no SLA; hence the documented `direct` fallback below and
  review-mode + failure-Issue protection.
- **Gemini (the writer):** `gemini-flash-latest` via the official SDK; JSON guaranteed with
  `responseMimeType: application/json` + `responseSchema`; generous free tier comfortably covers
  one pack/day (verify current quotas at build time). Same provider the Servio website already
  uses, but with a separate API key for independent usage/rotation.

### Fallback-path reference (direct platform APIs — only if `publisher: direct` is ever activated)

- **X:** OAuth 1.0a (4 static secrets, never expire). v2 media upload only. Alt text = separate
  metadata call. Pay-per-use: $0.015/post, $0.20 with URL. Duplicate posts rejected → per-platform
  variants are mandatory.
- **LinkedIn (personal):** `w_member_social` + OpenID (`/v2/userinfo` for the person URN).
  60-day token, NO programmatic refresh for standard apps → health.yml warns at day 45; manual
  re-auth runbook in SETUP.md. Escape `()[]{}<>@#*_~|` in text ("little text format").
- **Instagram:** "Instagram API with Instagram Login" route. JPEG only, publicly hosted image URL
  required (→ Cloudinary), aspect 4:5–1.91:1, text-only impossible. 60-day token but
  programmatically refreshable → health.yml automates it. 100 posts/24h cap.
- **Facebook Page:** direct byte upload, no public URL needed. System-user token never expires.
  App must be switched LIVE or posts are invisible (dev-mode trap).
- **Claude:** two-call pattern (research+citations ≠ structured output). `web_search_20260318`
  ($10/1k searches). Structured outputs via `output_config.format` json_schema — no beta header.
  Do NOT send temperature/top_p to Sonnet 5/Opus 4.8 (hard 400). Check `stop_reason` before
  trusting parsed output.
- **GitHub Actions:** cron is best-effort → schedule at off-peak minutes (:17/:47); private repo
  (also keeps strategy private); concurrency groups + the published-log dedup make delayed or
  duplicate runs harmless.

## Engineering conventions

*(superseded by V2 — kept for the fallback path: V2's conventions live in BUILD.md; the dependency list below is outdated — V2 uses `axios`, `dotenv`, `zod`.)*

- TypeScript strict, Node ≥ 20, ESM (`"type": "module"`), run with `tsx` (no build step).
- Minimal deps (Phase 0): `yaml`, `ajv`, `ajv-formats`; dev: `typescript`, `tsx`, `@types/node`.
- Validation philosophy: **plain-English errors** — the owner is non-technical. Every validator
  message must say file, entry id, what's wrong, and how to fix it.
- No secrets in the repo, ever. `.env.example` documents names only. Secrets live in GitHub
  Actions secrets (names listed in SETUP.md).
- Every future mutation of platform state must be preceded by a dedup check against
  `published/*.jsonl` and followed by a log append.
