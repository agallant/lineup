// End-to-end checks in a real browser engine (headless Chromium): the built app,
// real AudioWorklet, real AudioContext clock, real canvas and rAF loop. The
// microphone is replaced by Chromium's fake capture device playing generated WAVs,
// or by the app's own auto-play demo adapter.
//
// Runs in CI as its own job (Playwright is installed there with --no-save) and locally with
// `npm run e2e` after `npm run build`. Exits non-zero if anything fails.
//
//   node scripts/e2e.mjs [demo|wind-demo|flute|exercises|melody|random-hits|variation|target|home|tuner|listen|ear|free|tour|call|duet|a11y|maker|learn|strum-demo|strum-picking|strum-live|offline|calibrate|live|bleed|beat-demo|beat-live|beat-leak|all] [--shots <dir>]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';

async function loadPlaywright() {
  for (const spec of ['playwright', '/opt/node-tools/node_modules/playwright/index.mjs']) {
    try {
      return await import(spec);
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'Playwright not found. Install it (npm i -g playwright) or run in an environment that has it.',
  );
}

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const args = process.argv.slice(2);
const shotsIdx = args.indexOf('--shots');
const shotsDir = shotsIdx >= 0 ? args[shotsIdx + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const which = args.find((a) => !a.startsWith('--') && a !== shotsDir) ?? 'all';
const PORT = 4179;
const URL_BASE = `http://localhost:${PORT}/`;
const tmp = mkdtempSync(join(tmpdir(), 'lineup-e2e-'));
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

// ---- fixtures: tiny WAV writers (mono, 48 kHz, 16-bit) ----------------------
function wav(path, samples, sr = 48000) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2),
  );
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}
const SR = 48000;
/** A steady sung-ish tone: harmonics with a falling tilt plus a little vibrato. */
function sung(hz, seconds) {
  const out = new Float32Array(seconds * SR);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const f = hz * 2 ** ((20 * Math.sin((2 * Math.PI * 5.5 * i) / SR)) / 1200);
    phase += (2 * Math.PI * f) / SR;
    let s = 0;
    for (let k = 1; k <= 12; k++) s += Math.sin(k * phase) / k ** 1.3;
    out[i] = 0.3 * s;
  }
  return out;
}
function claps(seconds, phase) {
  const out = new Float32Array(seconds * SR);
  let seed = 4;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  for (let t = phase; t < seconds - 0.1; t += 0.5) {
    const s0 = Math.floor(t * SR);
    for (let i = 0; i < 0.06 * SR; i++)
      if (s0 + i < out.length) out[s0 + i] += rnd() * 0.6 * Math.exp(-i / (0.008 * SR));
  }
  return out;
}
/** A hand clap: a few ms of broadband noise bursts. */
function clapHit(rnd) {
  const out = new Float32Array(0.08 * SR);
  for (let b = 0; b < 3; b++) {
    const s0 = Math.floor(b * 0.009 * SR);
    for (let i = 0; i < 0.05 * SR; i++)
      if (s0 + i < out.length) out[s0 + i] += rnd() * 0.5 * Math.exp(-i / (0.007 * SR));
  }
  return out;
}
/** A finger tap on a table: a damped low thump. */
function tapHit() {
  const out = new Float32Array(0.08 * SR);
  for (let i = 0; i < out.length; i++)
    out[i] = 0.45 * Math.sin((2 * Math.PI * 260 * i) / SR) * Math.exp(-i / (0.009 * SR));
  return out;
}
/** Six claps (0.6 s apart), a 2.5 s gap, six taps, a 2.5 s gap, repeating: ~12.4 s per cycle. */
function clapTapLoop(cycles) {
  let seed = 9;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  const cycle = 12.4;
  const out = new Float32Array(Math.ceil(cycles * cycle * SR));
  const put = (hit, t) => hit.forEach((v, i) => (out[Math.floor(t * SR) + i] += v));
  for (let c = 0; c < cycles; c++) {
    for (let k = 0; k < 6; k++) put(clapHit(rnd), c * cycle + 0.5 + k * 0.6);
    for (let k = 0; k < 6; k++) put(tapHit(), c * cycle + 6.6 + k * 0.6);
  }
  return out;
}
/**
 * A ukulele strummed every 0.8 s: three strums each of C, Am, F, G in turn (~9.6 s per cycle).
 * Each string is a decaying harmonic series with a short noise pluck, started 7 ms after the last.
 */
function strumLoop(cycles) {
  const open = [67, 60, 64, 69]; // G C E A
  const chords = { C: [0, 0, 0, 3], Am: [2, 0, 0, 0], F: [2, 0, 1, 0], G: [0, 2, 3, 2] };
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  const out = new Float32Array(Math.ceil(cycles * 9.6 * SR) + SR);
  let t = 0.6;
  for (let c = 0; c < cycles; c++) {
    for (const name of ['C', 'Am', 'F', 'G']) {
      for (let k = 0; k < 3; k++, t += 0.8) {
        chords[name].forEach((fret, string) => {
          const hz = 440 * 2 ** ((open[string] + fret - 69) / 12);
          const s0 = Math.floor((t + string * 0.007) * SR);
          for (let i = 0; i < 0.9 * SR && s0 + i < out.length; i++) {
            const x = i / SR;
            let v = 0;
            for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * h * hz * x) / h ** 1.2;
            const pluck = i < 0.01 * SR ? rnd() * 0.6 * (1 - i / (0.01 * SR)) : 0;
            out[s0 + i] += 0.12 * v * Math.exp(-x / 0.5) + 0.2 * pluck;
          }
        });
      }
    }
  }
  return out;
}
const fixtures = {
  clapTap: join(tmp, 'clap-tap.wav'),
  sung: join(tmp, 'sung-c4.wav'),
  silence: join(tmp, 'silence.wav'),
  claps: join(tmp, 'claps.wav'),
  strums: join(tmp, 'strums.wav'),
};
wav(fixtures.sung, sung(261.626, 16));
wav(fixtures.silence, new Float32Array(10 * SR));
wav(fixtures.claps, claps(14, 0.3));
wav(fixtures.clapTap, clapTapLoop(6));
wav(fixtures.strums, strumLoop(4));

// ---- harness ----------------------------------------------------------------
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('../apps/web', import.meta.url).pathname,
  stdio: 'ignore',
});
const stopServer = () => server.kill();
process.on('exit', stopServer);

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(URL_BASE)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('preview server did not start (did you run `npm run build`?)');
}

const { chromium } = await loadPlaywright();

async function session(wavPath, run) {
  const flags = ['--autoplay-policy=no-user-gesture-required'];
  if (wavPath)
    flags.push(
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${wavPath}`,
    );
  // CHROMIUM_PATH wins; the sandbox's preinstalled build is used when present; otherwise Playwright's own.
  const executablePath =
    process.env.CHROMIUM_PATH || (existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: flags,
  });
  const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`));
  try {
    await run(page);
  } finally {
    check(
      problems.length === 0,
      `no console errors or failed requests${problems.length ? ': ' + problems.join(' | ') : ''}`,
    );
    await browser.close();
  }
}
const shot = (page, name) =>
  shotsDir ? page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true }) : null;
const text = async (page, id) => ((await page.textContent(`[data-id=${id}]`)) ?? '').trim();

/** Clicks "Copy session log" on the results screen and checks what landed on the clipboard. */
async function checkCopyLog(page, mode, perfectNotes) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('[data-id=copy-log]');
  await page.waitForFunction(
    () =>
      /Copied|Could not/.test(document.querySelector('[data-id=copy-status]')?.textContent ?? ''),
    null,
    { timeout: 5000 },
  );
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  check(
    copied.startsWith(`Lineup session log: ${mode} (auto-play demo)`) &&
      new RegExp(`perfect ${perfectNotes}\\b`).test(copied) &&
      /notes \(time/.test(copied),
    `${mode}: "Copy session log" puts a full report on the clipboard (${copied.split('\n').length} lines)`,
  );
}

