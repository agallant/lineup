import { ACHIEVEMENTS, ProgressStore, levelFor } from '../progress';
import { safeLocalStorage } from '../settings';
import type { Screen } from '../router';

/** What each game is, for the home menu: the route, the instrument and a line about it. */
const CARDS = [
  {
    id: 'singline',
    href: '#/sing',
    name: 'Singline',
    who: 'Voice',
    blurb: 'Sing the notes as they scroll toward you. Songs, scales and random melodies.',
  },
  {
    id: 'windline',
    href: '#/wind',
    name: 'Windline',
    who: 'Whistle, recorder, other winds',
    blurb: 'Play along in your instrument’s key, with a fingering chart.',
  },
  {
    id: 'strumline',
    href: '#/strum',
    name: 'Strumline',
    who: 'Ukulele',
    blurb: 'Strum chord songs or pick melodies, with the fret to hold on each string.',
  },
  {
    id: 'beatline',
    href: '#/beat',
    name: 'Beatline',
    who: 'Claps, taps, hand drums, kit',
    blurb: 'Hit the rhythm on the beat: grooves, rudiments and random patterns.',
  },
] as const;

/** The home menu: the four games, then progress, then set-up tools and options. */
export const homeScreen: Screen = (root) => {
  const store = new ProgressStore(safeLocalStorage());
  const state = store.get();
  const lvl = levelFor(state.xp);
  const streak = store.streak();
  const trophies = Object.keys(state.achievements).length;
  root.innerHTML = `
    <h1>Lineup</h1>
    <p>Rhythm games you play with a real instrument. Everything stays on this device.</p>

    <a class="card level" href="#/scores" data-id="level-card">
      <span class="level-name">Level ${lvl.level} · ${lvl.title}</span>
      <span class="bar" role="img" aria-label="${lvl.into} of ${lvl.span} XP to the next level"><span style="width:${Math.round((lvl.into / lvl.span) * 100)}%"></span></span>
      <span class="muted">${state.xp.toLocaleString('en-US')} XP · ${
        streak > 0 ? `${streak}-day streak` : 'no streak yet: play today to start one'
      } · ${trophies} of ${ACHIEVEMENTS.length} trophies</span>
    </a>

    <h2>Play</h2>
    <ul class="menu games" data-id="games">
      ${CARDS.map((c) => {
        const plays = state.perGame[c.id] ?? 0;
        return `<li><a class="card" href="${c.href}" data-game="${c.id}">
          <strong>${c.name}</strong> <span class="muted">${c.who}</span>
          <span>${c.blurb}</span>
          <span class="muted">${plays > 0 ? `${plays} ${plays === 1 ? 'song' : 'songs'} played` : 'Not played yet'}</span>
        </a></li>`;
      }).join('')}
    </ul>

    <h2>Progress</h2>
    <ul class="menu">
      <li><a class="card" href="#/scores" data-id="scores-link"><strong>Scoreboard &amp; trophies</strong>
        <span>Your best score on every song, stars, and the trophies you have earned.</span></a></li>
    </ul>

    <h2>Set up <small>once per device or instrument</small></h2>
    <ul class="menu">
      <li><a class="card" href="#/calibrate" data-id="calibrate-link"><strong>Calibrate timing</strong>
        <span>Tap along to a beat so the game knows how late your speaker and microphone are.</span></a></li>
      <li><a class="card" href="#/mic" data-id="mic-link"><strong>Mic &amp; latency test</strong>
        <span>Check that the microphone hears you and see how long the audio takes. Not a game.</span></a></li>
    </ul>

    <h2>More</h2>
    <ul class="menu">
      <li><a class="card" href="#/options" data-id="options-link"><strong>Options</strong>
        <span>Sound, scoring, your data and backups.</span></a></li>
    </ul>
  `;
  return undefined;
};
