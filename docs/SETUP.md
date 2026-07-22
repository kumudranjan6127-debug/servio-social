# SETUP — owner runbooks

This document walks you through every account, app, and key the system will ever
need — one section per prerequisite, with numbered click-by-click steps and a
"You are done when..." check at the end of each.

## When is each step actually needed?

**Nothing in this document blocks Phase 0 or Phase 1.** You can do these at your
own pace.

| Section | What it sets up | Needed from |
|---|---|---|
| A. Instagram Business account | lets the API post to Instagram | Phase 2 |
| B. Facebook Page + link Instagram | lets the API post to Facebook, required for IG too | Phase 2 |
| C. Meta developer app | the "key-maker" for Facebook + Instagram | Phase 2 |
| D. X developer account | lets the API post to X | Phase 2 |
| E. LinkedIn developer app | lets the API post to your LinkedIn profile | Phase 2 |
| F. Anthropic API key | lets the system use Claude (the AI writer) | **Phase 1** |
| G. Cloudinary | public image hosting (Instagram requires it) | Phase 2 |
| H. Putting the keys into GitHub Secrets | where all keys are stored safely | Phase 1 (first key) |
| I. Token lifetimes at a glance | reference table — what expires when | reference |

A note on words used below:
- **Token / key / secret** — all mean the same thing: a long random-looking string
  that acts as a password for a program. Treat every one like a password.
- **API** — the "side door" a program uses to do things on a website (like posting)
  without clicking around the screen.

---

## A. Convert Instagram to a Business (or Creator) account — *Phase 2*

Instagram only allows posting-by-program on professional accounts. Converting is
free, reversible, and doesn't change your followers or posts.

1. Open the Instagram app on your phone and log in to the Servio account.
2. Go to your profile (bottom-right icon), then tap the **☰ menu** (top right).
3. Tap **Settings and activity**.
4. Scroll to **Account type and tools** (under "For professionals").
5. Tap **Switch to professional account** and tap through the intro screens.
6. Pick a category that fits — e.g. **"Web designer"** or **"Internet company"**.
7. When asked **Business or Creator**, choose **Business**.
8. You can skip any "add contact info" or "grow your audience" screens.

**You are done when:** your profile shows the category label under the account
name, and the menu now shows a "Professional dashboard" option.

---

## B. Confirm/create the Facebook Page and link Instagram to it — *Phase 2*

Facebook posting goes to a **Page** (a public business presence), not your
personal profile. Instagram's API also rides on this Page connection.

### B1. The Page

1. Log in to Facebook with the account that should own the Servio Page.
2. If a Servio Page already exists, skip to B2. Otherwise go to
   **facebook.com/pages/create**.
3. Page name: **Servio**. Category: type and pick **"Web designer"** (or similar).
4. Add the bio/description if you like (optional), then click **Create Page**.
5. Upload the Servio logo as the profile picture (there's a copy in this repo at
   `assets/logo/servio-icon-512.png`).

### B2. Link Instagram to the Page

1. Open the Page (on desktop: facebook.com, switch into the Page).
2. Go to the Page's **Settings**.
3. Find **Linked accounts** (sometimes under "Permissions" or via Meta Business
   Suite → Settings → **Business assets** → Instagram).
4. Choose **Instagram → Connect account** and log in with the Servio Instagram
   account from section A.
5. If asked "Allow access to Instagram messages", you can say No — we don't
   need messages.

**You are done when:** the Page's Linked accounts screen shows the Servio
Instagram account as **Connected**.

---

## C. Create the Meta developer app — *Phase 2*

This "app" is not something people download — it's Meta's way of issuing keys.
One Meta app covers **both** Facebook and Instagram posting.

### C1. Become a Meta developer (one-time)

1. Go to **developers.facebook.com** and log in with the same Facebook account
   that manages the Servio Page.
2. Click **Get started**, accept the terms, and verify with the code they send
   (email or SMS).

### C2. Create the app

1. In the developer dashboard, click **Create app**.
2. When asked for the app **type / use case**, choose **Business**. (This exact
   wording moves around in Meta's screens — the important thing is picking the
   *Business* option, not "Consumer" or "Gaming".)
