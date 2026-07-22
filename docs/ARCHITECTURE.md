# servio-social — Architecture

AI-powered social media content automation for **Servio** (web development agency).
Runs entirely on GitHub: **Git is the database, GitHub Actions is the runtime, a Pull Request is the approval screen.**

> This repo is completely separate from the Servio website codebase. It never imports from it,
> never writes to it, and shares only the brand identity.

---

## LOCKED DECISIONS (owner-approved 2026-07-22 — do not change without explicit approval)

1. **Mode: `review`.** Content is generated into a Pull Request; a human merge is the ONLY path to
   publishing. `mode: auto` exists in the schema but must never be enabled without the owner's
   explicit instruction. Phase 0 additionally has every platform `enabled: false` and makes
   **zero external API calls**.
2. **LinkedIn: personal profile** (`Share on LinkedIn`, `w_member_social`, legacy `/v2/ugcPosts`
   stack) for the MVP. Company-page posting (Community Management API) is a later phase.
3. **X: cleanest official approach.** Links are allowed in post text at the standard pay-per-use
   rate ($0.20/post with link vs $0.015 without, verified July 2026). No link-in-reply or other
   placement workarounds — reliability over cost.
4. **Model: `claude-sonnet-5`**, read from `config/settings.yml` (`model:` key). The pipeline must
   treat the model id as opaque config so switching to `claude-opus-4-8` later is a one-line change.
5. **Instagram = Business/Creator account; Facebook = Page.** Owner will complete platform
   prerequisites following `docs/SETUP.md`.

---

## System overview

```
generate.yml (cron, daily)                    publish.yml (on merge to main)
  └─ src/generate.ts                            └─ src/publish.ts
       1 pick calendar entry (src/calendar.ts)       1 find pending drafts/
       2 Claude call #1: research (web_search)       2 dedup vs published/*.jsonl
       3 Claude call #2: structured generation       3 per-platform adapters (src/publishers/*)
       4 render branded image (src/image/)           4 append JSONL log + archive draft
       5 validate (src/validate.ts)                  5 open Issue for any platform failure
       6 write drafts/<id>/ + open PR
validate.yml (every PR): schemas + lint      health.yml (weekly): token expiry warnings,
                                             IG token auto-refresh, calendar-runway warning
```

Two Claude calls are REQUIRED (verified): web-search results (citations) and guaranteed-JSON
structured output are incompatible in one request. Call 1 = research prose; call 2 = strict JSON.

## Phase roadmap

- **Phase 0 (this phase):** scaffold, brand system, calendar, prompts, schemas, validator,
  validate.yml CI, docs. The system "thinks" but cannot post. NO generation code, NO publishers,
  NO API calls.
- **Phase 1:** generation pipeline (Claude two-call), image rendering (SVG template → JPEG via
  sharp), PR preview flow. Value: daily ready-to-paste content packs with zero platform APIs.
- **Phase 2:** publishers, rolled out per platform: Facebook → Instagram → X → LinkedIn (personal).
- **Phase 3:** LinkedIn company page (approval-gated).
- **Phase 4:** auto mode + multiple daily slots.
- **Phase 5:** analytics loop (collect → analyze → strategist PR).

## Repository layout

```
.github/workflows/  validate.yml (Phase 0) · generate.yml, publish.yml, health.yml (Phase 1+)
brand/              brand.yml (identity+voice+avoid) · ctas.yml (CTA library) · examples.md (gold posts)
calendar/           YYYY-MM.yml (dated entries) · recurring.yml (weekly rhythm + holidays) · evergreen.yml
prompts/            system.md · research.md · platforms/{linkedin,x,instagram,facebook}.md
assets/             logo/ · fonts/ · templates/ (SVG image templates, Phase 1)
schemas/            JSON Schemas: settings, brand, ctas, calendar, draft
src/                validate.ts (Phase 0) · generate.ts, publish.ts, calendar.ts, claude.ts,
                    log.ts, image/, publishers/ (Phase 1+)
config/settings.yml runtime config (mode, model, slots, platforms)
drafts/             generated posts awaiting approval (one folder per post id)
published/          YYYY-MM.jsonl append-only log · archive/ of published drafts
docs/               ARCHITECTURE.md (this file) · SETUP.md (owner runbooks)
```

## Data shapes (canonical — schemas must match these exactly)

### config/settings.yml
```yaml
mode: review              # review | auto — LOCKED to review (see decisions)
model: claude-sonnet-5    # opaque model id, switchable
timezone: Asia/Kolkata
slots:
  morning: "10:00"        # local time, HH:MM
platforms:                # ALL false in Phase 0
  linkedin:  { enabled: false, author: personal }
  x:         { enabled: false }
  instagram: { enabled: false }
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
model: claude-sonnet-5
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

- TypeScript strict, Node ≥ 20, ESM (`"type": "module"`), run with `tsx` (no build step).
- Minimal deps (Phase 0): `yaml`, `ajv`, `ajv-formats`; dev: `typescript`, `tsx`, `@types/node`.
- Validation philosophy: **plain-English errors** — the owner is non-technical. Every validator
  message must say file, entry id, what's wrong, and how to fix it.
- No secrets in the repo, ever. `.env.example` documents names only. Secrets live in GitHub
  Actions secrets (names listed in SETUP.md).
- Every future mutation of platform state must be preceded by a dedup check against
  `published/*.jsonl` and followed by a log append.