// ---- scenarios --------------------------------------------------------------
const scenarios = {
  async demo() {
    console.log(
      '\n# Singline auto-play demo (synthetic singer -> real worklet -> clock -> judge -> canvas)',
    );
    await session(null, async (page) => {
      await page.goto(URL_BASE + '#/sing');
      await page.selectOption('[data-id=song]', 'singline-scale');
      await page.check('[data-id=opt-debug]');
      await page.click('[data-id=demo]');
      await page.waitForSelector('[data-id=stage]:visible', { timeout: 60000 });
      // notes are separated by short gaps, so wait until one is sounding rather than sampling at a fixed time
      const dbgHandle = await page.waitForFunction(
        () => {
          const value = document.querySelector('[data-id=debug]')?.textContent ?? '';
          return /VOICED/.test(value) ? value : false;
        },
        null,
        { timeout: 15000 },
      );
      const dbg = await dbgHandle.jsonValue();
      check(
        /VOICED/.test(dbg) && /frames\s+1[5-9]\d\/s/.test(dbg),
        `debug overlay shows live voiced frames (${dbg.split('\n').find((l) => l.startsWith('frames'))})`,
      );
      await shot(page, 'demo-play');
      await page.waitForSelector('[data-id=r-score]', { timeout: 40000 });
      const perfect = Number(await text(page, 'r-perfect'));
      const miss = Number(await text(page, 'r-miss'));
      check(
        perfect === 12 && miss === 0,
        `demo singer scores 12/12 perfect (got ${perfect} perfect, ${miss} missed, grade ${await text(page, 'grade')})`,
      );
      await shot(page, 'demo-results');
      await checkCopyLog(page, 'Singline', 12);
    });
  },

  async 'wind-demo'() {
    console.log(
      '\n# Windline auto-play demo (synthetic recorder -> real worklet -> clock -> judge -> canvas)',
    );
    await session(null, async (page) => {
      await page.goto(URL_BASE + '#/wind');
      await page.selectOption('[data-id=song]', 'wind-scale');
      // the default is a generic instrument in C whose key is the shift: +2 makes it a D whistle
      check(
        (await page.inputValue('[data-id=instrument]')) === 'generic',
        'the generic instrument is the default',
      );
      check(
        (await page.inputValue('[data-id=octave]')) === 'auto',
        'any octave is the default: the right note counts in whatever octave you play it',
      );
      await page.selectOption('[data-id=key]', '2');
      const generic = await page.$$eval('[data-id=chart] .fing-row', (r) => r.length);
      const chartText = await text(page, 'chart');
      check(
        generic === 0 && /No fingering chart/.test(chartText),
        `the generic instrument has no fingering chart (${chartText})`,
      );
      check(
        /D/.test(await page.$eval('[data-id=key] option:checked', (o) => o.textContent ?? '')),
        'the key menu names the key (Key of D)',
      );
      // a preset starts from its own key: the old shift does not carry over
      await page.selectOption('[data-id=instrument]', 'whistle-g');
      const shift = await page.inputValue('[data-id=key]');
      check(shift === '0', `choosing an instrument resets the shift to None (${shift})`);
      // a diatonic instrument in another key: the song moves into G and the chart follows
      const rows = await page.$$eval('[data-id=chart] .fing-row', (r) =>
        r.map((x) => x.textContent),
      );
      check(
        rows.length === 24 && /^G4/.test(rows[0] ?? ''),
        `the fingering chart lists a G whistle from G4, every semitone (${rows.length} notes, first "${rows[0]}")`,
      );
      const used = await page.$$eval('[data-id=chart] .fing-row.used', (r) => r.length);
      check(used === 6, `the notes of the song are highlighted in the chart (${used})`);
      const range = await text(page, 'range');
      check(!/⚠/.test(range), `the scale fits a G whistle (${range})`);
      await shot(page, 'wind-setup');
      await page.check('[data-id=opt-debug]');
      await page.click('[data-id=demo]');
      await page.waitForSelector('[data-id=stage]:visible', { timeout: 60000 });
      // notes are separated by short gaps, so wait until one is sounding rather than sampling at a fixed time
      const dbgHandle = await page.waitForFunction(
        () => {
          const value = document.querySelector('[data-id=debug]')?.textContent ?? '';
          return /VOICED/.test(value) ? value : false;
        },
        null,
        { timeout: 15000 },
      );
      const dbg = await dbgHandle.jsonValue();
      check(
        /VOICED/.test(dbg) && /frames\s+1[5-9]\d\/s/.test(dbg),
        `debug overlay shows live pitched frames (${dbg.split('\n').find((l) => l.startsWith('frames'))})`,
      );
      await page.waitForSelector('[data-id=fingering] .fing-now', { timeout: 20000 });
      const strip = await text(page, 'fingering');
      check(
        /[A-G]#?\d/.test(strip) && (await page.$$('[data-id=fingering] .hole')).length >= 6,
        `the play screen shows the fingering of the current note (${strip.replace(/\s+/g, ' ')})`,
      );
      await shot(page, 'wind-play');
      await page.waitForSelector('[data-id=r-score]', { timeout: 40000 });
      const perfect = Number(await text(page, 'r-perfect'));
      const miss = Number(await text(page, 'r-miss'));
      check(
        perfect === 12 && miss === 0,
        `demo recorder scores 12/12 perfect (got ${perfect} perfect, ${miss} missed, grade ${await text(page, 'grade')})`,
      );
      await shot(page, 'wind-results');
      await checkCopyLog(page, 'Windline', 12);
    });
  },

  async flute() {
    console.log(
      '\n# Pentatonic flutes: charts, flute songs, a random flute song, the drone, a demo run',
    );
    await session(null, async (page) => {
      // the drone is on, to check that playing with it works
      await page.addInitScript(() => {
        if (localStorage.getItem('lineup.seeded')) return;
        localStorage.setItem('lineup.seeded', '1');
        localStorage.setItem('lineup.settings.v1', JSON.stringify({ drone: 'fifth' }));
      });
      await page.goto(URL_BASE + '#/wind');
      const hasOption = (value) => page.$(`[data-id=song] option[value="${value}"]`).then(Boolean);
      check(
        !(await hasOption('flute-first-breath')),
        'flute songs are not offered to a generic instrument',
      );
      check(!(await hasOption('random-flute')), 'nor is the random flute song');
      // the instrument menu groups the pentatonic flutes
      const group = await page.$$eval('[data-id=instrument] optgroup option', (o) => o.length);
      check(
        group >= 8,
        `the instrument menu lists the pentatonic flutes under a heading (${group})`,
      );

      // a six-hole Native American flute: the holes open one at a time
      await page.selectOption('[data-id=instrument]', 'naf-a');
      check(
        await hasOption('flute-first-breath'),
        'flute songs appear for a Native American flute',
      );
      check(await hasOption('random-flute'), 'and so does the random flute song');
      const heading = await page.$$eval('[data-id=song] optgroup', (g) => g[0]?.label);
      check(
        heading === 'Pentatonic flute songs',
        `they come first, under their own heading (${heading})`,
      );
      await page.selectOption('[data-id=song]', 'flute-rain-on-the-mesa');
      const rows = await page.$$eval('[data-id=chart] .fing-row', (r) =>
        r.map((x) => x.textContent),
      );
      check(
        rows.length === 11 && /^A4/.test(rows[0] ?? ''),
        `the chart lists the flute from A4 (${rows.length} notes, first "${rows[0]}")`,
      );
      const holes = await page.$$eval(
        '[data-id=chart] .fing-row:first-child .hole',
        (h) => h.length,
      );
      const filled = await page.$$eval(
        '[data-id=chart] .fing-row:first-child .hole.on',
        (h) => h.length,
      );
      check(
        holes === 6 && filled === 6,
        `the root has all six holes covered (${filled} of ${holes})`,
      );
      const used = await page.$$eval('[data-id=chart] .fing-row.used', (r) => r.length);
      check(used === 6, `the notes of the song are highlighted (${used})`);
      check(
        !/⚠/.test(await text(page, 'range')),
        `the song fits the flute (${await text(page, 'range')})`,
      );

      // a shakuhachi: syllables instead of holes
      await page.selectOption('[data-id=instrument]', 'shaku-18');
      const names = await page.$$eval('[data-id=chart] .fing-name', (n) =>
        n.map((x) => x.textContent),
      );
      check(
        names.slice(0, 5).join(' ') === 'Ro Tsu Re Chi Ri',
        `a shakuhachi names its notes (${names.slice(0, 6).join(' ')})`,
      );
      check((await page.$$('[data-id=chart] .hole')).length === 0, 'and draws no holes');
      check(
        (await page.inputValue('[data-id=song]')) === 'flute-rain-on-the-mesa',
        'changing instrument keeps the song',
      );
      check(
        /D4 to D5/.test(await text(page, 'range')),
        `it moves into the shakuhachi's key (${await text(page, 'range')})`,
      );
      check(
        !/⚠/.test(await text(page, 'range')),
        `the song fits the shakuhachi (${await text(page, 'range')})`,
      );

      // the random flute song: two pentatonic scales, a seed, a new song
      await page.selectOption('[data-id=song]', 'random-flute');
      const scales = await page.$$eval('[data-id=challenge-scale] option', (o) =>
        o.map((x) => x.value),
      );
      check(
        scales.join() === 'minor-pentatonic,major-pentatonic',
        `the random flute song offers the two pentatonic scales (${scales.join()})`,
      );
      const before = await page.inputValue('[data-id=challenge-seed]');
      await page.click('[data-id=challenge-new]');
      const after = await page.inputValue('[data-id=challenge-seed]');
      check(before !== after, `New song picks another seed (${before} -> ${after})`);
      check(/Random flute song/.test(await text(page, 'song-info')), 'the song info names it');

      // a link to a flute song chooses a flute to play it on
      await page.goto(URL_BASE + '#/wind');
      await page.selectOption('[data-id=instrument]', 'whistle-d');
      check(!(await hasOption('flute-river-song')), 'a whistle does not offer the flute songs');
      await page.goto(URL_BASE + '#/wind?song=flute-river-song');
      await page.reload();
      check(
        (await page.inputValue('[data-id=instrument]')) === 'naf-a',
        `a link to a flute song picks the A minor flute (${await page.inputValue('[data-id=instrument]')})`,
      );
      check((await page.inputValue('[data-id=song]')) === 'flute-river-song', 'and the song');

      // a link can name a random flute song too
      await page.selectOption('[data-id=instrument]', 'whistle-d');
      await page.goto(URL_BASE + '#/wind?song=gen-flute-minor-pentatonic-easy-77');
      await page.reload();
      check(
        (await page.inputValue('[data-id=instrument]')) === 'naf-a' &&
          (await page.inputValue('[data-id=song]')) === 'gen-flute-minor-pentatonic-easy-77',
        `a link to a random flute song opens it on a flute (${await page.inputValue('[data-id=instrument]')}, ${await page.inputValue('[data-id=song]')})`,
      );

      // play one through (with the drone)
      await page.selectOption('[data-id=song]', 'flute-rain-on-the-mesa');
      const notes = Number(/(\d+) notes/.exec(await text(page, 'song-info'))?.[1]);
      await page.click('[data-id=demo]');
      await page.waitForSelector('[data-id=stage]:visible', { timeout: 60000 });
      await page.waitForSelector('[data-id=fingering] .fing-now', { timeout: 30000 });
      check(
        (await page.$$('[data-id=fingering] .hole')).length >= 6,
        'the play screen shows the holes for the current note',
      );
      await page.waitForSelector('[data-id=r-score]', { timeout: 60000 });
      const perfect = Number(await text(page, 'r-perfect'));
      const miss = Number(await text(page, 'r-miss'));
      check(
        notes > 20 && perfect === notes && miss === 0,
        `the demo flute player scores ${notes}/${notes} (got ${perfect} perfect, ${miss} missed)`,
      );
    });
  },

  async exercises() {
    console.log('\n# Exercises: grouped menus, and a scale exercise plays to a perfect score');
    await session(null, async (page) => {
      for (const [route, id, count] of [
        ['sing', 'ex-voice-major-pentatonic-up-down', 11],
        ['wind', 'ex-wind-major-pentatonic-up-down', 11],
      ]) {
        await page.goto(URL_BASE + '#/' + route);
        const groups = await page.$$eval('[data-id=song] optgroup', (g) => g.map((x) => x.label));
        check(
          groups.join() === 'Songs,Exercises,Random',
          `${route}: the song menu has Songs, Exercises and Random (${groups.join(', ')})`,
        );
        await page.selectOption('[data-id=song]', id);
        await page.uncheck('[data-id=opt-metronome]');
        await page.click('[data-id=demo]');
        await page.waitForSelector('[data-id=r-score]', { timeout: 120000 });
        const perfect = Number(await text(page, 'r-perfect'));
        const miss = Number(await text(page, 'r-miss'));
        check(
          perfect === count && miss === 0,
          `${route}: the demo plays the exercise ${id} perfectly (${perfect} perfect, ${miss} missed)`,
        );
      }
    });
  },

  async melody() {
    console.log('\n# Random melody: a seeded challenge in the song menu plays to a perfect score');
    await session(null, async (page) => {
      for (const route of ['sing', 'wind']) {
        await page.goto(URL_BASE + '#/' + route);
        await page.selectOption('[data-id=song]', 'random-melody');
        check(
          await page.isVisible('[data-id=challenge]'),
          `${route}: choosing the random melody shows its scale, level and seed`,
        );
        await page.selectOption('[data-id=challenge-scale]', 'major');
        await page.selectOption('[data-id=challenge-level]', 'easy');
        await page.fill('[data-id=challenge-seed]', '7');
        await page.dispatchEvent('[data-id=challenge-seed]', 'change');
        const info = await text(page, 'song-info');
        check(/Random melody 7/.test(info), `${route}: the song info names the seed (${info})`);
        await page.click('[data-id=challenge-new]');
        const seed = await page.inputValue('[data-id=challenge-seed]');
        check(
          seed !== '7' || Math.random() < 0.001,
          `${route}: New melody rolls another seed (${seed})`,
        );
        await page.fill('[data-id=challenge-seed]', '7');
        await page.dispatchEvent('[data-id=challenge-seed]', 'change');
        await page.uncheck('[data-id=opt-metronome]');
        await page.click('[data-id=demo]');
        await page.waitForSelector('[data-id=r-score]', { timeout: 120000 });
        const perfect = Number(await text(page, 'r-perfect'));
        const miss = Number(await text(page, 'r-miss'));
        check(
          perfect >= 20 && miss === 0,
          `${route}: the demo plays random melody 7 perfectly (${perfect} perfect, ${miss} missed)`,
        );
      }
    });
  },

  async 'strum-demo'() {
    console.log(
      '\n# Strumline auto-play demo with chord checking (synthetic ukulele -> worklet -> chords -> judge)',
    );
    await session(null, async (page) => {
      await page.goto(URL_BASE + '#/strum');
      await page.selectOption('[data-id=song]', 'strum-four-chords');
      await page.check('[data-id=opt-chords]');
      await page.check('[data-id=opt-debug]');
      await page.uncheck('[data-id=opt-metronome]');
      await page.click('[data-id=demo]');
      await page.waitForSelector('[data-id=stage]:visible', { timeout: 60000 });
      await page
        .waitForFunction(
          () => /chord [A-G]/.test(document.querySelector('[data-id=debug]')?.textContent ?? ''),
          null,
          { timeout: 20000 },
        )
        .catch(() => {});
      const dbg = await text(page, 'debug');
      check(
        /strum {2}chord [A-G]/.test(dbg),
        `debug overlay names the chords it hears (${dbg.split('\n').find((l) => /strum/.test(l))})`,
      );
      await shot(page, 'strum-play');
      await page.waitForSelector('[data-id=r-score]', { timeout: 90000 });
      const perfect = Number(await text(page, 'r-perfect'));
      const miss = Number(await text(page, 'r-miss'));
      const wrong = Number(await text(page, 'r-wrongchord'));
      check(
        perfect === 48 && miss === 0 && wrong === 0,
        `demo ukulele hits all 48 strums with the right chords (${perfect} perfect, ${miss} missed, ${wrong} wrong chord, grade ${await text(page, 'grade')})`,
      );
      await shot(page, 'strum-results');
      await checkCopyLog(page, 'Strumline', 48);
    });
  },

  async 'strum-picking'() {
    console.log(
      '\n# Strumline picking song: single plucked strings on the string lanes (synthetic ukulele -> worklet -> judge)',
    );
    await session(null, async (page) => {
      await page.goto(URL_BASE + '#/strum');
      await page.selectOption('[data-id=song]', 'strum-picking');
      await page.uncheck('[data-id=opt-metronome]');
      await page.click('[data-id=demo]');
      await page.waitForSelector('[data-id=stage]:visible', { timeout: 60000 });
      await page.waitForTimeout(4000);
      await shot(page, 'strum-picking-play');
      await page.waitForSelector('[data-id=r-score]', { timeout: 90000 });
      const perfect = Number(await text(page, 'r-perfect'));
      const miss = Number(await text(page, 'r-miss'));
      check(
        perfect === 32 && miss === 0,
        `demo ukulele plucks all 32 notes on time (${perfect} perfect, ${miss} missed, grade ${await text(page, 'grade')})`,
      );

      // the same song judged by pitch too: the pitch option shows for a picked song, and the demo
      // plucker plays every note right
      await page.click('[data-id=back]');
      check(await page.isVisible('[data-id=pitch-opt]'), 'the pitch option is offered for picking');
      await page.check('[data-id=opt-pitch]');
      await page.click('[data-id=demo]');
      await page.waitForSelector('[data-id=r-score]', { timeout: 90000 });
      const pitchedPerfect = Number(await text(page, 'r-perfect'));
      const wrong = Number(await text(page, 'r-wrongpitch'));
      check(
        pitchedPerfect >= 30 && wrong === 0,
        `demo plucks judged by pitch: ${pitchedPerfect} perfect, ${wrong} wrong notes, ${await text(page, 'r-miss')} missed`,
      );
      await page.click('[data-id=back]');
      await page.selectOption('[data-id=song]', 'strum-four-chords');
      check(
        !(await page.isVisible('[data-id=pitch-opt]')),
        'the pitch option is hidden for a strummed song',
      );
    });
  },

  async 'strum-live'() {
    console.log(
      '\n# Strumline with a live (fake) microphone: strums, chord names, reopening for a song',
    );
    await session(fixtures.strums, async (page) => {
      await page.goto(URL_BASE + '#/strum');
      await page.selectOption('[data-id=song]', 'strum-four-chords');
      await page.check('[data-id=opt-chords]');
      await page.click('[data-id=mic-start]');
      await page.waitForFunction(
        () =>
          /strum {2}chord [A-G]/.test(
            document.querySelector('[data-id=monitor]')?.textContent ?? '',
          ),
        null,
        { timeout: 30000 },
      );
      // collect what the monitor says over a few strums
      const seen = new Set();
      for (let i = 0; i < 24; i++) {
        const m = await text(page, 'monitor');
        for (const [, name] of m.matchAll(/strum {2}chord ([A-G]m?)/g)) seen.add(name);
        await page.waitForTimeout(500);
      }
      check(
        seen.has('C') && seen.has('F') && seen.has('G'),
        `the live mic names the chords of the strums (${[...seen].join(', ')})`,
      );
      // timing-only: the same strums, no chord names
      await page.uncheck('[data-id=opt-chords]');
      await page.waitForFunction(
        () => {
          const t = document.querySelector('[data-id=monitor]')?.textContent ?? '';
          const strums = t.split('\n').filter((l) => /strum {2}chord/.test(l));
          return strums.length > 0 && strums.every((l) => /strum {2}chord –/.test(l));
        },
        null,
        { timeout: 30000 },
      );
      check(
        true,
        'turning chord checking off reopens the mic: strums are listed without chord names',
      );
    });
  },

  async offline() {
    console.log('\n# Offline: one visit is enough for the app to start without a network');
    await session(null, async (page) => {
      await page.goto(URL_BASE);
      await page.waitForSelector('h1');
      await page.evaluate(() => navigator.serviceWorker.ready);
      // wait for the page to hand the worker its file list and for the worker to cache it,
      // including the audio worklet, which the page only loads when a mic or demo starts
      await page.waitForFunction(
        async () => {
          const names = await caches.keys();
          if (!names.length) return false;
          const urls = (await (await caches.open(names[0])).keys()).map((r) => r.url);
          return (
            urls.some((u) => /input-processor/.test(u)) &&
            urls.some((u) => /\.js$/.test(u) && !/input-processor/.test(u))
          );
        },
        null,
        { timeout: 15000 },
      );
      check(true, 'the worker cached the app files and the audio worklet after one visit');
      await page.context().setOffline(true);
      await page.reload();
      await page.waitForSelector('h1');
      check((await page.textContent('h1')) === 'Lineup', 'the home screen loads with no network');
      await page.goto(URL_BASE + '#/wind');
      await page.waitForSelector('[data-id=demo]');
      check(
        /Windline/.test((await page.textContent('h1')) ?? ''),
        'another screen opens offline too',
      );
      await page.context().setOffline(false);
    });
  },

  async calibrate() {
    console.log('\n# Calibration screen with a fake clapping microphone');
    await session(fixtures.claps, async (page) => {
      await page.goto(URL_BASE + '#/calibrate');
      // The fake mic claps every 0.5 s, the same period as the clicks, so about one start phase in six
      // puts a clap within 80 ms of a silent click and the (correct) bleed check refuses. Retry that.
      let result = '';
      for (let attempt = 1; attempt <= 3; attempt++) {
        await page.click('[data-id=start]');
        await page.waitForFunction(
          () => !document.querySelector('[data-id=result]')?.hasAttribute('hidden'),
          null,
          { timeout: 30000 },
        );
        result = await page.innerText('[data-id=result]');
        if (!/Mic hears the clicks/i.test(result)) break;
        console.log(`  (attempt ${attempt}: unlucky fake-mic phase, retrying)`);
        await page.waitForSelector('[data-id=start]:not([disabled])');
      }
      check(
        /Quality: good/.test(result) && /Saved on this device/.test(result),
        `measures and saves a calibration (${result.replace(/\n+/g, ' | ')})`,
      );
      await shot(page, 'calibrate');
      await page.reload();
      await page.waitForTimeout(300);
      check(
        /ms \(±\d+ ms, good\)/.test(await text(page, 'saved')),
        'saved calibration survives a reload',
      );
    });
  },

  async live() {
    console.log('\n# Singline with a live (fake) microphone');
    await session(fixtures.sung, async (page) => {
      await page.goto(URL_BASE + '#/sing');
      await page.selectOption('[data-id=song]', 'singline-scale');
      await page.check('[data-id=opt-debug]');
      await page.click('[data-id=mic-start]');
      await page.waitForFunction(
        () => document.querySelector('[data-id=note]')?.textContent?.includes('C4'),
        null,
        { timeout: 15000 },
      );
      await page.waitForTimeout(700);
      check(
        /C4/.test(await text(page, 'note')),
        `setup hears the sung note (${await text(page, 'note')})`,
      );
      check(
        /^Good/.test(await text(page, 'advice')),
        `mic advice says good (${await text(page, 'advice')})`,
      );
      await shot(page, 'live-setup');
      await page.click('[data-id=play]');
      await page.waitForSelector('[data-id=stage]:visible');
      await page.waitForTimeout(5500);
      const dbg = await text(page, 'debug');
      const m = /freq\s+([\d.]+) Hz\s+C4/.exec(dbg);
      check(
        !!m && Math.abs(1200 * Math.log2(Number(m[1]) / 261.626)) < 30,
        `play: debug overlay reads the sung C4 (${dbg.split('\n')[1]})`,
      );
      await shot(page, 'live-play');
      await page.click('[data-id=stop]');
      await page.waitForSelector('[data-id=play]:visible');
      check(true, 'Stop returns to setup');
    });
  },

  async bleed() {
    console.log('\n# Headphones (speaker-leak) check');
    for (const [wavPath, label, expected] of [
      [fixtures.silence, 'silent room', /No speaker leak/],
      [fixtures.sung, 'someone humming', /already hear pitched sound/],
    ]) {
      await session(wavPath, async (page) => {
        await page.goto(URL_BASE + '#/sing');
        await page.click('[data-id=mic-start]');
        await page.waitForSelector('[data-id=bleed-check]:not([disabled])');
        await page.waitForTimeout(500);
        await page.click('[data-id=bleed-check]');
        await page.waitForFunction(
          () =>
            /No speaker leak|hears the speaker|already hear pitched sound/.test(
              document.querySelector('[data-id=bleed-result]')?.textContent ?? '',
            ),
          null,
          { timeout: 20000 },
        );
        check(
          expected.test(await text(page, 'bleed-result')),
          `${label}: ${await text(page, 'bleed-result')}`,
        );
      });
    }
  },
  async call() {
    console.log('\n# Beatline call and response: each bar is played to you, then asked of you');
    await session(null, async (page) => {
      await page.goto(URL_BASE + '#/beat');
      await page.selectOption('[data-id=mode]', 'clap');
      await page.selectOption('[data-id=song]', 'clap-gallop');
      check(await page.isVisible('[data-id=call-label]'), 'call: offered in Beatline');
      await page.check('[data-id=call]');
      check(
        !(await page.isChecked('[data-id=listen]')),
        'call: turns listen first off (one way of hearing first at a time)',
      );
      await page.uncheck('[data-id=opt-metronome]');
      await page.click('[data-id=demo]');
      await page.waitForFunction(
        () =>
          /Listen|Your turn/.test(document.querySelector('[data-id=overlay]')?.textContent ?? ''),
        null,
        { timeout: 30000 },
      );
      check(true, 'call: says when to listen and when it is your turn');
      await page.waitForSelector('[data-id=r-score]', { timeout: 120000 });
      const perfect = Number(await text(page, 'r-perfect'));
      const miss = Number(await text(page, 'r-miss'));
      check(
        perfect + Number(await text(page, 'r-good')) + miss === 15 && miss === 0,
        `call: all 15 answers are judged and hit (${perfect} perfect, ${miss} missed)`,
      );
    });
  },

  async 'beat-demo'() {
    console.log(
      '\n# Beatline auto-play demos (synthetic hands -> worklet -> classifier -> judge -> canvas)',
    );
    for (const [mode, song, notes] of [
      ['clap', 'clap-basic', 19],
      ['hand-percussion', 'clap-tap-groove', 20],
    ]) {
      await session(null, async (page) => {
        await page.goto(URL_BASE + '#/beat');
        await page.selectOption('[data-id=mode]', mode);
        await page.selectOption('[data-id=song]', song);
        await page.check('[data-id=opt-debug]');
        await page.uncheck('[data-id=opt-metronome]');
        await page.click('[data-id=demo]');
        await page.waitForSelector('[data-id=stage]:visible', { timeout: 60000 });
        await page.waitForTimeout(6000);
        const dbg = await text(page, 'debug');
        check(
          /hits\s+\d+/.test(dbg) && /(clap|tap|hit)/.test(dbg),
          `${mode}: debug overlay lists classified hits (${dbg.split('\n').find((l) => l.startsWith('hits'))})`,
        );
        await shot(page, `beat-${mode}-play`);
        await page.waitForSelector('[data-id=r-score]', { timeout: 60000 });
        const perfect = Number(await text(page, 'r-perfect'));
        const good = Number(await text(page, 'r-good'));
        const miss = Number(await text(page, 'r-miss'));
        const strays = Number(await text(page, 'r-strays'));
        check(
          miss === 0 && perfect + good === notes,
          `${mode}: demo player hits all ${notes} notes (${perfect} perfect, ${good} good, ${miss} missed, ${strays} extra, grade ${await text(page, 'grade')})`,
        );
        await shot(page, `beat-${mode}-results`);
        if (mode === 'clap') await checkCopyLog(page, 'Beatline', notes);
      });
    }
  },

  async 'random-hits'() {
    console.log(
      '\n# Random songs for Strumline and Beatline: seeded, shown, and playable end to end',
    );
    for (const [route, mode, entry] of [
      ['strum', 'ukulele-strum', 'random-chords'],
      ['strum', 'ukulele-strum', 'random-melody'],
      ['beat', 'drum-kit', 'random-groove'],
      ['beat', 'hand-percussion', 'random-groove'],
      ['beat', 'clap', 'random-groove'],
    ]) {
      await session(null, async (page) => {
        await page.goto(URL_BASE + '#/' + route);
        if (route === 'beat') await page.selectOption('[data-id=mode]', mode);
        await page.selectOption('[data-id=song]', entry);
        check(
          await page.isVisible('[data-id=challenge]'),
          `${mode} ${entry}: the level and seed controls appear`,
        );
        await page.selectOption('[data-id=challenge-level]', 'easy');
        await page.fill('[data-id=challenge-seed]', '5');
        await page.dispatchEvent('[data-id=challenge-seed]', 'change');
        const info = await text(page, 'song-info');
        check(/Random .* 5/.test(info), `${mode} ${entry}: the song info names the seed (${info})`);
        await page.click('[data-id=challenge-new]');
        const seed = await page.inputValue('[data-id=challenge-seed]');
        check(
          seed !== '5' || Math.random() < 0.001,
          `${mode} ${entry}: New song rolls another seed (${seed})`,
        );
        await page.fill('[data-id=challenge-seed]', '5');
        await page.dispatchEvent('[data-id=challenge-seed]', 'change');
        await page.uncheck('[data-id=opt-metronome]');
        await page.click('[data-id=demo]');
        await page.waitForSelector('[data-id=r-score]', { timeout: 120000 });
        const perfect = Number(await text(page, 'r-perfect'));
        const good = Number(await text(page, 'r-good'));
        const miss = Number(await text(page, 'r-miss'));
        check(
          miss === 0 && perfect + good >= 16,
          `${mode} ${entry}: the demo plays random song 5 (${perfect} perfect, ${good} good, ${miss} missed)`,
        );
      });
    }
  },

  async listen() {
    console.log('\n# Listen first, then play it back: the demo plays the echo to a perfect score');
    await session(null, async (page) => {
      await page.goto(URL_BASE + '#/sing');
      await page.selectOption('[data-id=song]', 'sing-hot-cross-buns');
      await page.check('[data-id=listen]');
      await page.uncheck('[data-id=opt-metronome]');
      await page.click('[data-id=demo]');
      await page.waitForSelector('[data-id=r-score]', { timeout: 120000 });
      const perfect = Number(await text(page, 'r-perfect'));
      const miss = Number(await text(page, 'r-miss'));
      check(miss === 0 && perfect >= 10, `listen first: ${perfect} perfect, ${miss} missed`);
    });
    await session(null, async (page) => {
      await page.goto(URL_BASE + '#/beat');
      await page.selectOption('[data-id=mode]', 'drum-kit');
      await page.selectOption('[data-id=song]', 'kit-halftime');
      await page.check('[data-id=listen]');
      await page.uncheck('[data-id=opt-metronome]');
      await page.click('[data-id=demo]');
      await page.waitForSelector('[data-id=r-score]', { timeout: 180000 });
      const perfect = Number(await text(page, 'r-perfect'));
      const miss = Number(await text(page, 'r-miss'));
      check(
        miss === 0 && perfect >= 10,
        `listen first (drums): ${perfect} perfect, ${miss} missed`,
      );
    });
    await session(null, async (page) => {
      await page.goto(URL_BASE + '#/strum');
      check(await page.isHidden('[data-id=listen]'), 'listen first is not offered for chord songs');
    });
  },

  async ear() {
    console.log('\n# Ear training: a round of ten questions, a result, and a scoreboard entry');
    await session(null, async (page) => {
      await page.goto(URL_BASE + '#/ear');
      await page.selectOption('[data-id=kind]', 'chords');
      await page.selectOption('[data-id=level]', 'easy');
      await page.click('[data-id=start]');
      for (let q = 1; q <= 10; q++) {
        await page.waitForFunction(
          (n) => document.querySelector('[data-id=count]')?.textContent === `Question ${n} of 10`,
          q,
          { timeout: 8000 },
        );
        await page.click('[data-id=choices] button >> nth=0');
        check(
          /Right|It was/.test(await text(page, 'feedback')),
          `ear: question ${q} gives feedback`,
        );
      }
      await page.waitForSelector('[data-id=r-right]', { timeout: 8000 });
      check(
        / of 10$/.test(await text(page, 'r-right')),
        `ear: result shows (${await text(page, 'r-right')})`,
      );
      check((await page.$('[data-id=reward]')) !== null, 'ear: stars and XP are shown');
      await page.goto(URL_BASE + '#/scores');
      await page.waitForSelector('[data-id=rows] li');
      check(
        /Ear training: chords, easy/.test(await text(page, 'rows')),
        'ear: the round is on the scoreboard',
      );
      // name that note: the choices are solfège names
      await page.goto(URL_BASE + '#/ear');
      await page.selectOption('[data-id=kind]', 'degrees');
      await page.selectOption('[data-id=level]', 'easy');
      await page.click('[data-id=start]');
      await page.waitForSelector('[data-id=choices] button');
      const names = await page.$$eval('[data-id=choices] button', (bs) =>
        bs.map((b) => b.textContent),
      );
      check(
        names.join(',') === 'Do,Mi,Sol',
        `ear: name that note offers do, mi and sol (${names.join(',')})`,
      );
    });
  },

  async free() {
    console.log('\n# Free play: a metronome, a recorded take, and playback on the device');
    await session(fixtures.sung, async (page) => {
      await page.goto(URL_BASE + '#/free');
      await page.fill('[data-id=bpm]', '500');
      await page.dispatchEvent('[data-id=bpm]', 'change');
      check(
        (await page.inputValue('[data-id=bpm]')) === '240',
        'free: the tempo is kept within range',
      );
      await page.click('[data-id=click-toggle]');
      check(/Stop metronome/.test(await text(page, 'click-toggle')), 'free: the metronome starts');
      await page.click('[data-id=click-toggle]');
      check(/Start metronome/.test(await text(page, 'click-toggle')), 'free: and stops');
      await page.uncheck('[data-id=with-click]');
      await page.click('[data-id=record]');
      await page.waitForFunction(
        () => /Recording/.test(document.querySelector('[data-id=status]')?.textContent ?? ''),
        null,
        { timeout: 15000 },
      );
      await page.waitForTimeout(1500);
      await page.click('[data-id=stop]');
      await page.waitForSelector('[data-id=take]:not([hidden])', { timeout: 15000 });
      check(
        (await page.getAttribute('[data-id=player]', 'src'))?.startsWith('blob:') === true,
        'free: the take is ready to play back',
      );
      check(
        /^take\.(webm|m4a|ogg)$/.test(
          (await page.getAttribute('[data-id=save]', 'download')) ?? '',
        ),
        'free: and can be saved to the device',
      );
      await page.click('[data-id=discard]');
      check(await page.isHidden('[data-id=take]'), 'free: a take can be discarded');
      await page.goto(URL_BASE + '#/');
      check((await page.$('[data-id=free-link]')) !== null, 'home: free play is listed');
    });
  },

  async tour() {
    console.log('\n# First-time tips per game, and Start over in Options');
    await session(null, async (page) => {
      await page.goto(URL_BASE + '#/sing');
      check(await page.isVisible('[data-id=tour]'), 'tour: Singline shows its tips the first time');
      await page.click('[data-id=tour-dismiss]');
      await page.goto(URL_BASE + '#/wind');
      check(await page.isVisible('[data-id=tour]'), 'tour: Windline has its own tips');
      await page.goto(URL_BASE + '#/sing');
      check(
        (await page.$('[data-id=tour]')) === null,
        'tour: a dismissed game does not show them again',
      );
      await page.goto(URL_BASE + '#/options');
      await page.selectOption('[data-id=voice-range]', 'tenor');
      await page.click('[data-id=export]');
      await page.click('details.reset-all summary');
      await page.click('[data-id=reset-all]');
      await page.click('[data-id=reset-all]');
      await page.waitForLoadState('load');
      await page.waitForFunction(
        () =>
          !Object.keys(localStorage).some((k) => k.startsWith('lineup.') && k !== 'lineup.probe'),
        null,
        { timeout: 10000 },
      );
      check(true, 'options: Start over erased everything the app kept');
      await page.goto(URL_BASE + '#/sing');
      check(await page.isVisible('[data-id=tour]'), 'tour: and the tips are back after Start over');
    });
  },

  async duet() {
    console.log('\n# Duet: two players share the phrases of a song, each with a score');
    await session(null, async (page) => {
      await page.goto(URL_BASE + '#/sing');
      await page.selectOption('[data-id=song]', 'sing-ode-to-joy');
      check(await page.isVisible('[data-id=duet-label]'), 'duet: offered for a song with phrases');
      await page.check('[data-id=opt-duet]');
      await page.uncheck('[data-id=opt-metronome]');
      await page.click('[data-id=demo]');
      await page.waitForSelector('[data-id=turn]:not([hidden])', { timeout: 20000 });
      check(
        /Player [12]'s turn/.test(await text(page, 'turn')),
        `duet: says whose turn it is (${await text(page, 'turn')})`,
      );
      await page.waitForSelector('[data-id=r-score]', { timeout: 120000 });
      const p1 = await text(page, 'r-p1');
      const p2 = await text(page, 'r-p2');
      const total = [p1, p2].reduce((n, t) => n + Number(/of (\d+) notes/.exec(t)?.[1] ?? 0), 0);
      check(total === 30, `duet: each player has a score (${p1} / ${p2})`);
      check(
        /wins|tie/.test(await text(page, 'r-duet')),
        `duet: the result names a winner or a tie (${await text(page, 'r-duet')})`,
      );
    });
  },

  async a11y() {
    console.log(
      '\n# Accessibility: every screen audited with axe-core in the dark, light and high-contrast colours',
    );
    const axeSource = readFileSync(
      createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
      'utf8',
    );
    const routes = [
      '',
      'learn',
      'collection',
      'scores',
      'options',
      'help',
      'make',
      'free',
      'tuner',
      'ear',
      'mic',
      'calibrate',
      'sing',
      'wind',
      'beat',
      'strum',
    ];
    await session(null, async (page) => {
      for (const scheme of ['dark', 'light', 'contrast']) {
        for (const route of routes) {
          await page.goto(URL_BASE + '#/' + route);
          await page.waitForSelector('h1');
          await page.evaluate((t) => (document.documentElement.dataset.theme = t), scheme);
          await page.waitForTimeout(300);
          await page.addScriptTag({ content: axeSource });
          const result = await page.evaluate(() =>
            // eslint-disable-next-line no-undef
            axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'] }),
          );
          const found = result.violations.filter((v) => v.impact !== 'minor');
          check(
            found.length === 0,
            `a11y ${scheme} #/${route}: ${
              found.length === 0
                ? 'no violations'
                : found
                    .map((v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${v.nodes[0].target}`)
                    .join('; ')
            }`,
          );
        }
      }
      // the results screen of a played song
      await page.goto(URL_BASE + '#/sing');
      await page.selectOption('[data-id=song]', 'sing-hot-cross-buns');
      await page.uncheck('[data-id=opt-metronome]');
      await page.click('[data-id=demo]');
      await page.waitForSelector('[data-id=r-score]', { timeout: 120000 });
      for (const scheme of ['dark', 'light', 'contrast']) {
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), scheme);
        await page.addScriptTag({ content: axeSource });
        const result = await page.evaluate(() =>
          // eslint-disable-next-line no-undef
          axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'] }),
        );
        const found = result.violations.filter((v) => v.impact !== 'minor');
        check(
          found.length === 0,
          `a11y ${scheme} results screen: ${
            found.length === 0
              ? 'no violations'
              : found.map((v) => `${v.id} (${v.impact}): ${v.nodes[0].target}`).join('; ')
          }`,
        );
      }
    });
  },

  async maker() {
    console.log(
      '\n# My songs: write a melody, a chord song and a rhythm; they reach the right games',
    );
    await session(null, async (page) => {
      await page.goto(URL_BASE + '#/make');
      await page.fill('[data-id=title]', 'E2E tune');
      await page.fill('[data-id=notes]', 'C4 D4 E4 F4 G4:2 E4 C4:2');
      check(
        /Looks good/.test(await text(page, 'preview')),
        `maker: a melody previews (${await text(page, 'preview')})`,
      );
      await page.fill('[data-id=notes]', 'C4 H9');
      check(/H9/.test(await text(page, 'preview')), 'maker: a mistake is explained');
      await page.fill('[data-id=notes]', 'C4 D4 E4 F4 G4:2 E4 C4:2');
      await page.click('[data-id=save]');
      await page.selectOption('[data-id=kind]', 'chords');
      await page.fill('[data-id=title]', 'E2E chords');
      await page.click('[data-id=save]');
      await page.selectOption('[data-id=kind]', 'rhythm');
      await page.selectOption('[data-id=profile]', 'clap');
      await page.fill('[data-id=title]', 'E2E rhythm');
      await page.fill('[data-id=lanes]', 'hit: x.x.xx..');
      await page.click('[data-id=save]');
      check((await page.$$('[data-id=list] li')).length === 3, 'maker: three songs are kept');
      const has = async (route, mode, title) => {
        await page.goto(URL_BASE + '#/' + route);
        if (mode) await page.selectOption('[data-id=mode]', mode);
        return page.evaluate(
          (t) =>
            [...document.querySelectorAll('[data-id=song] option')].some((o) =>
              o.textContent.startsWith(t),
            ),
          title,
        );
      };
      check(await has('sing', null, 'E2E tune'), 'maker: the melody is in Singline');
      check(await has('wind', null, 'E2E tune'), 'maker: the melody is in Windline');
      check(await has('strum', null, 'E2E chords'), 'maker: the chord song is in Strumline');
      check(await has('beat', 'clap', 'E2E rhythm'), 'maker: the rhythm is in Beatline');
      check(
        !(await has('beat', 'drum-kit', 'E2E rhythm')),
        'maker: but not in a kit it was not written for',
      );
      await page.goto(URL_BASE + '#/sing');
      const value = await page.evaluate(
        () =>
          [...document.querySelectorAll('[data-id=song] option')].find((o) =>
            o.textContent.startsWith('E2E tune'),
          ).value,
      );
      await page.selectOption('[data-id=song]', value);
      await page.uncheck('[data-id=opt-metronome]');
      await page.click('[data-id=demo]');
      await page.waitForSelector('[data-id=r-score]', { timeout: 120000 });
      check(
        Number(await text(page, 'r-miss')) === 0,
        'maker: the demo plays the player’s own melody without a miss',
      );

      // paste a tune in ABC notation, move it up a tone, save it, and see its words while singing
      await page.goto(URL_BASE + '#/make');
      await page.fill(
        '[data-id=paste]',
        'X:1\nT:E2E abc\nL:1/4\nQ:1/4=120\nK:C\nC D E F | G2 E2\nw:one two three four five six',
      );
      await page.click('[data-id=read-paste]');
      check(
        (await page.inputValue('[data-id=notes]')).startsWith('C4:1 D4:1 E4:1'),
        'maker: an ABC tune is read into the notes',
      );
      check(
        (await page.inputValue('[data-id=lyrics]')) === 'one two three four five six',
        'maker: its words come with it',
      );
      await page.click('[data-move="1"]');
      await page.click('[data-move="-1"]');
      await page.click('[data-move="12"]');
      check(
        (await page.inputValue('[data-id=notes]')).startsWith('C5:1 D5:1'),
        'maker: the melody moves up an octave',
      );
      await page.click('[data-move="-12"]');
      await page.click('[data-id=save]');
      await page.goto(URL_BASE + '#/sing');
      const abcValue = await page.evaluate(
        () =>
          [...document.querySelectorAll('[data-id=song] option')].find((o) =>
            o.textContent.startsWith('E2E abc'),
          ).value,
      );
      await page.selectOption('[data-id=song]', abcValue);
      await page.uncheck('[data-id=opt-metronome]');
      await page.click('[data-id=demo]');
      await page.waitForSelector('[data-id=lyrics]:not([hidden])', { timeout: 20000 });
      check(
        /one/.test(await text(page, 'lyrics')),
        `maker: the words show while singing (${await text(page, 'lyrics')})`,
      );
      await page.waitForSelector('[data-id=r-score]', { timeout: 120000 });
    });
  },

  async learn() {
    console.log(
      '\n# Learn: paths open as stars are earned, and a step opens its game with the song chosen',
    );
    await session(null, async (page) => {
      await page.addInitScript(() => {
        if (localStorage.getItem('seeded')) return;
        localStorage.setItem('seeded', '1');
        localStorage.setItem(
          'lineup.scores.v1',
          JSON.stringify({
            'voice|sing-hot-cross-buns|normal': {
              score: 900,
              accuracy: 0.85,
              grade: 'B',
              at: new Date().toISOString(),
            },
            // every step of the clap path, mastered
            ...Object.fromEntries(
              [
                'ex-clap-quarters',
                'ex-clap-eighths',
                'ex-clap-off-beats',
                'ex-clap-gallop',
                'ex-clap-syncopation',
                'clap-waltz',
                'ex-clap-tresillo',
                'ex-clap-triplets',
                'ex-clap-son-clave',
              ].map((id) => [
                `clap|${id}|`,
                { score: 500, accuracy: 0.9, grade: 'A', at: new Date().toISOString() },
              ]),
            ),
          }),
        );
      });
      await page.goto(URL_BASE + '#/learn');
      check(
        (await page.$('[data-id=graduate]')) !== null,
        'learn: finishing a whole path earns the Graduate trophy',
      );
      const state = (id) => page.getAttribute(`[data-step=${id}]`, 'class');
      check(
        (await state('sing-hot-cross-buns')) === 'mastered',
        'learn: a step with two stars is mastered',
      );
      check((await state('sing-mary-lamb')) === 'open', 'learn: the next step is open');
      check((await state('ex-voice-major-up-down')) === 'locked', 'learn: the one after is locked');
      check(
        /1 of \d+ mastered/.test(await page.textContent('[data-course=voice-first-steps] h2')),
        'learn: progress is counted',
      );
      await page.click('[data-id=continue-voice-first-steps]');
      await page.waitForSelector('[data-id=song]');
      check(
        (await page.inputValue('[data-id=song]')) === 'sing-mary-lamb',
        'learn: the step opens Singline with its song chosen',
      );
      await page.goto(URL_BASE + '#/learn');
      await page.click('[data-id=continue-kit-groove]');
      await page.waitForSelector('[data-id=song]');
      check(
        (await page.inputValue('[data-id=mode]')) === 'drum-kit' &&
          (await page.inputValue('[data-id=song]')) === 'ex-drum-kit-kick-snare',
        'learn: a drum step opens Beatline in the kit mode with its exercise chosen',
      );
    });
  },

  async tuner() {
    console.log('\n# Tuner hears a sung C4 and names the C string');
    await session(fixtures.sung, async (page) => {
      await page.goto(URL_BASE + '#/tuner');
      await page.click('[data-id=start]');
      await page.waitForFunction(
        () => document.querySelector('[data-id=note]')?.textContent === 'C4',
        null,
        { timeout: 20000 },
      );
      check(true, 'tuner: names the C string');
      check(
        /In tune|tune (up|down)/.test(await text(page, 'advice')),
        `tuner: says in tune (${await text(page, 'advice')})`,
      );
    });
  },

  async home() {
    console.log('\n# Home menu, scoreboard, trophies and options');
    await session(null, async (page) => {
      await page.addInitScript(() => {
        if (localStorage.getItem('lineup.seeded')) return;
        localStorage.setItem('lineup.seeded', '1');
        localStorage.setItem(
          'lineup.scores.v1',
          JSON.stringify({
            'voice|sing-hot-cross-buns|normal': {
              score: 900,
              accuracy: 0.97,
              grade: 'A',
              at: '2026-10-10T10:00:00.000Z',
            },
            'ukulele-strum|strum-blues|x1|harder': {
              score: 500,
              accuracy: 0.7,
              grade: 'C',
              at: '2026-10-11T10:00:00.000Z',
            },
          }),
        );
        localStorage.setItem(
          'lineup.progress.v1',
          JSON.stringify({
            log: { [new Date().toLocaleDateString('en-CA')]: { plays: 2, seconds: 600 } },
            xp: 350,
            plays: 2,
            days: ['2026-10-10', '2026-10-11'],
            freezes: 1,
            perGame: { singline: 1, strumline: 1 },
            songs: ['voice|sing-hot-cross-buns'],
            achievements: { 'first-song': '2026-10-10T10:00:00.000Z' },
          }),
        );
      });
      await page.goto(URL_BASE);
      check(
        (await page.$('[data-id=new-here]')) !== null,
        'home: a first visit suggests the how-to-play page',
      );
      check(
        (await page.getAttribute('[data-id=suggested]', 'href')) ===
          '#/strum?song=ex-ukulele-strum-changes-c-am',
        'home: the most recently played path suggests its open step',
      );
      check(
        (await page.$$('[data-id=games] a')).length === 5,
        'home: four instrument games and ear training under Play',
      );
      check(
        (await page.$$('[data-id=games] a[href="#/mic"], [data-id=games] a[href="#/calibrate"]'))
          .length === 0,
        'home: the mic test and calibration are not among the games',
      );
      check(
        (await page.$('[data-id=mic-link]')) !== null &&
          (await page.$('[data-id=calibrate-link]')) !== null,
        'home: the mic test and calibration sit under Set up',
      );
      check(
        /Level 3 · Student/.test(await text(page, 'level-card')),
        'home: shows the level from stored progress',
      );
      check((await page.$$('[data-id=daily] a')).length === 4, 'home: four daily challenges');
      check(
        /❄ 1/.test(await text(page, 'level-card')),
        `home: a banked streak freeze is shown (${await text(page, 'level-card')})`,
      );
      check(
        (await page.$('[data-id=theme]')) !== null &&
          /This week: .+ week/.test(await text(page, 'theme')) &&
          /0 of \d/.test(await text(page, 'theme')),
        `home: the themed week and its progress (${(await text(page, 'theme')).replace(/\s+/g, ' ')})`,
      );
      check((await page.$('[data-id=tuner-link]')) !== null, 'home: the tuner is under Set up');
      check(
        /10 minutes of practice/.test(await text(page, 'week')),
        `home: shows this week's practice (${await text(page, 'week')})`,
      );
      for (const [game, route, pick] of [
        ['singline', 'sing', 'random-melody'],
        ['strumline', 'strum', 'random-chords'],
        ['beatline', 'beat', 'random-groove'],
      ]) {
        await page.goto(URL_BASE);
        await page.click(`[data-daily=${game}]`);
        await page.waitForSelector('[data-id=song]');
        check(
          (await page.inputValue('[data-id=song]')) === pick &&
            /Beginner|Easy|Medium|Hard|Expert/.test(await text(page, 'song-info')),
          `daily ${route}: opens with today's random song chosen`,
        );
      }
      await page.goto(URL_BASE);
      await page.click('[data-id=scores-link]');
      await page.waitForSelector('[data-id=rows] li');
      check(
        (await page.$$('[data-id=practice] .week span.played')).length === 1,
        'scoreboard: today shows as a practised day',
      );
      check(
        (await page.$$('[data-id=rows] li')).length === 2,
        'scoreboard: lists both personal bests',
      );
      check(
        /Hot Cross Buns/.test(await text(page, 'rows')),
        'scoreboard: titles come from the song library',
      );
      check(
        (await page.$$('[data-id=timeline] li')).length === 2 &&
          /First score/.test(await text(page, 'timeline')),
        'scoreboard: the records timeline lists when each best was set',
      );
      check(
        /1 of 2 banked/.test(await text(page, 'freezes')),
        'scoreboard: the streak freezes banked are shown',
      );
      await page.selectOption('[data-id=game]', 'strumline');
      check((await page.$$('[data-id=rows] li')).length === 1, 'scoreboard: filters by game');
      await page.selectOption('[data-id=game]', '');
      await page.selectOption('[data-id=sort]', 'score');
      check(
        /Hot Cross Buns/.test((await page.textContent('[data-id=rows] li')) ?? ''),
        'scoreboard: sorts by highest score',
      );
      check(
        (await page.$$('[data-trophy].earned')).length === 1,
        'scoreboard: one trophy earned, the rest locked',
      );
      // the collection: one song of the singing songs is cleared with three stars
      await page.click('[data-id=collection-link]');
      await page.waitForSelector('[data-family=sing-songs]');
      check(
        /1 of \d+ with three stars/.test(await text(page, 'badge-sing-songs').catch(() => '')) ||
          /1 of \d+ with three stars/.test(
            (await page.textContent('[data-family=sing-songs] h2')) ?? '',
          ),
        'collection: counts the song cleared with three stars',
      );
      check(
        (await page.$$('[data-family]')).length >= 8 &&
          (await page.getAttribute('[data-family=sing-songs] li.cleared a', 'href')) ===
            '#/sing?song=sing-hot-cross-buns',
        'collection: lists every family, and a song links to its game',
      );
      await page.goto(URL_BASE + '#/help');
      await page.goto(URL_BASE);
      check(
        (await page.$('[data-id=new-here]')) === null,
        'home: the suggestion goes away once the page was opened',
      );
      await page.goto(URL_BASE + '#/help');
      check(
        /Private and offline/.test((await page.textContent('main')) ?? ''),
        'help: the how-to-play page explains privacy',
      );
      await page.goto(URL_BASE + '#/tuner');
      await page.selectOption('[data-id=tuning]', 'baritone');
      check(
        (await page.$$('[data-id=refs] button')).length === 4,
        'tuner: a reference note for each of the four strings',
      );
      await page.selectOption('[data-id=tuning]', 'chromatic');
      check(
        await page.isHidden('[data-id=refs-panel]'),
        'tuner: no reference notes for the chromatic tuner',
      );
      await page.goto(URL_BASE + '#/options');
      await page.uncheck('[data-id=metronome]');
      await page.selectOption('[data-id=theme]', 'contrast');
      await page.selectOption('[data-id=accompaniment]', 'bass');
      await page.selectOption('[data-id=goal]', '30');
      await page.selectOption('[data-id=rest-day]', '0');
      await page.selectOption('[data-id=text-size]', 'large');
      await page.reload();
      check(
        !(await page.isChecked('[data-id=metronome]')) &&
          (await page.inputValue('[data-id=accompaniment]')) === 'bass',
        'options: choices are remembered',
      );
      check(
        (await page.inputValue('[data-id=rest-day]')) === '0',
        'options: the rest day is remembered',
      );
      check(
        (await page.inputValue('[data-id=goal]')) === '30' &&
          (await page.evaluate(() =>
            document.documentElement.style.getPropertyValue('--text-scale'),
          )) === '1.15',
        'options: the weekly goal and text size are remembered and applied',
      );
      check(
        (await page.evaluate(() => document.documentElement.dataset.theme)) === 'contrast',
        'options: the colour scheme is remembered and applied',
      );
      await page.click('[data-id=clear-scores]');
      check(
        /Tap again/.test(await text(page, 'clear-scores')),
        'options: erasing asks for a second tap',
      );
      await page.click('[data-id=clear-scores]');
      await page.goto(URL_BASE + '#/scores');
      check(
        (await page.$$('[data-id=rows] li')).length === 0,
        'options: erased scores are gone from the scoreboard',
      );
    });
  },

  async target() {
    console.log('\n# "Aim for" a difficulty: New song finds a random song near it');
    const score = async (page) => Number(/\((\d+)\/10\)/.exec(await text(page, 'song-info'))?.[1]);
    for (const [route, mode, song] of [
      ['sing', null, 'random-melody'],
      ['strum', null, 'random-chords'],
      ['beat', 'drum-kit', 'random-groove'],
    ]) {
      await session(null, async (page) => {
        await page.goto(URL_BASE + '#/' + route);
        if (mode) await page.selectOption('[data-id=mode]', mode);
        await page.selectOption('[data-id=song]', song);
        await page.selectOption('[data-id=challenge-level]', 'hard');
        // hard chord songs do not go below a 5, nor do hard kit grooves
        const targets =
          song === 'random-melody'
            ? ['3', '6']
            : song === 'random-chords'
              ? ['5', '7']
              : ['5', '6'];
        for (const target of targets) {
          await page.selectOption('[data-id=challenge-target]', target);
          await page.click('[data-id=challenge-new]');
          const got = await score(page);
          check(
            Math.abs(got - Number(target)) <= 1,
            `${song}: aiming for ${target} gives a ${got}`,
          );
        }
      });
    }
  },

  async variation() {
    console.log('\n# Easier and harder versions of a song: rated, and playable end to end');
    const score = async (page) => Number(/\((\d+)\/10\)/.exec(await text(page, 'song-info'))?.[1]);
    for (const [route, mode, song] of [
      ['sing', null, 'sing-jingle-bells'],
      ['wind', null, 'wind-greensleeves'],
      ['strum', null, 'strum-blues'],
      ['beat', 'drum-kit', 'kit-halftime'],
    ]) {
      await session(null, async (page) => {
        await page.goto(URL_BASE + '#/' + route);
        if (mode) await page.selectOption('[data-id=mode]', mode);
        await page.selectOption('[data-id=song]', song);
        const scores = {};
        for (const v of ['original', 'easier', 'harder']) {
          await page.selectOption('[data-id=variation]', v);
          scores[v] = await score(page);
        }
        check(
          scores.easier <= scores.original && scores.original <= scores.harder,
          `${song}: easier <= as written <= harder (${scores.easier}, ${scores.original}, ${scores.harder})`,
        );
        check(scores.easier < scores.harder, `${song}: the two versions differ`);
        if (song === 'strum-blues') {
          await page.selectOption('[data-id=variation]', 'original');
          const notes = async () => Number(/(\d+) notes/.exec(await text(page, 'song-info'))?.[1]);
          const whole = await notes();
          check(
            (await page.isVisible('[data-id=part]')) &&
              (await page.$$('[data-id=part] option')).length > 2,
            `${song}: a Part menu offers its phrases`,
          );
          await page.selectOption('[data-id=part]', '1');
          const part = await notes();
          check(
            part > 0 && part < whole,
            `${song}: practising one phrase has fewer notes (${part} of ${whole})`,
          );
          await page.selectOption('[data-id=part]', '-1');
        }
        if (song === 'wind-greensleeves') {
          await page.selectOption('[data-id=variation]', 'easier');
          check(
            /diatonic/.test(await text(page, 'song-info')),
            'an easier Greensleeves has no sharps or flats left',
          );
        }
        await page.selectOption('[data-id=variation]', 'easier');
        await page.uncheck('[data-id=opt-metronome]');
        await page.click('[data-id=demo]');
        await page.waitForSelector('[data-id=r-score]', { timeout: 120000 });
        const perfect = Number(await text(page, 'r-perfect'));
        const good = Number(await text(page, 'r-good'));
        const miss = Number(await text(page, 'r-miss'));
        check(
          miss === 0 && perfect + good >= 10,
          `${song}: the demo plays the easier version (${perfect} perfect, ${good} good, ${miss} missed)`,
        );
      });
    }
  },

  async 'beat-live'() {
    console.log('\n# Beatline with a live (fake) microphone: monitor, enrollment, classification');
    await session(fixtures.clapTap, async (page) => {
      await page.goto(URL_BASE + '#/beat');
      await page.selectOption('[data-id=mode]', 'hand-percussion');
      await page.click('[data-id=mic-start]');
      await page.waitForFunction(
        () => /hits\s+[1-9]/.test(document.querySelector('[data-id=monitor]')?.textContent ?? ''),
        null,
        { timeout: 20000 },
      );
      check(true, 'hit monitor sees hits from the microphone');

      // Start enrolling in the quiet gap after a run of taps, so claps come first.
      await page.waitForFunction(
        () => {
          const t = document.querySelector('[data-id=monitor]')?.textContent ?? '';
          const n = Number(/hits\s+(\d+)/.exec(t)?.[1] ?? 0);
          const w = window;
          if (n !== w.__n) {
            w.__n = n;
            w.__t = performance.now();
          }
          const centroid = Number(
            /(\d+) Hz/.exec(t.split('\n').find((l) => /Hz/.test(l)) ?? '')?.[1] ?? 9999,
          );
          return n >= 6 && centroid < 900 && performance.now() - (w.__t ?? 0) > 1300;
        },
        null,
        { timeout: 40000, polling: 100 },
      );
      await page.click('[data-id=enroll-start]');
      await page.waitForFunction(
        () => /Learned/.test(document.querySelector('[data-id=model-status]')?.textContent ?? ''),
        null,
        { timeout: 30000 },
      );
      const status = await text(page, 'model-status');
      check(
        /Learned: Clap, Tap/.test(status) && !/Warning/.test(status),
        `enrollment learns clap and tap (${status})`,
      );
      await shot(page, 'beat-enrolled');

      await page.reload();
      await page.selectOption('[data-id=mode]', 'hand-percussion');
      check(
        /saved/.test(await text(page, 'model-status')),
        `enrolled sounds survive a reload (${await text(page, 'model-status')})`,
      );
      await page.click('[data-id=mic-start]');
      await page.waitForFunction(
        () => {
          const t = document.querySelector('[data-id=monitor]')?.textContent ?? '';
          return (
            /\d s v[\d.]+ clap/.test(t.replace(/\d+\.\d+s/g, '1 s')) ||
            (/ clap/.test(t) && / tap/.test(t))
          );
        },
        null,
        { timeout: 40000, polling: 200 },
      );
      const seen = new Set();
      for (let i = 0; i < 80 && seen.size < 2; i++) {
        const t = await text(page, 'monitor');
        for (const line of t.split('\n')) {
          const m = /^\d+\.\d+s v[\d.]+ (clap|tap|UNKNOWN)/.exec(line);
          if (m) seen.add(m[1]);
        }
        await page.waitForTimeout(250);
      }
      check(
        seen.has('clap') && seen.has('tap'),
        `live hits land in both lanes (${[...seen].join(', ')})`,
      );
      await shot(page, 'beat-monitor');
    });
  },

  async 'beat-leak'() {
    console.log('\n# Beatline click-leak check');
    for (const [wavPath, label, expected] of [
      [fixtures.silence, 'silent room', /No click leak/],
      [fixtures.claps, 'someone clapping', /already hear hits/],
    ]) {
      await session(wavPath, async (page) => {
        await page.goto(URL_BASE + '#/beat');
        await page.click('[data-id=mic-start]');
        await page.waitForSelector('[data-id=leak-check]:not([disabled])');
        await page.waitForTimeout(500);
        await page.click('[data-id=leak-check]');
        await page.waitForFunction(
          () =>
            /No click leak|mic hears the clicks|already hear hits/.test(
              document.querySelector('[data-id=leak-result]')?.textContent ?? '',
            ),
          null,
          { timeout: 20000 },
        );
        check(
          expected.test(await text(page, 'leak-result')),
          `${label}: ${await text(page, 'leak-result')}`,
        );
      });
    }
  },
};

try {
  await waitForServer();
  const run = which === 'all' ? Object.keys(scenarios) : [which];
  for (const name of run) {
    if (!scenarios[name])
      throw new Error(`unknown scenario "${name}" (have: ${Object.keys(scenarios).join(', ')})`);
    await scenarios[name]();
  }
} catch (err) {
  console.error(err);
  failures.push(String(err));
} finally {
  stopServer();
}
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall e2e checks passed');
process.exit(failures.length ? 1 : 0);
