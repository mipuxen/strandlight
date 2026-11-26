# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository. You'll get a reply within 7 days.

Please include what you found, how to reproduce it, and what an attacker could do with it.

## Supported versions

Only the latest release on `main` (and the live demo built from it) receives fixes.

## How Strandlight is protected

No system can promise to be unbreakable, so protection is layered. The goal is that even if one layer fails, users' data is not exposed — and the strongest protection is data that is never collected.

**Core instrument (this release)**

- Camera frames and hand landmarks are processed only on the device, inside a Web Worker. They are never sent over the network.
- No accounts, cookies, analytics or third-party requests.
- The MediaPipe runtime, the hand model and all fonts are served from the site itself. The runtime and model are verified against SHA-256 hashes in [`assets.lock.json`](assets.lock.json) at build time; a mismatch fails the build.
- Strict Content Security Policy: `script-src 'self' 'wasm-unsafe-eval'`, no inline scripts, `connect-src` limited to the site and the optional localhost OSC bridge, `object-src 'none'`, `form-action 'none'`.
- User-visible text is set only through `textContent`; `innerHTML` and `outerHTML` are banned by a lint rule.
- Scene files and `#scene=` links are size-limited, schema-validated and clamped before use.
- `strandlight-bridge` listens on `127.0.0.1` only, accepts only known origins, and forwards only `/strandlight/...` OSC messages with numeric arguments.

**Repository**

- CodeQL (security-extended) on every push and PR, plus weekly.
- Dependabot for npm and GitHub Actions. The lockfile is committed.
- Every GitHub Action is pinned to a full commit SHA. Workflows run with read-only permissions by default.
- Recommended branch protection for `main`: pull request + passing CI required, no force pushes.

**Optional cloud layer (planned, not yet enabled)**

The planned Supabase/Vercel layer (Google sign-in, emailed recordings, showcase, admin panel) will ship only after a review against the checklist in [docs/SPEC.md](docs/SPEC.md#security-and-privacy): Row Level Security deny-by-default on every table, admin role only in `app_metadata` and only with a 2FA (aal2) session, emails readable only through a masking function, private storage buckets with magic-byte checks and short-lived signed URLs, the service-role key only in server environment variables, rate limits and Cloudflare Turnstile on writes.

## Release checklist

Before each release:

- [ ] `npm audit` has no high or critical issues
- [ ] CodeQL has no open alerts
- [ ] `assets.lock.json` hashes match the published `checksums.txt`
- [ ] CSP is present in the built `index.html`
- [ ] No secrets in the diff (`git diff --stat`, secret scanning enabled)
