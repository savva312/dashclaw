# Contributing to Dashclaw

Thank you for improving Dashclaw.

## Before opening a change

- Use GitHub Issues for bugs and feature proposals.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Keep changes focused and avoid committing credentials, runtime databases,
  generated output, or private OpenClaw data.
- For Gateway contract changes, state the OpenClaw version used for validation.

## Development setup

Requirements are Node.js 22 or newer and the repository-pinned pnpm version.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
chmod 600 .env
DASHCLAW_FAKE_GATEWAY=1 pnpm dev
```

## Required checks

Run these commands before opening a pull request:

```bash
pnpm audit --audit-level low
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Add regression coverage for behavior changes. Security-boundary changes should
include a test proving the rejected or redacted case.

## Pull requests

- Explain the problem, approach, user-visible impact, and verification.
- Keep unrelated formatting or refactoring out of the change.
- Update README, security, environment, or runtime-limit documentation when
  behavior changes.
- All required CI checks must pass. Maintainers may request a smaller change or
  additional compatibility evidence before merge.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
