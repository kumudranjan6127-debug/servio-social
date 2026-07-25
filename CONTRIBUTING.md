# Contributing to Servio Social

Thanks for your interest! This is a small, fully-automatic TypeScript pipeline
that runs on GitHub Actions. A few notes to make contributing smooth.

## Setup

```bash
npm ci
cp .env.example .env   # fill in your own keys (never commit .env)
git config core.hooksPath .githooks   # enable the local secret-scan hook
```

## Before you open a PR

- `npm run typecheck` — must pass (CI enforces it).
- Keep secrets out of the repo. A pre-commit hook and a CI job
  (`scripts/scan-secrets.mjs`) scan for credentials; if either flags your
  change, move the value to a GitHub Actions secret.
- Match the surrounding code style (Prettier + ESLint are configured).

## Testing without posting

The workflow's `workflow_dispatch` diagnostic modes (see
[docs/DIAGNOSTICS.md](docs/DIAGNOSTICS.md)) let you verify each dependency
without publishing anything — `health`, `channels`, `cloudinary`, `models`.

## Reporting issues

Use the issue templates. For anything security-related, please follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.
