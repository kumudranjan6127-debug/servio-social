# SETUP — owner runbooks

This document walks you through every account and key the system needs — with
numbered click-by-click steps and a "You are done when..." check at the end of
each section.

**Big change from the earlier version of this document:** the system no longer
talks to each social network directly. It now hands finished posts to
**Buffer** (a scheduling service), and Buffer does the actual posting to every
platform. That replaces four separate developer setups with **one**. The AI
writer also changed: it is now **Gemini** (Google's AI) instead of Claude — and
you already have a Gemini key from the Servio website project.

Nothing about the approval flow changed: the system still only **drafts** posts
and waits for your review — nothing is ever published without your OK.

## What's needed now vs later

Only **two** secrets power the whole system now:

| Section | What it sets up | Needed from |
|---|---|---|
| A. Buffer account + channels + token | the publisher — one token posts everywhere | Phase 2 |
| B. Gemini API key | the AI writer | **Phase 1** |
| C. Putting both keys into GitHub Secrets | the locked safe where keys live | Phase 1 (first key) |
| D. Secrets at a glance | reference table | reference |
| E. Token lifetimes | what expires when (spoiler: nothing, on a schedule) | reference |
| Appendix | the old direct-to-platform setup, kept only as a fallback summary | not needed |

Starting platforms (MVP): **LinkedIn Company Page** and **Instagram** (Business
account). Adding X or Facebook later is no longer a developer project — it's
just connecting one more channel inside Buffer (a two-minute click-through),
with no new keys and no code changes.

A note on words used below:
- **Token / key / secret** — all mean the same thing: a long random-looking
  string that acts as a password for a program. Treat every one like a password.
- **API** — the "side door" a program uses to do things on a website (like
  posting) without clicking around the screen.
- **Channel** — Buffer's word for one connected social account (e.g. "the
  Servio LinkedIn Page" is one channel, "the Servio Instagram" is another).

---

## A. Buffer — the publisher — *Phase 2*

Buffer is a well-established social media scheduling service. We connect the
Servio social accounts to it once, and from then on the system sends every
approved post to Buffer with a single key. Buffer handles the fiddly
platform-by-platform posting rules for us.

### A1. Create the Buffer account (or sign in)

1. Go to **buffer.com** and click **Get started** / **Sign up** (or **Log in**
   if a Servio Buffer account already exists).
2. Sign up with the email address you want to own this — use the same email
   that owns the other Servio accounts so everything stays in one place.
3. You can skip any onboarding questions ("what's your goal", team size, etc.)
   — they don't affect anything.

> **Plan note:** Buffer's free plan allows a small number of connected channels
> — historically up to 3, which covers our LinkedIn + Instagram start
> (channel count on the current free plan: **not verified** — check
> buffer.com/pricing when you sign up).

**You are done when:** you can see the Buffer dashboard with a **Channels**
area in the left sidebar.

### A2. Connect the Servio LinkedIn Company Page as a channel

First, the Servio **LinkedIn Company Page** must exist. If it doesn't yet:
log in to linkedin.com → **For Business** (top menu) → **Create a Company
Page** — the name "Servio" and the logo (`assets/logo/servio-icon-512.png` in
this repo) are enough. Your personal LinkedIn account must be an admin of the
Page (you are automatically, if you create it).

Then, in Buffer:

1. In the Buffer dashboard, open **Channels** and click **Connect Channel**
   (on a brand-new account it may just show a list of networks directly).
2. Choose **LinkedIn**.
3. Buffer asks whether you want a **Personal Profile** or a **LinkedIn Page** —
   choose **LinkedIn Page** (the company page option).
4. A LinkedIn window opens: log in with your personal LinkedIn account and
   click **Allow** to grant Buffer access.
5. Buffer shows the Pages your account manages — pick the **Servio** Page
   (not your personal profile) and finish the connection.

**You are done when:** the Channels list shows the Servio LinkedIn Page with
the Servio logo as a connected channel.

### A3. Connect the Servio Instagram as a channel

**Instagram must be a Business (or Creator) account** — personal accounts
can't be posted to by any tool, Buffer included. Converting is free,
reversible, and doesn't change your followers or posts. If the Servio
Instagram is still a personal account, convert it first:

1. Open the Instagram app on your phone and log in to the Servio account.
2. Go to your profile (bottom-right icon), then tap the **☰ menu** (top right).
3. Tap **Settings and activity**.
4. Scroll to **Account type and tools** (under "For professionals").
5. Tap **Switch to professional account** and tap through the intro screens.
6. Pick a category that fits — e.g. **"Web designer"** or **"Internet
   company"** — and when asked **Business or Creator**, choose **Business**.
7. You can skip any "add contact info" or "grow your audience" screens.

Then, in Buffer:

1. Open **Channels** → **Connect Channel** and choose **Instagram**.
2. Under **"Professional"**, select **Connect to Instagram**.
3. Log in with the Servio Instagram username and password.
4. Review the permissions Buffer asks for and click **Allow**.

Good news: for plain posting, Buffer connects **directly to Instagram** — no
Facebook Page or Meta developer anything is required. (A linked Facebook Page
is only needed if we ever want Buffer's advanced Instagram analytics.)

**You are done when:** the Channels list shows both the Servio LinkedIn Page
**and** the Servio Instagram as connected channels.

### A4. Create the Buffer API access token

This is the single key the system uses to send posts to Buffer. Steps
verified against Buffer's developer documentation (developers.buffer.com):

1. Log in to your Buffer account.
2. Go to **Settings → API** — the direct address is
   **publish.buffer.com/settings/api**.
3. Click **Create a new API key**.
4. Copy the key and store it in your password manager.

This value is **BUFFER_ACCESS_TOKEN** — it goes into GitHub Secrets in
section C, and nowhere else, ever.

> **⚠️ If a token has EVER been pasted into a chat, email, or document, treat
> it as leaked — regenerate it in Buffer first (same Settings → API page,
> create a new key) and only ever store it in GitHub Secrets.** A token is a
> password: anyone who has it can post as Servio. There is never a reason to
> put it anywhere except the GitHub Secrets safe — not in a message to a
> helper, not in a note, not in a file in this repo.

**You are done when:** both channels show as connected in Buffer, and the API
key is saved in your password manager (and, after section C, in GitHub
Secrets).

### Adding X or Facebook later

When you're ready: **Channels → Connect Channel** in Buffer, pick the network,
log in, allow. That's the entire process — the existing token covers every
connected channel, so nothing in GitHub needs to change. (For X, Buffer's own
connection handles X's paid-API side; for Facebook you'd connect the Servio
Facebook Page.) Tell whoever maintains the system so they can switch the new
channel on in the configuration.

---

## B. Gemini API key (the AI writer) — needed at *Phase 1*

This is the only key needed before publishing exists — it lets the system call
Gemini (model: `gemini-2.5-flash`) to research and write the drafts.

You already have a Gemini key from the Servio website project. You *could*
reuse it — but we recommend creating a **separate key for this repo**, so that:
- usage of the website and the social system stay separately visible, and
- if one key ever has to be regenerated, the other project keeps working.

1. Go to **aistudio.google.com** (Google AI Studio) and sign in with the
   Google account that owns the website's key.
2. Open the **API keys** page — direct address: **aistudio.google.com/apikey**.
   Any existing keys (like the website's) are listed here.
3. Click **Create API key**. If it asks about a Google Cloud project, letting
   it use the default/auto-created project is fine.
4. Copy the key and store it in your password manager.

This value is **GEMINI_API_KEY** — it goes into GitHub Secrets in section C.
The same leak rule from section A4 applies: pasted anywhere ≠ secret anymore —
regenerate it.

**Cost:** the Gemini API has a **free tier**, and `gemini-2.5-flash` is
included in it (confirmed on Google's pricing page, ai.google.dev). One
post-pack per day is a small handful of requests — comfortably within free
limits. The exact per-day request caps live on Google's separate "rate limits"
page rather than the pricing page (exact current numbers: **not verified** —
check ai.google.dev/gemini-api/docs/pricing if you ever want the details). If
Google ever changes the free tier, the worst case is small: this model costs
fractions of a cent per post-pack on the paid tier.

**You are done when:** you have a new key saved in your password manager and
it appears in the AI Studio API keys list.

---

## C. Putting both keys into GitHub Secrets

GitHub Secrets is the locked safe where the keys live. Workflows can use them;
nobody — including you, after saving — can read them back out. Nothing secret
is ever written into the repo's files.

### How to add one secret (repeat for each of the two)

1. Open this repository on github.com.
2. Click **Settings** (the repo's settings tab, top of the page).
3. In the left sidebar: **Secrets and variables → Actions**.
4. Click **New repository secret**.
5. **Name**: copy it EXACTLY from the table below — capital letters and
   underscores matter.
6. **Secret**: paste the value. Click **Add secret**.
7. To change a value later (e.g. after regenerating a leaked token): same
   place → click the secret's name → **Update**.

**You are done when:** the Actions secrets page lists `GEMINI_API_KEY`
(Phase 1) and `BUFFER_ACCESS_TOKEN` (Phase 2), spelled exactly like that.

---

## D. Secrets at a glance

The complete list — yes, it's really just these two:

| Name (exact) | What it powers | Where it comes from | Needed from |
|---|---|---|---|
| `GEMINI_API_KEY` | The AI writer (Gemini, `gemini-2.5-flash`) | Section B — aistudio.google.com/apikey | **Phase 1** |
| `BUFFER_ACCESS_TOKEN` | The publisher — all channels through Buffer | Section A4 — publish.buffer.com/settings/api | Phase 2 |

---

## E. Token lifetimes at a glance

| Key | Lifetime | Who renews it | What you do |
|---|---|---|---|
| `BUFFER_ACCESS_TOKEN` | **No published expiry** — Buffer's docs state no expiry schedule; their only guidance is "rotate your key if compromised" | — | Nothing, unless it leaks — then regenerate at Settings → API and update the GitHub Secret. |
| `GEMINI_API_KEY` | **No published expiry** — Google's docs state no expiry (works until you delete or regenerate it) | — | Nothing, unless it leaks — then regenerate in AI Studio and update the GitHub Secret. |

Compare that with the old table in the Appendix — no more 60-day LinkedIn
renewals, no auto-refresh machinery, no expiry calendar at all. If a key ever
leaks: regenerate it at the site that issued it, update the GitHub Secret,
and everything recovers in minutes.

---

## Appendix — FALLBACK PATH — not needed while Buffer is the publisher

The earlier version of this document contained full click-by-click runbooks
for connecting to each platform's API **directly**, without Buffer. We keep
only this summary, in case the project ever needs to leave Buffer. The full
step-by-step versions still exist in this file's **git history** if that day
comes — do not follow anything below today.

| Platform (direct) | The 2–3 things to remember |
|---|---|
| **Facebook + Instagram (Meta)** | Needs a Meta developer "app" (Business type) that must be flipped from **Development to Live** — in dev mode posts silently show only to you (the classic trap). Posting used a never-expiring System User token (Facebook) plus a 60-day Instagram token that a weekly job auto-renewed. 4 secrets total. |
| **X (Twitter)** | Pay-per-post via prepaid credits at console.x.com (~$0.015/post, ~$0.20 with a link — prices as of July 2026). Uses old-style OAuth 1.0a: exactly 4 keys, and the access token must be **regenerated after any permission change** or it stays read-only forever. |
| **LinkedIn (direct)** | Developer app posting to a **personal profile** only (company pages needed extra LinkedIn approval). Token lived ~60 days and could **not** be auto-renewed — a manual 2-minute refresh every 2 months. |
| **Cloudinary** | Image host, needed only because Instagram's direct API refuses raw uploads and demands a public image URL. Buffer removes this need. Servio's existing website account covered it (1 secret: `CLOUDINARY_URL`). |
| **`GH_PAT_SECRETS_WRITE`** | A GitHub key that let the weekly job save the auto-renewed Instagram token back into GitHub Secrets by itself. Only existed to serve the Meta token dance above. |

That's 12+ secrets across 5 services, three of them with expiry/renewal quirks
— versus the two-secret table in section D. That's the pivot in one sentence.
