# SETUP — owner runbooks

This document walks you through every account and key the system needs — with
numbered click-by-click steps and a "You are done when..." check at the end of
each section.

**How the system works now (owner decision, 2026-07-22):** it is **fully
automatic**. Every morning at 9:00 IST it writes the day's posts with
**Gemini** (Google's AI) and publishes them through **Buffer** (a scheduling
service) to the Servio **LinkedIn Company Page** and **Instagram**. There is
no review step and nothing to approve — once the keys below are in place, it
runs by itself. (The earlier design where every post waited for your OK in a
Pull Request was superseded by this decision.)

Buffer is what keeps this simple: instead of four separate developer setups —
one per social network — we connect the Servio accounts to Buffer once, and
one Buffer key posts everywhere.

## What's needed — the map of this document

| Section | What it sets up | Required? |
|---|---|---|
| A. Buffer — account, channels, API key, channel IDs | the publisher | **Required** (4 values total with section B) |
| B. Gemini API key | the AI writer | **Required** |
| C. Cloudinary | image hosting — Instagram needs it | Optional, recommended |
| D. Putting the values into GitHub Secrets | the locked safe where keys live | **Required** |
| E. Secrets at a glance | reference table | reference |
| F. Key lifetimes | what expires when (spoiler: nothing, on a schedule) | reference |
| Appendix | the old direct-to-platform setup, kept only as a fallback summary | not needed |

Starting platforms: **LinkedIn Company Page** and **Instagram** (Business
account). Adding X or Facebook later is not a developer project — it's
connecting one more channel inside Buffer (a two-minute click-through) plus a
small code change to switch it on.

A note on words used below:

- **Token / key / secret** — all mean the same thing: a long random-looking
  string that acts as a password for a program. Treat every one like a password.
- **API** — the "side door" a program uses to do things on a website (like
  posting) without clicking around the screen.
- **Channel** — Buffer's word for one connected social account (e.g. "the
  Servio LinkedIn Page" is one channel, "the Servio Instagram" is another).
- **Channel ID** — the reference number Buffer gives each channel. Not really
  a password, but we store the two IDs alongside the keys to keep everything
  in one place.

---

## A. Buffer — the publisher — *required*

Buffer is a well-established social media scheduling service. We connect the
Servio social accounts to it once, and from then on the system sends every
post to Buffer with a single key. Buffer handles the fiddly
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

### A4. Create the Buffer API key

This is the single key the system uses to send posts to Buffer. Steps
verified against Buffer's developer documentation (developers.buffer.com):

1. Log in to your Buffer account.
2. Go to **Settings → API** — the direct address is
   **publish.buffer.com/settings/api**.
3. Click **Create a new API key**.
4. Copy the key and store it in your password manager.

This value is **BUFFER_API_KEY** — it goes into GitHub Secrets in section D,
and nowhere else, ever.

> **⚠️ If a key has EVER been pasted into a chat, email, or document, treat
> it as leaked — regenerate it in Buffer first (same Settings → API page,
> create a new key) and only ever store it in GitHub Secrets.** A key is a
> password: anyone who has it can post as Servio. There is never a reason to
> put it anywhere except the GitHub Secrets safe — not in a message to a
> helper, not in a note, not in a file in this repo.

**You are done when:** both channels show as connected in Buffer, and the API
key is saved in your password manager (and, after section D, in GitHub
Secrets).

### A5. Find your two channel IDs (`npm run channels`)

Buffer gives every connected channel an ID, and the system needs the two IDs
to know where to post. There is a built-in command that looks them up — it
only *reads* your channel list and never posts anything. It runs on your own
computer:

1. Install Node.js (version 20 or newer) from **nodejs.org** — the "LTS"
   download, ordinary next-next-finish install. (Skip if already installed.)
2. Get this repository onto your computer: on the repo's GitHub page, click
   the green **Code** button → **Download ZIP**, then unzip it. (Skip if you
   already have a copy.)
3. Open a terminal in the repository folder (on Windows: right-click the
   folder → **Open in Terminal**).
4. First time only: type `npm install` and press Enter (downloads the tools —
   takes a minute).
5. Make a copy of the file `.env.example` and name the copy exactly `.env`
   (yes, starting with a dot). Open `.env` in Notepad and paste your Buffer
   API key on the `BUFFER_API_KEY=` line, so it reads
   `BUFFER_API_KEY=your-key-here`. Save the file. (`.env` never leaves your
   computer — the repository is set up to ignore it.)
6. Type `npm run channels` and press Enter.
7. A small table appears with three columns: **CHANNEL ID**, **NAME**,
   **SERVICE**.
8. Copy the CHANNEL ID from the row whose SERVICE says **linkedin** — that
   value is **BUFFER_LINKEDIN_CHANNEL_ID**.
9. Copy the CHANNEL ID from the row whose SERVICE says **instagram** — that
   value is **BUFFER_INSTAGRAM_CHANNEL_ID**.
10. Both go into GitHub Secrets in section D. If you don't plan to run the
    system locally, you can now delete the key from `.env` (or the whole
    `.env` file).

> **If a channel is ever disconnected and reconnected in Buffer** (for
> example after a forced re-login), it gets a NEW id. Rerun `npm run
> channels` and update the two secrets — the system will warn you in its logs
> if an id stops matching.

**You are done when:** you have two channel IDs saved, one for LinkedIn and
one for Instagram.

---

## B. Gemini API key (the AI writer) — *required*

This key lets the system call Gemini (model: `gemini-2.5-flash`) to research
topics and write every post.

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

This value is **GEMINI_API_KEY** — it goes into GitHub Secrets in section D.
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

## C. Cloudinary — image hosting — *optional, recommended*

