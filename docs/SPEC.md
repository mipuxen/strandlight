# Strandlight — product specification

The original specification was written in Uzbek before any code, and every open question was settled explicitly. This is the English version, with the status of each part.

Legend: ✅ shipped in stage 1 · 🟡 partially shipped · ⏳ planned

## Concept

Strandlight is an instrument that runs in the browser: in front of a webcam, the player pulls strings of light into the air with their hands and then plucks them to make music. Nothing to install; camera images never leave the device.

- **Who it's for:** curious people with no musical background (Beginner), musicians and content creators (Musician), artists and performers using TouchDesigner or Ableton (Virtuoso + MIDI/OSC).
- **What's different:** existing air harps have fixed strings. In Strandlight the player draws the instrument: a string stays where it's pulled, and its length sets its note and voice.
- **Two layers:** `core` runs with no server; anyone can clone and run it. `cloud` is optional (Google sign-in, admin panel, email, showcase) and is enabled only on the official site.
- **License:** MIT. Code and comments in English only.

## Decisions

| Topic         | Decision                                                                                                | Status                               |
| ------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Name, license | Strandlight, MIT                                                                                        | ✅                                   |
| Stack         | Vite + TypeScript, no framework                                                                         | ✅                                   |
| Architecture  | Serverless core + optional cloud (Supabase)                                                             | ✅ core · ⏳ cloud                   |
| Sound         | 3 timbres by length: short = Crystal, medium = Harp, long = Bass                                        | ✅                                   |
| Difficulty    | Beginner (default), Musician, Virtuoso                                                                  | ✅                                   |
| Gestures      | Pinch to draw, pluck, flick, grab to stretch, V sign = mute, palm = sustain, two hands = pad            | ✅                                   |
| Music tools   | Looper, metronome/BPM, scene saving, video recording                                                    | ✅                                   |
| MIDI/OSC      | Web MIDI + optional `strandlight-bridge` (OSC)                                                          | ✅ (bridge not yet on npm)           |
| Design        | 3 themes: Neon Cosmos, Golden Harp, White Silk                                                          | ✅                                   |
| Guide         | Interactive ghost hand, short and beautiful                                                             | ✅                                   |
| Languages     | Auto-detect + manual switch. Full: EN, UZ, KO, RU. Extra: VI (complete), ES, ZH, JA, DE, FR, PT, TR, AR | ✅ tier 1 · 🟡 tier 2 (main screens) |
| Sign-in       | Google only, no passwords stored                                                                        | ⏳                                   |
| Video         | Downloaded on device; signed-in users can email themselves a 7-day link                                 | ✅ download · ⏳ email               |
| Admin         | Masked emails, anonymous analytics, exit survey, private feedback                                       | ⏳                                   |
| Showcase      | 1 video per user (60 s, 50 MB), admin-approved, comments                                                | ⏳                                   |
| Mobile        | Light mode + touch input without a camera                                                               | ✅                                   |
| Deploy        | GitHub Pages: core demo. Vercel: full official site                                                     | ✅ Pages · ⏳ Vercel                 |

## Instrument: strings and gestures

A string is a line of light between two points, vibrating with a decaying standing wave — a simplified model of a real string. The camera tracks 21 points on each hand.

| Gesture                          | Result                                                                             | Modes              |
| -------------------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| Pinch + pull + release           | A new string freezes in the air                                                    | All                |
| Index finger crosses a string    | The string plays; faster is louder                                                 | All                |
| Quick flick                      | Sparks run along the nearest string, which plays                                   | All                |
| Pinch an existing string's end   | Move or stretch it; pitch bends smoothly                                           | Musician, Virtuoso |
| V sign (index + middle) held ½ s | All strings fall silent (a ring fills while you hold it)                           | All                |
| Open palm held 1 s               | Sustain and reverb grow                                                            | Musician, Virtuoso |
| Both hands visible               | 5 live threads between fingertips play a pad chord; tighter threads sound brighter | All                |

Technical requirements:

- One Euro filter on every landmark to remove jitter. ✅
- Pinch with hysteresis: on at 0.045, off at 0.07, relative to palm size. Tracking gaps up to 200 ms are ignored. ✅
- At most 48 strings; beyond that the oldest fades out. ✅
- Keys: Z undo, Shift+Z redo, C clear, V camera background, Space looper, H help. ✅

## Sound and music

All sound is synthesized with Web Audio — no sample files, so the repository stays light and license-clean. Target: under 30 ms from pluck to sound. ✅

| Timbre  | Length (of screen diagonal) | Synthesis                               | Character                    |
| ------- | --------------------------- | --------------------------------------- | ---------------------------- |
| Crystal | under 25%                   | 2-operator FM with inharmonic overtones | Glass bell, long and bright  |
| Harp    | 25–55%                      | Karplus-Strong in an AudioWorklet       | Warm plucked harp string     |
| Bass    | over 55%                    | Karplus-Strong + low-pass + sub sine    | Deep, between cello and bass |

