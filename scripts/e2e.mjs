// End-to-end checks in a real browser engine (headless Chromium): the built app,
// real AudioWorklet, real AudioContext clock, real canvas and rAF loop. The
// microphone is replaced by Chromium's fake capture device playing generated WAVs,
// or by the app's own auto-play demo adapter.
//
// Not part of CI (needs a Chromium + Playwright); run with `npm run e2e` after
// `npm run build`. Exits non-zero if anything fails.
//
//   node scripts/e2e.mjs [demo|calibrate|live|bleed|beat-demo|beat-live|beat-leak|all] [--shots <dir>]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const fixtures = {
  clapTap: join(tmp, 'clap-tap.wav'),
  sung: join(tmp, 'sung-c4.wav'),
  silence: join(tmp, 'silence.wav'),
  claps: join(tmp, 'claps.wav'),
};
wav(fixtures.sung, sung(261.626, 16));
wav(fixtures.silence, new Float32Array(10 * SR));
wav(fixtures.claps, claps(14, 0.3));
wav(fixtures.clapTap, clapTapLoop(6));

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
      await page.waitForTimeout(5000);
      const dbg = await text(page, 'debug');
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
