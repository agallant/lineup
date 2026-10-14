import { describe, expect, it } from 'vitest';
import { GUIDES, detectPlatform, type Platform } from './install';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0.0.0 Mobile/15E148 Safari/604.1',
  ipadSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:118.0) Gecko/118.0 Firefox/118.0',
  chromeDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 Edg/118.0.2088.46',
  firefoxDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:118.0) Gecko/20100101 Firefox/118.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
};

describe('detectPlatform', () => {
  it.each([
    ['iphoneSafari', 0, 'ios-safari'],
    ['iphoneChrome', 0, 'ios-other'],
    ['ipadSafari', 5, 'ios-safari'], // an iPad calls itself a Mac but has a touch screen
    ['androidChrome', 5, 'android-chrome'],
    ['samsung', 5, 'android-other'],
    ['androidFirefox', 5, 'android-other'],
    ['chromeDesktop', 0, 'desktop-chromium'],
    ['edge', 0, 'desktop-chromium'],
    ['firefoxDesktop', 0, 'desktop-firefox'],
    ['safariMac', 0, 'desktop-safari'],
  ] as [keyof typeof UA, number, Platform][])('%s is %s', (name, touch, want) => {
    expect(detectPlatform(UA[name], touch)).toBe(want);
  });

  it('falls back for anything else', () => {
    expect(detectPlatform('SomethingElse/1.0')).toBe('other');
    expect(detectPlatform('')).toBe('other');
  });
});

describe('the guides', () => {
  it('has steps for every platform', () => {
    for (const [id, g] of Object.entries(GUIDES)) {
      expect(g.label, id).not.toBe('');
      expect(g.steps.length, id).toBeGreaterThanOrEqual(2);
    }
  });
  it('tells iPhone and iPad users about the Share button and Add to Home Screen', () => {
    expect(GUIDES['ios-safari'].steps.join(' ')).toMatch(/Share/);
    expect(GUIDES['ios-safari'].steps.join(' ')).toMatch(/Add to Home Screen/);
  });
});