Shared chain: convolution reverb with a generated impulse, stereo delay, limiter. Pad: detuned saw waves through a soft filter.

| Mode               | Notes                                                                                 | Extras                                         |
| ------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Beginner (default) | C minor pentatonic, no wrong notes, 2 octaves                                         | Guide on, notes snap to the nearest step       |
| Musician           | 12 scales (major, minor, Dorian, Mixolydian, Blues, Hijaz…), any key, 3 octaves       | Looper, BPM, pitch bend, sustain, scene saving |
| Virtuoso           | Chromatic or free tuning; "real harp" preset draws parallel strings in diatonic order | Velocity, MIDI/OSC, A4 from 432 to 446 Hz      |

- **Looper:** 4 layers, quantized to the BPM, each layer can be muted or cleared. Stored as events, not audio. ✅
- **Metronome:** 40–200 BPM, tap tempo, visual pulse. ✅
- **Scenes:** strings and settings as JSON — in `localStorage`, a file, or compressed into a `#scene` URL. No server. ✅
- **MIDI/OSC:** every pluck as note on/off; each timbre on its own channel; string tension on CC 1. `npx strandlight-bridge` turns a localhost WebSocket into UDP OSC. Addresses: `/strandlight/pluck`, `/strandlight/hand/{i}/tip/{j}`, `/strandlight/pinch`. ✅ (TouchDesigner `.toe` example ⏳)

## Design

The screen is a dark stage; light comes only from the strings. The interface sits at the edges and fades after 3 seconds without activity. ✅

| Theme                 | Background | String colors                                     | Type              | Mood                           |
| --------------------- | ---------- | ------------------------------------------------- | ----------------- | ------------------------------ |
| Neon Cosmos (default) | `#05060F`  | Crystal `#7CF7FF`, Harp `#FF4FD8`, Bass `#FFC857` | Sora              | TouchDesigner, club, Instagram |
| Golden Harp           | `#0E0904`  | Amber, gold, copper                               | Cormorant + Inter | Concert, classical             |
| White Silk            | `#000000`  | White and silver, very thin strings               | Manrope Light     | Gallery, minimal               |

- Fonts are self-hosted; no requests to Google Fonts. ✅
- Rendering: WebGL2 bloom over the scene with slight chromatic aberration; Canvas 2D fallback, which is also the mobile light mode. Camera background mirrored at 20% brightness, can be turned off. Target 60 fps desktop, 30 fps phone. ✅ (sparks currently simulated on the CPU, capped at 1,500)
- **Attract mode:** before camera permission, demo strings ring on their own, with a "Start playing" button in the middle. ✅
- **Ghost-hand guide (6 steps, under 60 s):** show your palm → pinch → pull → let go → sweep across → flick. A semi-transparent hand built from the same 21 landmarks the tracker uses shows every finger movement. Each step ends when the player does it, shows a tip after 8 s, and Skip is always visible. While learning it sits in the middle of the screen; afterwards it shrinks to a small "How to play" dock. **H** opens help cards with a looping hand for each gesture, the length-to-sound map, keys and tips. Drawn in code, so it needs no video and works in every language. ✅
- **Demo video:** recorded with Strandlight's own recorder, 30–60 s, for the README, the site and Instagram. ⏳ (last step before the first public release announcement)

## Languages (i18n)

The language is chosen from `navigator.languages` — never from IP or location — and can always be changed from the top-right menu; the choice is remembered. ✅

- Tier 1, reviewed by hand: English, O'zbekcha (Latin), 한국어, Русский. ✅
- Tier 2, community-improved: Tiếng Việt (complete), Español, 中文 (简体), 日本語, Deutsch, Français, Português, Türkçe, العربية (full RTL). 🟡 main screens translated, the rest falls back to English.
- Any other language opens in English. Adding one = adding `src/i18n/locales/<code>.json` (see CONTRIBUTING). ✅
- ICU message format for numbers and plurals; CI checks that tier-1 locales have every key. ✅
- README in EN, UZ, KO and RU. ✅

## Recording and email

- Sources: the Strandlight scene (canvas + sound), camera only, or the whole screen via `getDisplayMedia`. Sound always comes straight from the AudioContext — no microphone. ✅
- MP4 (H.264/AAC) where supported, otherwise WebM (VP9/Opus). 3-2-1 countdown, REC badge and timer. File name `strandlight-YYYYMMDD-HHMM.mp4`. ✅
- No length limit for downloads. ✅
- Email (signed-in users only): upload to a private Supabase bucket, a Vercel function creates a 7-day signed link and sends a localized email via Resend; a cron deletes the file after 7 days. Limit 3 per user per day (Resend free tier: 100/day); if the limit is hit the video still downloads. ⏳

## Cloud layer ⏳

