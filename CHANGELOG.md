# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Security hardening for public release: dependency-free secret scanner
  (`scripts/scan-secrets.mjs`) with a pre-commit hook and a CI job, `SECURITY.md`,
  and Dependabot for Actions + npm.
- Community-health files: LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, issue/PR
  templates, SUPPORT, CODEOWNERS, and `docs/DIAGNOSTICS.md`.

### Changed
- GitHub Actions are pinned to commit SHAs.
- Run logs are uploaded as an ephemeral 14-day artifact instead of being
  committed to the repo.
- Hardened the `workflow_dispatch` `mode` input against shell injection.
