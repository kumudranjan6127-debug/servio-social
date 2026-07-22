# servio-social

An AI assistant that plans, writes, and (eventually) publishes social media posts for
**Servio** — the web development agency — on LinkedIn, X, Instagram, and Facebook.

There is no app to install and no dashboard to log into. Everything lives in this
GitHub repository:

- **Files are the database.** The content calendar, the brand voice, and every draft
  post are plain files you can open and read.
- **GitHub Actions is the engine.** Scheduled jobs do the thinking and writing.
- **A Pull Request is the approval screen.** Nothing is ever published without a
  human clicking "Merge".

> This repo is completely separate from the Servio website code. It never touches it.

---

## How it works — the whole system in one picture

```
  YOU plan the month              THE AI writes drafts             YOU approve
 ┌─────────────────────┐  daily  ┌──────────────────────┐  opens  ┌──────────────────────┐
 │  calendar/*.yml     │ ──────▶ │ Researches the topic, │ ──────▶ │  Pull Request         │
 │  (topics and dates) │         │ writes 4 platform     │         │  (a review page on    │
 └─────────────────────┘         │ versions + an image   │         │  GitHub — read, edit, │
                                 └──────────────────────┘         │  approve or reject)   │
                                                                  └──────────┬───────────┘
                                                                             │
                                                            you click "Merge" = approval
                                                                             │
                                                                             ▼
                                                                  ┌──────────────────────┐
                                                                  │  Publish to LinkedIn, │
                                                                  │  X, Instagram, FB     │
                                                                  │  (Phase 2 — OFF now)  │
                                                                  └──────────────────────┘
```

If you never merge a Pull Request, nothing is ever posted. That is by design.

---

## Current status: Phase 0 — thinking only, publishing disabled

Right now the repo contains the brand voice, the content calendar, the writing
instructions for the AI, and a validator that checks everything for mistakes.

- The system **cannot post anything**. All four platforms are switched off in
  `config/settings.yml` (`enabled: false`).
- Phase 0 makes **zero calls to any external service** — no AI calls, no social
  media calls, nothing leaves GitHub.

## Phase roadmap

| Phase | What it adds | Can it post? | Status |
|-------|--------------|:---:|--------|
| **0** | Brand files, calendar, AI instructions, validator, docs | No | **← we are here** |
| 1 | AI writes daily draft posts + branded images into Pull Requests | No | Next |
| 2 | Publishing, one platform at a time: Facebook → Instagram → X → LinkedIn | Yes, after you merge | Later |
| 3 | Posting to the Servio LinkedIn **company page** (needs separate approval) | Yes | Later |
| 4 | Auto mode + more than one post per day | Yes | Later |
| 5 | Analytics: learns what performed well and suggests calendar changes | — | Later |

---

## Everyday tasks

### Edit the content calendar

The calendar decides what gets written and when.

1. Open the `calendar/` folder.
2. Open the file for the month, e.g. `calendar/2026-08.yml`.
3. Each entry is one planned post: a date, a topic, which platforms it goes to,
   and which call-to-action to end with. Copy an existing entry and change it.
4. The `id` of each entry must be unique and follow the pattern
   `YYYY-MM-DD-short-name` (lowercase letters, numbers, and dashes only).
5. Save the file and open a Pull Request (or commit to a branch). The automatic
   checker will tell you in plain English if anything is wrong.

There is also `calendar/recurring.yml` (the weekly rhythm and holiday posts) and
`calendar/evergreen.yml` (a backlog of timeless topics used when a day has no
specific plan).

### Edit the brand voice

1. Open the `brand/` folder.
2. `brand.yml` — who Servio is, services, prices, tone rules, and the "never do
   this" list. The AI treats this file as law.
3. `ctas.yml` — the library of calls-to-action (the closing line of each post).
   Calendar entries point at these by name.
4. `examples.md` — real posts written the way we like. The AI imitates these.

### Approve a post (Phase 1 onward)

1. GitHub will open a Pull Request titled with the post's date and topic.
2. Open it and read the drafts — one version per platform, plus the image.
3. Want changes? Leave a comment or edit the text files directly in the PR.
4. Happy with it? Click **Merge pull request**. That merge *is* the approval.
   (In Phase 2, merging is what triggers actual publishing.)
5. Not happy at all? Close the Pull Request without merging. Nothing happens.

### Switch modes

The file `config/settings.yml` has a line `mode: review`.

- `review` — every post waits for you to merge a Pull Request. **This is the
  locked, approved setting.**
- `auto` — posts would publish without a human check.

> **Warning:** `auto` mode must never be turned on without the owner's explicit,
> written go-ahead. It is planned for Phase 4 at the earliest, only after the
> review flow has proven itself. If you ever see `mode: auto` in this file and
> didn't approve it, change it back to `review`.

### Run the validation check on your own computer (optional)

Every Pull Request is checked automatically on GitHub, so you never *have* to run
anything locally. But if you want instant feedback while editing:

1. Install Node.js (version 20 or newer) from https://nodejs.org — the "LTS"
   download, ordinary next-next-finish install.
2. Open a terminal in this folder (on Windows: right-click the folder →
   "Open in Terminal").
3. First time only, type: `npm install` and press Enter (this downloads the
   checker's tools — takes a minute).
4. Then type: `npm run validate` and press Enter.
5. You'll either see a success message, or a plain-English list of what's wrong,
   in which file, and how to fix it.

---

## More documentation

- **[docs/SETUP.md](docs/SETUP.md)** — step-by-step runbooks for the two keys the
  system runs on (Gemini for writing, Buffer for publishing), plus a fallback
  appendix for the direct platform APIs. Nothing in it blocks Phase 0 — only the
  Gemini key is needed for Phase 1, and Buffer only when publishing starts.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the technical brief: locked
  decisions, data formats, and platform facts. Written for developers, but the
  "LOCKED DECISIONS" section at the top is worth every owner's read.
