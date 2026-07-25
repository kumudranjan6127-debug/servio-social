# Security Policy

## Reporting a vulnerability

Please report suspected security issues **privately** via GitHub's
[private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
(the repository's **Security → Advisories → Report a vulnerability** tab).
Please do not open a public issue for security problems.

## Secrets

This project keeps **no secrets in the repository**. Every credential
(`GEMINI_API_KEY`, `BUFFER_API_KEY`, Buffer channel IDs, Cloudflare / fal.ai /
Cloudinary values, and any notification webhook) is supplied as a **GitHub
Actions secret** and read only in [`src/config/env.ts`](src/config/env.ts).
`.env` is git-ignored; only `.env.example` (variable **names** only, no values)
is committed.

If you ever find a real key committed anywhere — including the git history —
treat it as **leaked**: rotate it at its source immediately and report it via
the process above.

## Defenses in place

- Credentials are passed only in HTTP request headers, never logged or placed in URLs.
- A pre-commit hook and a CI job (`scripts/scan-secrets.mjs`) block commits that
  contain likely credentials.
- Third-party GitHub Actions are pinned to commit SHAs; Dependabot keeps them
  and the npm dependencies patched.
- The publishing workflow has no `pull_request` trigger, so fork PRs cannot
  reach its secrets.
