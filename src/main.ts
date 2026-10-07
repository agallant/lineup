import './style.css';
import { buildInfoText } from './app/build-info';
import { startRouter } from './app/router';
import { homeScreen } from './app/screens/home';
import { micTestScreen } from './app/screens/mic-test';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

const footer = document.getElementById('build-info');
if (footer) footer.textContent = buildInfoText();

startRouter(app, { '': homeScreen, mic: micTestScreen }, '');

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err: unknown) => {
    console.warn('Service worker registration failed', err);
  });
}
