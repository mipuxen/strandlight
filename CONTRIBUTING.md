# Contributing to Strandlight

Thank you for helping! Translations, scales, bug reports and ideas are all welcome.

## Getting started

```bash
npm install
npm run dev     # local dev server
npm test        # unit tests
npm run lint    # ESLint
npm run build   # type-check + production build
```

Code, comments and commit messages are in English.

## Adding or improving a language

1. Copy `src/i18n/locales/en.json` to `src/i18n/locales/<code>.json` (for example `it.json`).
2. Translate the values. Keep `{placeholders}` and the ICU `plural` structure exactly as they are.
3. Add the language to `LOCALES` in `src/i18n/i18n.ts`.
4. Run `npm run i18n:check`.

Tier-2 languages may be partial: any missing key falls back to English. Tier-1 languages (English, Uzbek, Korean, Russian) must stay complete; CI checks this.

## Adding a scale

Add it to `SCALES` in `src/core/music/scales.ts`, add `scale.<id>` to the locale files, and include it in `MUSICIAN_SCALES` if Musician mode should offer it.

## Rules that keep users safe

- Camera frames and hand points never leave the device.
- Never use `innerHTML`; build DOM with the `el()` helper (`src/ui/dom.ts`).
- No new network requests or third-party scripts in the core.
- Validate anything that comes from a file, a URL or another process.

## Pull requests

Keep PRs focused, describe **what** changed and **why**, and make sure CI is green. AI-assisted contributions are welcome — please say so in the PR and review the code yourself before submitting.
