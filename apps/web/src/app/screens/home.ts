import { DAILY_GAMES, dailyFor, dailyKey } from '../daily';
import { ACHIEVEMENTS, DAILY_BONUS, ProgressStore, levelFor, weekMinutes } from '../progress';
import { SettingsStore, safeLocalStorage } from '../settings';
import type { Screen } from '../router';
import { ScoreStore } from '../scores';
import { suggestNext } from '../scoreboard';
import { stepHref } from '../courses';
import { THEMES, WEEKLY_BONUS } from '../themes';
import { escapeHtml } from '../audio';
import { getSong } from '@lineup/core';

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
    who: 'Whistle, recorder, flutes, other winds',
    blurb:
      'Play along in your instrument’s key, with a fingering chart. Native American flute and shakuhachi too.',
  },
  {
    id: 'strumline',
    href: '#/strum',
    name: 'Strumline',
    who: 'Ukulele',
    blurb: 'Strum chord songs or pick melodies, with the fret to hold on each string.',
  },
  {
    id: 'bassline',
    href: '#/bass',
    name: 'Bassline',
    who: 'Bass guitar',
    blurb: 'Learn bass lines: blues, pop and rock, with the string and fret for every note.',
  },
  {
    id: 'beatline',
    href: '#/beat',
    name: 'Beatline',
    who: 'Claps, taps, hand drums, kit',
    blurb: 'Hit the rhythm on the beat: grooves, rudiments and random patterns.',
  },
  {
    id: 'ear',
    href: '#/ear',
    name: 'Ear training',
    who: 'No instrument needed',
    blurb: 'Hear two notes or a chord and name them. Intervals and chord types, ten at a time.',
  },
] as const;

