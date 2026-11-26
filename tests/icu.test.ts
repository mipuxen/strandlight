import { describe, expect, it } from 'vitest';
import { format } from '../src/i18n/icu';
import { detectLocale } from '../src/i18n/i18n';

describe('ICU format', () => {
  it('interpolates and pluralizes', () => {
    const msg = '{count, plural, one {# string} other {# strings}}';
    expect(format(msg, { count: 1 }, 'en')).toBe('1 string');
    expect(format(msg, { count: 5 }, 'en')).toBe('5 strings');
    expect(format('Layer {n}', { n: 2 }, 'en')).toBe('Layer 2');
  });

  it('uses Russian plural categories', () => {
    const msg = '{count, plural, one {# струна} few {# струны} many {# струн} other {# струны}}';
    expect(format(msg, { count: 2 }, 'ru')).toBe('2 струны');
    expect(format(msg, { count: 5 }, 'ru')).toBe('5 струн');
  });
});

describe('detectLocale', () => {
  it('prefers a stored choice, then browser languages, then English', () => {
    expect(detectLocale(['ko-KR', 'en'], null)).toBe('ko');
    expect(detectLocale(['ko-KR'], 'uz')).toBe('uz');
    expect(detectLocale(['xx-YY'], null)).toBe('en');
  });
});
