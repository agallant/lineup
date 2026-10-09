import type { Screen } from '../router';

export const homeScreen: Screen = (root) => {
  root.innerHTML = `
    <h1>Lineup</h1>
    <p>Rhythm games you play with a real instrument.</p>
    <ul class="menu">
      <li><a href="#/mic">Mic &amp; latency test</a></li>
      <li><span>Strumline: ukulele (coming)</span></li>
      <li><span>Singline: voice (coming)</span></li>
      <li><span>Windline: ocarina, recorder, whistle (later)</span></li>
      <li><span>Beatline: claps, taps and percussion (coming)</span></li>
    </ul>
  `;
};