Buffer only accepts images that live at a public web address — it cannot take
an image file directly. So before posting, the system uploads the day's
branded Servio image to **Cloudinary** (a free image-hosting service) and
hands Buffer the resulting address.

**What happens without this section:** nothing breaks — LinkedIn posts go out
without an image, and **Instagram is skipped** (Instagram refuses posts that
have no image). So if you want Instagram posting, do this section.

Good news: **the Servio website project already has a Cloudinary account** —
you can reuse the same account (its "cloud") here. No secret key is needed at
all for this: we use what Cloudinary calls an **unsigned upload preset**,
which is a named permission slip that allows uploads into your cloud.

1. Go to **cloudinary.com** and log in with the account the Servio website
   uses (or create a free account if you'd rather keep them separate).
2. On the dashboard, find your **Cloud name** — it is shown at the top of the
   dashboard (a short word, not a secret). Write it down: this value is
   **CLOUDINARY_CLOUD_NAME**.
3. Open **Settings** (the gear icon) → the **Upload** tab.
4. Find the **Upload presets** area and click **Add upload preset**.
5. Set **Signing Mode** to **Unsigned**. (This is the one setting that
   matters. You can leave everything else at its defaults, or set a folder
   like `servio-social` if you want these images kept tidy in one place.)
6. Click **Save**.
7. Copy the preset's **name** (a short generated word, or whatever you named
   it). This value is **CLOUDINARY_UPLOAD_PRESET**.

Both values go into GitHub Secrets in section D. Neither is a password in the
usual sense, but storing them as secrets keeps every setting in one place.

**You are done when:** you have a cloud name and an unsigned preset name
written down, and the preset shows in the Upload presets list with signing
mode "Unsigned".

---

## D. Putting the values into GitHub Secrets

GitHub Secrets is the locked safe where the keys live. Workflows can use them;
nobody — including you, after saving — can read them back out. Nothing secret
is ever written into the repo's files.

### How to add one secret (repeat for each)

1. Open this repository on github.com.
2. Click **Settings** (the repo's settings tab, top of the page).
3. In the left sidebar: **Secrets and variables → Actions**.
4. Click **New repository secret**.
5. **Name**: copy it EXACTLY from the table in section E — capital letters
   and underscores matter.
6. **Secret**: paste the value. Click **Add secret**.
7. To change a value later (e.g. after regenerating a leaked key): same
   place → click the secret's name → **Update**.

Add these, in any order:

- **Required (4):** `GEMINI_API_KEY`, `BUFFER_API_KEY`,
  `BUFFER_LINKEDIN_CHANNEL_ID`, `BUFFER_INSTAGRAM_CHANNEL_ID`
- **Optional:** `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET`
  (section C — for Instagram images), and `NOTIFY_WEBHOOK_URL` (a
  Slack/Discord webhook address if you want a one-line message after every
  run).

**You are done when:** the Actions secrets page lists at least the four
required names, spelled exactly as above. To confirm everything works, open
the **Actions** tab → **Daily social post** → **Run workflow** → choose mode
**health** — every required check in the result should say "ok" (optional
ones, like Cloudinary if you skipped section C, say "info" — that's fine).

---

## E. Secrets at a glance

| Name (exact) | What it powers | Where it comes from | Required? |
|---|---|---|---|
| `GEMINI_API_KEY` | The AI writer (Gemini, `gemini-2.5-flash`) | Section B — aistudio.google.com/apikey | **Yes** |
| `BUFFER_API_KEY` | The publisher — all channels through Buffer | Section A4 — publish.buffer.com/settings/api | **Yes** |
| `BUFFER_LINKEDIN_CHANNEL_ID` | Which Buffer channel is the LinkedIn Page | Section A5 — printed by `npm run channels` | **Yes** |
| `BUFFER_INSTAGRAM_CHANNEL_ID` | Which Buffer channel is Instagram | Section A5 — printed by `npm run channels` | **Yes** |
| `CLOUDINARY_CLOUD_NAME` | Image hosting (Instagram needs images) | Section C — Cloudinary dashboard | Optional |
| `CLOUDINARY_UPLOAD_PRESET` | Image hosting (pairs with the cloud name) | Section C — Cloudinary Settings → Upload | Optional |
| `NOTIFY_WEBHOOK_URL` | A short Slack/Discord message after every run | Created inside your Slack or Discord (an "incoming webhook") | Optional |

---

## F. Key lifetimes at a glance

| Value | Lifetime | What you do |
|---|---|---|
| `BUFFER_API_KEY` | **No published expiry** — Buffer's docs state no expiry schedule; their only guidance is "rotate your key if compromised" | Nothing, unless it leaks — then regenerate at Settings → API and update the GitHub Secret. |
| `GEMINI_API_KEY` | **No published expiry** — Google's docs state no expiry (works until you delete or regenerate it) | Nothing, unless it leaks — then regenerate in AI Studio and update the GitHub Secret. |
| The two channel IDs | Don't expire — but a channel gets a NEW id if it is ever disconnected and reconnected in Buffer | Rerun `npm run channels` and update the two secrets. |
| The Cloudinary pair | Don't expire | Nothing. |

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
| **Cloudinary** | Image host. Originally needed because Instagram's direct API demands a public image URL. It turned out Buffer has the same public-URL rule, so Cloudinary graduated from the fallback into the main setup — see section C above. |
| **`GH_PAT_SECRETS_WRITE`** | A GitHub key that let the weekly job save the auto-renewed Instagram token back into GitHub Secrets by itself. Only existed to serve the Meta token dance above. |

That's 12+ secrets across 5 services, three of them with expiry/renewal quirks
— versus the short table in section E. That's the pivot in one sentence.