Enabled only when `VITE_SUPABASE_URL` is configured. Without it, sign-in, email and showcase buttons don't appear and the instrument works exactly the same. Sign-in is never required to play, record or save.

- **Sign-in:** "Continue with Google" only (Supabase Auth, PKCE). No passwords in the database.
- **Admin panel** (`/admin`, admin role only, TOTP 2FA required): live presence, daily/weekly actives, session length, country, language, device, mode and theme choices, a funnel (opened → camera allowed → first string → first note → guide finished → video recorded), exit-survey results, a private feedback inbox, users with masked emails, showcase and comment moderation.
- **Anonymous analytics:** a random per-tab session id that disappears when the tab closes; no cookies, no IP; country only as a 2-letter code from Vercel's header; ~12 events with no personal data; rolled up into daily totals after 90 days.
- **Exit survey:** shown once to someone leaving after 30+ seconds — Too hard / Camera didn't work / Too slow / Just trying, I'll be back + optional text, sent anonymously with `sendBeacon`.
- **Showcase:** 1 active video per user (60 s, 50 MB, MP4/WebM), private until approved; gallery with name, theme, mode, likes and comments. Comments: signed-in only, 500 characters, 20/day, no links, word filter, report button, auto-hidden after 3 reports.

## Security and privacy

No system can be guaranteed unbreakable, so protection is layered: if one layer fails, user data should still not be exposed. The strongest protection is data that is never stored.

Data minimization: camera frames and hand points never leave the device ✅ · no passwords, no IPs, anonymous analytics ⏳ · "Delete my account" and "Download my data" (GDPR, PIPA) ⏳ · accounts 14+ (the instrument is open to all) ⏳

Database (Supabase) ⏳: RLS on every table, deny by default, users see only their own rows · admin role in `app_metadata`, changeable only with the server key; admin policies require an aal2 (2FA) session · emails only in `auth.users`, exposed to admins only through a masking `security definer` function · AES-256 at rest, TLS in transit · `service_role` key only in Vercel server env.

Files ⏳: private buckets, per-user folders, server-side magic-byte type checks, size limits, short-lived signed URLs; showcase videos are never public before approval.

Browser and server: strict CSP (`script-src 'self'`, no inline script) ✅ · HSTS, `frame-ancestors 'none'`, `Permissions-Policy: camera=(self)`, COOP as HTTP headers on Vercel ⏳ (GitHub Pages can't set headers; the demo uses a CSP meta tag) · MediaPipe wasm and model self-hosted and hash-verified ✅ · user text only via `textContent` ✅ · rate limits and Cloudflare Turnstile on server endpoints ⏳

Repository: Dependabot, CodeQL, secret scanning, protected `main` (PR + CI), actions pinned by SHA, lockfile committed, SECURITY.md, a security checklist before every release. ✅ (branch protection and secret scanning are repository settings — see SECURITY.md)

## Technical architecture

See [ARCHITECTURE.md](ARCHITECTURE.md). Key points: the core never imports the cloud; tracking runs in a Web Worker (MediaPipe Tasks Vision, VIDEO mode, GPU delegate with CPU fallback); a small event-driven structure without a framework; bundle under 200 KB excluding the model; TypeScript strict, ESLint, Prettier, Vitest unit tests for gestures, notes and physics; headless-browser smoke testing; latest two versions of Chrome, Edge, Safari and Firefox (Web MIDI is Chromium-only and the UI says so).

## Deployment

| Site     | Address                       | Contents             | How                                       |
| -------- | ----------------------------- | -------------------- | ----------------------------------------- |
| Demo     | mipuxen.github.io/strandlight | Core only, no server | GitHub Actions on every push to `main` ✅ |
| Official | strandlight.vercel.app        | Core + cloud + admin | Vercel, preview link per PR ⏳            |

Planned with the cloud layer: a daily keep-alive request so the free Supabase project doesn't pause; a warning in the admin panel at 80% of free limits (Supabase 1 GB storage, 5 GB egress, 50,000 MAU; Resend 100 emails/day); weekly encrypted database backup to a private Actions artifact kept 4 weeks. Keys go straight into Vercel and GitHub Secrets, never into chat or the repo.

## Stages

Each stage is a separate, reviewed change. After stage 1 the instrument is public on GitHub Pages. The cloud layer is enabled only after passing the security review.

## Open questions

- Is the admin only the author, or will there be a moderator role (e.g. showcase approval only)?
- Who picks "performance of the week": the admin, likes, or both?
- Add cultural presets to Virtuoso — dutor or rubob tunings (Uzbek maqom steps) or gayageum? Could be what sets Strandlight apart.
- Logo and icon: a code-drawn SVG, or the author's own idea?
- A custom domain later (e.g. strandlight.app)? Starting with vercel.app.
- Are the 4 exit-survey options right?
- Privacy policy and terms will be drafted; if the project grows, they should be reviewed by a professional.
