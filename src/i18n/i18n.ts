import en from './locales/en.json';
import { format, type Params } from './icu';

export type MessageKey = keyof typeof en;
type Messages = Partial<Record<MessageKey, string>>;

export interface LocaleInfo {
  code: string;
  name: string;
  tier: 1 | 2;
  rtl?: boolean;
}

/** Tier 1 is reviewed by hand. Tier 2 is translated and improved by the community. */
export const LOCALES: LocaleInfo[] = [
  { code: 'en', name: 'English', tier: 1 },
  { code: 'uz', name: "O'zbekcha", tier: 1 },
  { code: 'ko', name: '한국어', tier: 1 },
  { code: 'ru', name: 'Русский', tier: 1 },
  { code: 'vi', name: 'Tiếng Việt', tier: 2 },
  { code: 'es', name: 'Español', tier: 2 },
  { code: 'zh', name: '中文 (简体)', tier: 2 },
  { code: 'ja', name: '日本語', tier: 2 },
  { code: 'de', name: 'Deutsch', tier: 2 },
  { code: 'fr', name: 'Français', tier: 2 },
  { code: 'pt', name: 'Português', tier: 2 },
  { code: 'tr', name: 'Türkçe', tier: 2 },
  { code: 'ar', name: 'العربية', tier: 2, rtl: true },
];

const loaders = import.meta.glob<{ default: Messages }>('./locales/*.json');
const STORAGE_KEY = 'strandlight.lang';

let current = 'en';
let messages: Messages = en;
const listeners = new Set<() => void>();

/** Picks a language from navigator.languages only. No IP or location is used. */
export function detectLocale(preferred: readonly string[], stored: string | null): string {
  const supported = new Set(LOCALES.map((l) => l.code));
  if (stored && supported.has(stored)) return stored;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0] ?? '';
    if (supported.has(base)) return base;
  }
  return 'en';
}

export async function setLocale(code: string, persist = true): Promise<void> {
  const loader = loaders[`./locales/${code}.json`];
  messages = code === 'en' || !loader ? en : (await loader()).default;
  current = loader || code === 'en' ? code : 'en';
  const info = LOCALES.find((l) => l.code === current);
  document.documentElement.lang = current;
  document.documentElement.dir = info?.rtl ? 'rtl' : 'ltr';
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, current);
    } catch {
      /* storage unavailable (private mode): language still applies for this visit */
    }
  }
  listeners.forEach((l) => l());
}

export async function initLocale(): Promise<void> {
  let stored: string | null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  await setLocale(detectLocale(navigator.languages ?? [navigator.language], stored), false);
}

export const locale = (): string => current;

/** Translate. Falls back to English for any missing key. */
export function t(key: MessageKey, params: Params = {}): string {
  return format(messages[key] ?? en[key], params, current);
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
