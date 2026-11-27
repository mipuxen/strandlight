import { describe, expect, it } from 'vitest';
import { fileName, pickMimeType } from '../src/core/record/recorder';
import { cc, noteOff, noteOn } from '../src/core/midi/midi';

describe('recorder helpers', () => {
  it('prefers MP4 and falls back to WebM', () => {
    expect(pickMimeType(() => true).ext).toBe('mp4');
    expect(pickMimeType((t) => t.startsWith('video/webm')).ext).toBe('webm');
  });

  it('names files strandlight-YYYYMMDD-HHMM', () => {
    expect(fileName(new Date(2026, 10, 27, 9, 5), 'mp4')).toBe('strandlight-20261127-0905.mp4');
  });
});

describe('MIDI messages', () => {
  it('builds note on/off and CC bytes', () => {
    expect(noteOn(1, 60, 1)).toEqual([0x91, 60, 127]);
    expect(noteOff(2, 48)).toEqual([0x82, 48, 0]);
    expect(cc(0, 1, 0.5)).toEqual([0xb0, 1, 64]);
  });
});

import { externalBrowserUrl, inAppBrowser } from '../src/core/platform';

describe('in-app browsers', () => {
  const kakao =
    'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 KAKAOTALK 10.9.0';
  it('detects KakaoTalk and opens the page in the system browser', () => {
    expect(inAppBrowser(kakao)).toBe('kakaotalk');
    expect(externalBrowserUrl('https://mipuxen.github.io/strandlight/', 'kakaotalk')).toBe(
      'kakaotalk://web/openExternal?url=https%3A%2F%2Fmipuxen.github.io%2Fstrandlight%2F',
    );
  });

  it('uses a Chrome intent for other Android in-app browsers', () => {
    expect(externalBrowserUrl('https://mipuxen.github.io/strandlight/', 'instagram', true)).toBe(
      'intent://mipuxen.github.io/strandlight/#Intent;scheme=https;package=com.android.chrome;end',
    );
  });

  it('ignores normal browsers', () => {
    expect(
      inAppBrowser(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      ),
    ).toBeNull();
  });
});
