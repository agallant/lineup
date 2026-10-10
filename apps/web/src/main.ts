import './style.css';
import { INPUT_WORKLET_URL } from '@lineup/input/mic';
import { buildInfoText } from './app/build-info';
import { startRouter } from './app/router';
import { beatScreen } from './app/screens/beat';
import { calibrateScreen } from './app/screens/calibrate';
import { homeScreen } from './app/screens/home';
import { micTestScreen } from './app/screens/mic-test';
import { singScreen } from './app/screens/sing';
import { strumScreen } from './app/screens/strum';
import { windScreen } from './app/screens/wind';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

const footer = document.getElementById('build-info');
if (footer) footer.textContent = buildInfoText();

startRouter(
  app,
  {
    '': homeScreen,
    mic: micTestScreen,
    calibrate: calibrateScreen,
    sing: singScreen,
    wind: windScreen,
    beat: beatScreen,
    strum: strumScreen,
  },
  '',
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('./sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      // keep a copy of everything this page used, so the next visit works offline
      const loaded = performance.getEntriesByType('resource').map((e) => e.name);
      reg.active?.postMessage({
        type: 'precache',
        urls: [
          location.href.split('#')[0],
          new URL(INPUT_WORKLET_URL, location.href).href,
          ...loaded,
          './manifest.webmanifest',
          './icons/icon-192.png',
          './icons/icon-180.png',
          './icons/icon.svg',
        ],
      });
    })
    .catch((err: unknown) => {
      console.warn('Service worker registration failed', err);
    });
}
