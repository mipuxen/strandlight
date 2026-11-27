/** Small, dependency-free platform checks. Only used to pick safe defaults. */
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;

export const isAndroid = /Android/i.test(ua);
export const isIOS =
  /iPhone|iPad|iPod/i.test(ua) ||
  (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);

export type InAppBrowser = 'kakaotalk' | 'instagram' | 'facebook' | 'line' | 'naver' | 'webview';

/** Detects in-app browsers (KakaoTalk, Instagram…) where camera and GPU support are limited. */
export function inAppBrowser(userAgent = ua): InAppBrowser | null {
  if (/KAKAOTALK/i.test(userAgent)) return 'kakaotalk';
  if (/Instagram/i.test(userAgent)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(userAgent)) return 'facebook';
  if (/\bLine\//i.test(userAgent)) return 'line';
  if (/NAVER\(inapp/i.test(userAgent)) return 'naver';
  if (/Android/i.test(userAgent) && /; wv\)/i.test(userAgent)) return 'webview';
  return null;
}

/**
 * Returns a URL that reopens this page in the system browser, or null when the platform
 * offers no way to do it (then the user copies the link instead).
 */
export function externalBrowserUrl(
  href: string,
  app: InAppBrowser | null,
  android = isAndroid,
): string | null {
  if (app === 'kakaotalk') return `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;
  if (android && app) {
    const u = new URL(href);
    return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;end`;
  }
  return null;
}
