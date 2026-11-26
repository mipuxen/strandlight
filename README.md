<div align="center">

# Strandlight

**Draw strings of light in the air with your hands. Then play them.**

A browser instrument powered by webcam hand tracking. Nothing to install, and your camera never leaves your device.

[**▶ Play the live demo**](https://mipuxen.github.io/strandlight/) · [How it works](docs/ARCHITECTURE.md) · [Privacy](docs/PRIVACY.md) · [Spec](docs/SPEC.md)

English · [O'zbekcha](README.uz.md) · [한국어](README.ko.md) · [Русский](README.ru.md)

[![CI](https://github.com/mipuxen/strandlight/actions/workflows/ci.yml/badge.svg)](https://github.com/mipuxen/strandlight/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-ff4fd8.svg)](LICENSE)

</div>

---

## What it is

Most "air harps" give you strings that are already there. In Strandlight **you build the instrument yourself**: pinch your thumb and index finger, pull, and let go — a glowing string stays exactly where you left it. Its **length decides its voice**: short strings ring like glass, medium ones like a harp, long ones like a bass. Then sweep a finger across them to play.

| Gesture                           | What happens                                                      |
| --------------------------------- | ----------------------------------------------------------------- |
| Pinch → pull → release            | A new string freezes in the air                                   |
| Index finger crosses a string     | It plays. Faster is louder                                        |
| Quick flick                       | Sparks race along the nearest string                              |
| Pinch the end of a string         | Move or stretch it, with smooth pitch bend _(Musician, Virtuoso)_ |
| V sign (index + middle), hold ½ s | Everything goes quiet                                             |
| Open palm for 1 s                 | Sustain and reverb bloom _(Musician, Virtuoso)_                   |
| Both hands in view                | Five living threads between your fingertips play a pad chord      |

No camera? Touch and mouse work too: **press and hold, then drag** to draw; **swipe** to play.

**Keys:** `Z` undo · `Shift+Z` redo · `C` clear · `V` camera background · `Space` looper · `H` help

## Features

- **Three modes.** _Beginner_ (C minor pentatonic — no wrong notes), _Musician_ (12 scales incl. Dorian, Blues and Hijaz, 3 octaves, looper, pitch bend, sustain), _Virtuoso_ (chromatic or free tuning, velocity, A4 = 432–446 Hz, "real harp" preset, MIDI and OSC).
- **Sound synthesized in code**, no sample files: 2-operator FM (Crystal), Karplus-Strong in an `AudioWorklet` (Harp), Karplus-Strong + sub sine (Bass), procedural convolution reverb, ping-pong delay and a limiter.
- **Looper** with 4 layers, quantized to the tempo. Performances are stored as events, not audio. **Metronome** 40–200 BPM with tap tempo.
- **Scenes** save to the device, to a JSON file, or into a shareable `#scene=` link (compressed, no server).
- **Recording** of the scene, the camera or the whole screen as MP4 (or WebM), straight to your downloads. Audio comes directly from the instrument, so no microphone is needed.
- **Web MIDI** out (one channel per timbre, string tension on CC 1) and **OSC** through the tiny [`strandlight-bridge`](packages/bridge) for TouchDesigner, Max and Ableton.
- **Three themes:** Neon Cosmos, Golden Harp, White Silk. WebGL2 bloom with a Canvas 2D fallback for light mode.
- **12 languages**, picked from your browser settings. English, O'zbekcha, 한국어 and Русский are complete and reviewed; Español, 中文, 日本語, Deutsch, Français, Português, Türkçe and العربية (with RTL) cover the main screens and grow with community help.
- **Interactive guide with a life-size ghost hand** in 6 steps (show, pinch, pull, release, pluck, flick), each with a tip if you get stuck. Afterwards it shrinks to a small "How to play" dock, and **H** opens illustrated help cards for every gesture, the length-to-sound map, keys and tips.

## Privacy by design

- Hand tracking ([MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)) runs **in a Web Worker on your device**. Camera frames and hand points are never sent anywhere.
- No cookies, no analytics, no accounts in this core version.
- The MediaPipe runtime and model are **self-hosted and checksum-verified** at build time ([`assets.lock.json`](assets.lock.json)); fonts are self-hosted too. The page talks to no CDN.
- A strict Content Security Policy allows scripts only from the site itself.

Details: [docs/PRIVACY.md](docs/PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Run it yourself

```bash
git clone https://github.com/mipuxen/strandlight.git
cd strandlight
npm install
npm run dev        # http://localhost:5173
```

`npm run dev` copies the MediaPipe runtime out of `node_modules` and downloads the hand model once, verifying both against `assets.lock.json`. Other scripts: `npm test`, `npm run lint`, `npm run build`.

## How it was built

Strandlight is designed and directed by **Khoshimov Shukhratbek**, built with **[Claude](https://claude.ai) (Anthropic) as an AI pair-programmer**.

This was agentic software engineering, and the human side of it was the engineering:

1. **Spec first.** Before any code, we wrote a complete specification in Uzbek: concept, gestures, sound design, modes, themes, i18n, privacy, security, deployment and a staged roadmap. Every open question (stack, timbres, gesture set, login model, data retention) was decided explicitly. The English version lives in [docs/SPEC.md](docs/SPEC.md).
2. **Decisions with reasons.** Framework-free Vite + TypeScript to keep the bundle under 200 KB; tracking in a Web Worker so audio and rendering never stutter; sound synthesized instead of sampled so the repo is light and license-clean; a serverless core so anyone can run it from GitHub.
3. **Review at every stage.** Each part was read, questioned and approved before moving on, with a short "what and why" note so the reasoning can be explained line by line.
4. **Security as a requirement, not an afterthought.** Self-hosted, hash-pinned assets; CSP; `textContent`-only rendering enforced by a lint rule; validation of every scene file and link; a localhost-only, origin-checked OSC bridge; CodeQL, Dependabot and actions pinned by commit SHA.
5. **Verified, not assumed.** Unit tests cover the One Euro filter, pinch hysteresis, note mapping, the looper, scene encoding and i18n; the build runs in a headless browser smoke test; CI blocks merges on lint, tests, translations and the bundle budget.

## Roadmap

| Stage                                                                                                                                                                      | Status                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1 · Core instrument (this repo, GitHub Pages)                                                                                                                              | ✅ Shipped                                     |
| 2 · Demo video recorded with Strandlight's own recorder                                                                                                                    | Next                                           |
| 3 · Optional cloud layer on Vercel + Supabase: Google sign-in, email a recording (7-day link), showcase gallery with moderation, anonymous analytics, admin panel with 2FA | Planned — enabled only after a security review |
| 4 · Cultural presets (dutor, rubob, gayageum tunings)                                                                                                                      | Under discussion                               |

The core never imports the cloud layer; it stays fully usable without any server.

## Contributing

Translations, new scales and bug reports are very welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, please follow [SECURITY.md](SECURITY.md).

## Author

<table>
  <tr>
    <td><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/seal-dark.svg" /><img src="docs/assets/seal-light.svg" width="140" alt="Seal of Khoshimov Shukhratbek" /></picture></td>
    <td>
      <b>Khoshimov Shukhratbek</b> "Bruce"<br />
      AI Agentic Software Engineer<br />
      Concept, spec, product direction, review and release of Strandlight<br />
      <a href="https://github.com/mipuxen">github.com/mipuxen</a>
    </td>
  </tr>
</table>

## License

[MIT](LICENSE) © 2026 Khoshimov Shukhratbek. MediaPipe is © Google, Apache 2.0.
