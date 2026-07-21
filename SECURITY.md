# Security Policy

## Supported Versions

Security fixes are applied to the latest release on the `main` branch.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Dashboard Token Handling

`DASHCLAW_TOKEN` is a server-only administrative credential. Enter it through the browser login screen when prompted; never place it in a `VITE_*` variable or otherwise inject it while building browser assets. Vite-prefixed variables are public by design.

If a dashboard token may have been used while producing or sharing a browser build made before the SEC-001 fix:

1. Rotate `DASHCLAW_TOKEN` in the deployment's secret store.
2. Restart Dashclaw with the replacement credential.
3. Delete the affected browser artifacts and source maps, purge any cached copies, and rebuild from a fixed revision.
4. Record that rotation occurred in the deployment change log without recording either the old or replacement value.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report security issues privately via [GitHub Security Advisories](https://github.com/savva312/dashclaw/security/advisories/new) or by emailing the repository owner through their GitHub profile.

Include:

- A description of the issue and potential impact
- Steps to reproduce
- Affected versions or commits, if known

You should receive a response within a few business days. We will coordinate disclosure and a fix before publishing details publicly.

## Deployment Hardening

Dashclaw authenticates API and live event-stream requests with the
`Authorization: Bearer ...` header. Do not place `DASHCLAW_TOKEN` or other
reusable credentials in URLs or query strings.

As defense in depth, configure reverse proxies, load balancers, access logs, and
application-performance tooling to redact query strings. This limits accidental
exposure of any sensitive values introduced by clients or future integrations,
but redaction is not a substitute for header-based authentication.

## Dependency Security Maintenance

Repository maintainers own dependency and package-manager updates. Dependabot
checks npm and GitHub Actions dependencies weekly, groups compatible minor and
patch updates, leaves major updates as separately reviewable pull requests, and
does not auto-merge changes.

CI uses the exact `pnpm@10.34.0` release declared in `package.json`, installs
from the frozen lockfile, and audits at the `low` severity threshold. Dependency
lifecycle scripts are denied by default; `better-sqlite3` (native SQLite
bindings) and `esbuild` (bundler binary verification) are the only reviewed
entries in `onlyBuiltDependencies`.

Audit findings must be fixed before merge. If an immediate fix is unavailable,
document the advisory, affected dependency path, application exposure, owner,
mitigation, and review expiry in a tracked issue; do not bypass or weaken CI.
