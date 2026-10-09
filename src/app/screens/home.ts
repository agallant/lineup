import type { Screen } from '../router';

export const homeScreen: Screen = (root) => {
  root.innerHTML = `
    <h1>Strumline</h1>
    <p>A rhythm game you play with a real ukulele (GCEA).</p>
    <ul class="menu">
      <li><a href="#/mic">Mic &amp; latency test</a></li>
      <li><span>Calibration (coming in M2)</span></li>
      <li><span>Play (coming in M3)</span></li>
    </ul>
  `;
};