/** The home menu: the four games, then progress, then set-up tools and options. */
export const homeScreen: Screen = (root) => {
  const now = new Date();
  const store = new ProgressStore(safeLocalStorage());
  const state = store.get();
  const lvl = levelFor(state.xp);
  const streak = store.streak(now);
  const prefs = new SettingsStore(safeLocalStorage()).get();
  const goal = prefs.goalMinutes;
  const minutes = weekMinutes(state.log, now);
  const trophies = Object.keys(state.achievements).length;
  const week = store.weekProgress(now);
  const theme = THEMES.find((t) => t.id === week.themeId)!;
  const next = suggestNext(new ScoreStore(safeLocalStorage()).entries());
  root.innerHTML = `
    <h1>Lineup</h1>
    <p>Rhythm games you play with a real instrument. Everything stays on this device.</p>

    ${
      prefs.seenHelp
        ? ''
        : `<a class="card" href="#/help" data-id="new-here"><strong>New here?</strong>
      <span class="muted">A one-minute guide to the games, scoring and what stays private.</span></a>`
    }

    <a class="card level" href="#/scores" data-id="level-card">
      <span class="level-name">Level ${lvl.level} · ${lvl.title}</span>
      <span class="bar" role="img" aria-label="${lvl.into} of ${lvl.span} XP to the next level"><span style="width:${Math.round((lvl.into / lvl.span) * 100)}%"></span></span>
      <span class="muted">${state.xp.toLocaleString('en-US')} XP · ${
        streak > 0 ? `${streak}-day streak` : 'no streak yet: play today to start one'
      }${state.freezes > 0 ? ` · ❄ ${state.freezes}` : ''} · ${trophies} of ${ACHIEVEMENTS.length} trophies</span>
    </a>

    <section class="week-card" data-id="week" aria-label="Practice this week">
      <p class="muted">${
        goal > 0
          ? `This week: ${minutes} of ${goal} minutes${minutes >= goal ? ' ✓ goal reached' : ''}`
          : `This week: ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} of practice`
      }</p>
      ${
        goal > 0
          ? `<span class="bar" role="img" aria-label="${Math.min(minutes, goal)} of ${goal} minutes"><span style="width:${Math.min(100, Math.round((minutes / goal) * 100))}%"></span></span>`
          : ''
      }
    </section>

    ${
      next
        ? `<a class="card" href="${stepHref(next.course, next.step)}" data-id="suggested">
      <strong>Up next: ${escapeHtml(getSong(next.step.songId).meta.title)}</strong>
      <span class="muted">${escapeHtml(next.course.title)} · ${escapeHtml(next.step.focus)}</span></a>`
        : ''
    }

    <a class="card theme-card ${week.done ? 'done' : ''}" href="${theme.href}" data-id="theme" data-theme="${theme.id}">
      <strong>${week.done ? '✓ ' : ''}This week: ${theme.title}</strong>
      <span class="muted">${week.done ? `Finished! +${WEEKLY_BONUS} XP earned.` : theme.blurb}</span>
      <span class="bar" role="img" aria-label="${Math.min(week.plays, theme.goal)} of ${theme.goal} songs"><span style="width:${Math.round((Math.min(week.plays, theme.goal) / theme.goal) * 100)}%"></span></span>
      <span class="muted">${Math.min(week.plays, theme.goal)} of ${theme.goal}${week.done ? '' : ` · +${WEEKLY_BONUS} XP when done`}</span>
    </a>

    <h2>Today’s challenge <small>a new song each day, the same for everyone</small></h2>
    <ul class="menu daily" data-id="daily">
      ${DAILY_GAMES.map((g) => {
        const d = dailyFor(g, now);
        const done = state.dailies.includes(dailyKey(g, now));
        return `<li><a class="card ${done ? 'done' : ''}" href="${d.href}" data-daily="${g}">
          <strong>${done ? '✓ ' : ''}${d.label}</strong>
          <span class="muted">${done ? 'Cleared today.' : `Reach 60% for +${DAILY_BONUS} XP.`}</span>
        </a></li>`;
      }).join('')}
    </ul>

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
      <li><a class="card" href="#/learn" data-id="learn-link"><strong>Learn</strong>
        <span>Step-by-step paths for each instrument: open the next song by earning stars.</span></a></li>
      <li><a class="card" href="#/packs" data-id="packs-link"><strong>Song packs</strong>
        <span>Themed sets of songs: campfire, lullabies, waltzes, rhythms, pentatonic calm and more.</span></a></li>
      <li><a class="card" href="#/collection" data-id="collection-link"><strong>Collection</strong>
        <span>Songs cleared with three stars, with a bronze, silver or gold medal for each group.</span></a></li>
      <li><a class="card" href="#/scores" data-id="scores-link"><strong>Scoreboard &amp; trophies</strong>
        <span>Your best score on every song, stars, and the trophies you have earned.</span></a></li>
    </ul>

    <h2>Make</h2>
    <ul class="menu">
      <li><a class="card" href="#/make" data-id="make-link"><strong>My songs</strong>
        <span>Write your own melody, chord song or rhythm as text; it appears in the song menus.</span></a></li>
      <li><a class="card" href="#/free" data-id="free-link"><strong>Free play</strong>
        <span>A metronome and a take recorded and played back on this device. No song, no score.</span></a></li>
    </ul>

    <h2>Set up <small>once per device or instrument</small></h2>
    <ul class="menu">
      <li><a class="card" href="#/tuner" data-id="tuner-link"><strong>Tuner</strong>
        <span>Tune your ukulele (or check any note) before you play. Not a game.</span></a></li>
      <li><a class="card" href="#/calibrate" data-id="calibrate-link"><strong>Calibrate timing</strong>
        <span>Tap along to a beat so the game knows how late your speaker and microphone are.</span></a></li>
      <li><a class="card" href="#/mic" data-id="mic-link"><strong>Mic &amp; latency test</strong>
        <span>Check that the microphone hears you and see how long the audio takes. Not a game.</span></a></li>
    </ul>

    <h2>More</h2>
    <ul class="menu">
      <li><a class="card" href="#/help" data-id="help-link"><strong>How to play</strong>
        <span>What each game is, how scoring and progress work, and what stays private.</span></a></li>
      <li><a class="card" href="#/options" data-id="options-link"><strong>Options</strong>
        <span>Sound, scoring, your data and backups.</span></a></li>
    </ul>
  `;
  return undefined;
};