3. App name: **Servio Social**. Contact email: your email. Click **Create**.

### C3. Add the Instagram product

1. On the app's dashboard you'll see a list of "products" you can add.
2. Find **Instagram** and click **Set up**. (This is the "Instagram API" product;
   we use the *Instagram Login* route.)
3. Follow its prompts to connect the Servio Instagram Business account from
   section A.

### C4. Add yourself with a role

1. In the app's left menu, go to **App roles → Roles**.
2. Check that your account is listed as **Administrator**. If anyone else will
   help run this, click **Add people** and add them as Administrator or Developer.

### C5. Switch the app to LIVE — do not skip this

At the top of the app dashboard there is a switch that says **Development** /
**Live** (or an "App Mode" toggle).

> **The dev-mode trap:** while an app is in *Development* mode, everything it
> posts is only visible to the people listed in App roles. The system would post,
> report "success", the post would even appear when *you* look — and be
> completely **invisible to the public**. This is the single most common "why is
> nothing showing up" mistake, so we check it here, before publishing ever starts.

1. Before Meta lets you switch, it requires a **Privacy Policy URL** under
   **Settings → Basic**. Use the Servio website's privacy policy page.
2. Fill in any other required fields on Settings → Basic (category, icon).
3. Flip the switch to **Live** and confirm.

### C6. Values to collect from this section (write them down safely)

These go into GitHub Secrets in section H. The exact clicks to generate the two
tokens are fiddly and Meta reshuffles them often, so plan to do C6 together with
whoever sets up Phase 2 — but this is what you're collecting and where it lives:

- **FB_PAGE_ID** — the Page's ID number: open the Page → **About** →
  "Page transparency" / "Page ID", or Meta Business Suite → Settings → Pages.
- **META_SYSTEM_USER_TOKEN** — made in **Meta Business Suite → Settings →
  Users → System users**: create a system user, give it access to the Servio
  Page, click **Generate token**, select the posting permissions, and choose
  the **never-expire** option. This is the key that posts to Facebook.
- **IG_USER_ID** — the Instagram account's ID number, shown in the app's
  Instagram product settings once the account is connected.
- **IG_ACCESS_TOKEN** — the Instagram posting key, generated from the app's
  Instagram product settings for the connected account. It lasts 60 days, but
  the system **renews it automatically every week** — you only ever create it
  once.

**You are done when:** the app dashboard says **Live**, your role says
Administrator, and you have the four values above stored somewhere safe
(a password manager, not a plain file).

---

## D. X (Twitter) developer account — *Phase 2*

X charges per post instead of a monthly fee: about **$0.015 per plain post**, and
about **$0.20 per post that contains a link** (their prices, verified July 2026).
At one post a day that's a few dollars a month.

### D1. Sign up and add credits

1. Log in to the Servio X account in your browser.
2. Go to **console.x.com** (the X developer console).
3. Sign up for developer access and accept the developer terms.
4. Find the **Billing / Credits** section and buy a small block of **prepaid
   credits** (the smallest amount is fine to start — posts draw from this
   balance).

### D2. Create the app and set permissions

1. In the console, create a **Project**, and inside it an **App** (name it
   "Servio Social").
2. Open the app's **Settings**, find **User authentication settings** → **Set up**
   (or Edit).
3. Set **App permissions** to **Read and write**. Save. (Website/callback URL
   fields can be filled with https://servio-0.web.app — they're required by the
   form but not used by us.)

### D3. Generate the 4 keys — order matters

The system signs in with an older, very stable method called OAuth 1.0a. It needs
exactly **four** values, all found on the app's **Keys and tokens** tab:

1. **API Key** and **API Key Secret** — under "Consumer Keys". Click
   **Regenerate** if you can't see them anymore (they're shown only once).
2. **Access Token** and **Access Token Secret** — under "Authentication Tokens".
   Click **Generate** (or Regenerate).
3. Copy all four into your password manager immediately — X will never show
   them again.

