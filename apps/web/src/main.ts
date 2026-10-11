import './style.css';
import { INPUT_WORKLET_URL } from '@lineup/input/mic';
import { buildInfoText } from './app/build-info';
import { applyTextSize, applyTheme } from './app/appearance';
import { earScreen } from './app/screens/ear';
import { startRouter } from './app/router';
import { SettingsStore, safeLocalStorage } from './app/settings';
import { beatScreen } from './app/screens/beat';
import { calibrateScreen } from './app/screens/calibrate';
import { helpScreen } from './app/screens/help';
import { homeScreen } from './app/screens/home';
import { learnScreen } from './app/screens/learn';
import { makerScreen } from './app/screens/maker';
import { micTestScreen } from './app/screens/mic-test';
import { optionsScreen } from './app/screens/options';
import { scoreboardScreen } from './app/screens/scoreboard';
import { singScreen } from './app/screens/sing';
import { strumScreen } from './app/screens/strum';
import { tunerScreen } from './app/screens/tuner';
import { windScreen } from './app/screens/wind';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

{
  const appearance = new SettingsStore(safeLocalStorage()).get();
  applyTextSize(appearance.textSize);
  applyTheme(appearance.theme);
}

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
    scores: scoreboardScreen,
    tuner: tunerScreen,
    ear: earScreen,
    make: makerScreen,
    learn: learnScreen,
    help: helpScreen,
    options: optionsScreen,
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
