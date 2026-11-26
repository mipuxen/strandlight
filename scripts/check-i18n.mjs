// Fails CI if any tier-1 locale (EN, UZ, KO, RU) is missing a key or has an extra one.
// Tier-2 locales may be partial: missing keys fall back to English at runtime.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/i18n/locales');
const load = (code) => JSON.parse(readFileSync(join(dir, `${code}.json`), 'utf8'));
const en = load('en');
const enKeys = Object.keys(en);
const tier1 = ['uz', 'ko', 'ru'];
let failed = false;

for (const file of readdirSync(dir)) {
  const code = file.replace('.json', '');
  if (code === 'en') continue;
  const msgs = load(code);
  const missing = enKeys.filter((k) => !(k in msgs));
  const extra = Object.keys(msgs).filter((k) => !(k in en));
  const placeholders = enKeys.filter((k) => {
    if (!(k in msgs)) return false;
    const vars = (s) =>
      [...s.matchAll(/\{(\w+)[,}]/g)]
        .map((m) => m[1])
        .sort()
        .join();
    return vars(en[k]) !== vars(msgs[k]);
  });
  if (extra.length || placeholders.length || (tier1.includes(code) && missing.length))
    failed = true;
  const pct = Math.round(((enKeys.length - missing.length) / enKeys.length) * 100);
  console.log(
    `${code}: ${pct}%` +
      (missing.length && tier1.includes(code) ? ` missing ${missing.join(', ')}` : ''),
  );
  if (extra.length) console.log(`  extra keys: ${extra.join(', ')}`);
  if (placeholders.length) console.log(`  placeholder mismatch: ${placeholders.join(', ')}`);
}

if (failed) process.exit(1);
