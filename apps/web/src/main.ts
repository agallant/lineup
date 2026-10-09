import './style.css';
import { buildInfoText } from './app/build-info';
import { startRouter } from './app/router';
import { beatScreen } from './app/screens/beat';
import { calibrateScreen } from './app/screens/calibrate';
import { homeScreen } from './app/screens/home';
import { micTestScreen } from './app/screens/mic-test';
import { singScreen } from './app/screens/sing';
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
  },
  '',
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err: unknown) => {
    console.warn('Service worker registration failed', err);
  });
}
