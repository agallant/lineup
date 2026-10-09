import type { Screen } from '../router';

export const homeScreen: Screen = (root) => {
  root.innerHTML = `
    <h1>Lineup</h1>
    <p>Rhythm games you play with a real instrument.</p>
    <ul class="menu">
      <li><a href="#/sing">Singline: voice</a></li>
      <li><a href="#/calibrate">Calibrate timing</a></li>
      <li><a href="#/mic">Mic &amp; latency test</a></li>
      <li><a href="#/beat">Beatline: claps, taps and percussion</a></li>
      <li><span>Strumline: ukulele (coming)</span></li>
      <li><span>Windline: ocarina, recorder, whistle (later)</span></li>
    </ul>
  `;
};