> **The regenerate trap:** the Access Token is stamped with the permissions the
> app had *at the moment it was generated*. If you set Read-and-write **after**
> generating the token (or ever change permissions later), the old token stays
> read-only forever and every post fails. The fix is always the same:
> **Regenerate the Access Token + Secret after any permission change**, and put
> the new values into GitHub Secrets. Do D2 (permissions) before D3 (tokens) and
> you avoid the trap entirely.

**You are done when:** the Keys and tokens page shows your Access Token with
"**Created with Read and Write permissions**" written next to it, you have all
four values saved, and your credit balance is above zero.

---

## E. LinkedIn developer app — *Phase 2*

We post to your **personal LinkedIn profile** (the company-page option comes in a
later phase and needs a separate LinkedIn approval).

### E1. Create the app

1. Go to **developer.linkedin.com** and sign in with your personal LinkedIn login.
2. Click **Create app**.
3. App name: **Servio Social**.
4. LinkedIn requires every app to be attached to a **company Page**. If Servio
   has no LinkedIn Page yet, create a bare-bones one first (linkedin.com →
   For Business → Create a Company Page — name and logo are enough). Attaching
   the app to it does **not** mean we post to it; posts still go to your profile.
5. Upload a logo (use `assets/logo/servio-icon-512.png`), tick the legal
   agreement, click **Create app**.
6. On the app's **Settings** tab, click **Verify** next to the Page and complete
   the verification (a Page admin clicks an approval link).

### E2. Add the two products

1. Open the app's **Products** tab.
2. Request **"Share on LinkedIn"** — this is the permission to create posts.
   It's self-serve and is granted immediately or near-immediately.
3. Request **"Sign In with LinkedIn using OpenID Connect"** — this lets the
   system ask "who am I?", which is how it learns your profile's internal ID.

### E3. Generate the access token and find your author ID

1. In the developer portal, open the **OAuth token tools** (under "Docs and
   tools" → Token Generator).
2. Generate a token for this app, ticking the scopes **w_member_social**,
   **openid**, and **profile** — then sign in and approve when LinkedIn asks.
3. Copy the access token — this is **LINKEDIN_ACCESS_TOKEN**.
4. Your author ID: still in the token tools, use the token against the
   **/v2/userinfo** endpoint (the portal has a "test" button for this). The
   reply includes a short code field called **"sub"** (looks like `AbC12dEfG3`).
5. **LINKEDIN_AUTHOR_URN** is that code with a prefix:
   `urn:li:person:AbC12dEfG3`.

> **Heads-up:** this token lasts about **60 days** and LinkedIn does not allow
> our kind of app to renew it automatically. The weekly health check will open a
> warning for you around day 45 — when it does, just repeat E3 (about two
> minutes) and update the secret in GitHub.

**You are done when:** the Products tab shows both products as added, and you
have a token plus an author URN that starts with `urn:li:person:`.

---

## F. Anthropic API key (the AI writer) — needed at *Phase 1*

This is the only key needed before publishing exists — it's what lets the system
call Claude to research and write the drafts.

1. Go to **console.anthropic.com** and create an account (or sign in).
2. Open **Billing** and add a payment method or buy prepaid credits. (Typical
   cost for this system: cents per day — each post uses one web-research call
   and one writing call.)
3. Open **API Keys** in the left menu.
4. Click **Create Key**, name it `servio-social`, and click Create.
5. Copy the key **immediately** — it is shown only once. It starts with
   `sk-ant-`. Store it in your password manager.

**You are done when:** you have a key starting `sk-ant-` saved, and the Billing
page shows a positive credit balance or an active payment method.

---

## G. Cloudinary (image hosting) — *Phase 2*

Instagram's API refuses raw image uploads — it insists on being handed a public
web address where the image already lives. Cloudinary is the image host we use
for that. **Servio already has a Cloudinary account** (used by the website), and
the free tier covers this easily — reuse it, don't create a new one.

1. Log in at **cloudinary.com** with the existing Servio account.
2. On the Dashboard (home screen), find the box with your account details —
   it shows an **"API environment variable"** that looks like
   `cloudinary://123456789:AbCdEf...@your-cloud-name`.
3. Click the copy button next to it. That whole string is the one value we
   need: **CLOUDINARY_URL**.

**You are done when:** you have the full `cloudinary://...` string saved in your
password manager.

---

## H. Putting the keys into GitHub Secrets

GitHub Secrets is the locked safe where all keys live. Workflows can use them;
nobody — including you, after saving — can read them back out. Nothing secret is
ever written into the repo's files.

### How to add one secret (repeat per row of the table)

1. Open this repository on github.com.
2. Click **Settings** (the repo's settings tab, top of the page).
3. In the left sidebar: **Secrets and variables → Actions**.
4. Click **New repository secret**.
5. **Name**: copy it EXACTLY from the table below — capital letters and
   underscores matter.
6. **Secret**: paste the value. Click **Add secret**.
7. To change a value later (e.g. the LinkedIn token every ~60 days): same
   place → click the secret's name → **Update**.

### The complete list of secret names

| Name (exact) | What it is | Where it comes from | Needed from |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Key for Claude, the AI writer | Section F, step 5 | **Phase 1** |
| `X_API_KEY` | X app "Consumer" key | Section D3 | Phase 2 |
| `X_API_SECRET` | X app "Consumer" secret | Section D3 | Phase 2 |
| `X_ACCESS_TOKEN` | X account posting token | Section D3 | Phase 2 |
| `X_ACCESS_SECRET` | X account posting secret | Section D3 | Phase 2 |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn posting token (~60 days) | Section E3, step 3 | Phase 2 |
| `LINKEDIN_AUTHOR_URN` | Your profile's ID, `urn:li:person:...` | Section E3, step 5 | Phase 2 |
| `FB_PAGE_ID` | The Facebook Page's ID number | Section C6 | Phase 2 |
| `META_SYSTEM_USER_TOKEN` | Facebook posting key (never expires) | Section C6 | Phase 2 |
| `IG_USER_ID` | The Instagram account's ID number | Section C6 | Phase 2 |
| `IG_ACCESS_TOKEN` | Instagram posting key (auto-renewed) | Section C6 | Phase 2 |
| `CLOUDINARY_URL` | Image-hosting address + key, `cloudinary://...` | Section G | Phase 2 |
| `GH_PAT_SECRETS_WRITE` | A GitHub key that lets the weekly health check save the freshly renewed Instagram token back into this list by itself | github.com → your avatar → Settings → Developer settings → Personal access tokens → Fine-grained → generate one limited to **this repo** with **Secrets: read and write** permission | Phase 2 |

**You are done when:** the Actions secrets page lists the names you've added,
spelled exactly as above. (Add them as each phase needs them — only
`ANTHROPIC_API_KEY` is needed for Phase 1.)

---

## I. Token lifetimes at a glance

What expires, when, and whether you have to do anything:

| Key | Lifetime | Who renews it | What you do |
|---|---|---|---|
| X (all 4 values) | **Never expire** | — | Nothing. (Only exception: regenerate after a permission change — see the trap in D3.) |
| Facebook `META_SYSTEM_USER_TOKEN` | **Never expires** (created with the never-expire option) | — | Nothing. |
| Instagram `IG_ACCESS_TOKEN` | 60 days | **The system** — the weekly health check renews it automatically | Nothing. |
| LinkedIn `LINKEDIN_ACCESS_TOKEN` | ~60 days | **You** — LinkedIn forbids auto-renewal for our app type | The health check warns you around day 45; repeat section E3 and update the secret (about 2 minutes). |
| Anthropic `ANTHROPIC_API_KEY` | Doesn't expire | — | Nothing, unless you choose to rotate it. |
| Cloudinary `CLOUDINARY_URL` | Doesn't expire | — | Nothing. |
| `GH_PAT_SECRETS_WRITE` | You pick (GitHub suggests up to 1 year) | You | GitHub emails you before it expires; generate a new one and update the secret. |

If a key ever leaks (pasted somewhere public by accident): go to the site that
issued it, revoke/regenerate it there, then update the GitHub Secret. Everything
recovers in minutes.
