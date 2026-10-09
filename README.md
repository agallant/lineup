# Lineup

An umbrella platform of rhythm games (DDR / Elite Beat Agents / SingStar style)
that you play by performing on a real instrument. One mode per instrument family:

| Mode          | Instrument                         | Status                     |
| ------------- | ---------------------------------- | -------------------------- |
| **Strumline** | ukulele (GCEA re-entrant)          | mic test + detectors exist |
| **Singline**  | voice                              | playable (`#/sing`)        |
| **Windline**  | ocarina, recorder, penny whistle   | playable (`#/wind`)        |
| **Beatline**  | claps, taps, hand drums, kit, pads | playable (`#/beat`)        |

It's a static web app, built for Safari on iOS/iPadOS first and also tested in
desktop Chrome. You can install it as a PWA. There's no backend.

## Play / test

- **Main:** https://agallant.github.io/lineup/
- **PR previews:** https://agallant.github.io/lineup/pr-preview/pr-N/. A bot
  comments the exact link on each PR.

The footer shows which build you're looking at (`main` or `PR #N`, the commit
SHA and the build time). If it's stale, pull to refresh. GitHub Pages caches
HTML for up to 10 minutes.

To install it as an app on iPad: open it in Safari, tap Share, then **Add to
Home Screen**.

## Develop

Requires Node 22+. This is an npm-workspaces monorepo.

```sh
npm ci
npm run dev        # Vite dev server for apps/web
npm run check      # typecheck + lint + test + build + dist check (what CI runs)
npm test           # Vitest, all packages
npm run format     # Prettier
npm run e2e        # real-browser checks in headless Chromium (needs Playwright; not in CI)
```

Mic access needs a secure context (HTTPS or `localhost`).

## Layout

```
packages/
  core/      pure TypeScript, no DOM: notes, chart format, profiles, clock, calibration, judges, scoring
  input/     detectors (pitch, onset), analyzer, AudioWorklet, mic capture
  render/    canvas helpers and renderers
  testkit/   synthetic signals for tests (dev-only)
  sim/       headless end-to-end harness: synthetic player -> real pipeline -> score (dev-only)
apps/
  web/       the PWA: screens, router, styles, manifest, service worker
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for data flow and how each piece fits.

Design rules:

- Audio input is captured with echoCancellation, noiseSuppression and
  autoGainControl all off, and processed in an AudioWorklet.
- The game clock is `AudioContext.currentTime`. The renderer only reads it
  inside `requestAnimationFrame`.
- A calibrated input-latency offset is subtracted by the judge.
- DSP and the judge are pure and tested with synthetic audio, so tests don't
  need a mic.
- `packages/core` and `packages/testkit` are DOM-free, enforced by TypeScript
  (no DOM lib) and an ESLint rule.

## Singline (voice) on the iPad

`#/sing` (home screen -> Singline):

1. **Setup:** _Start mic_, sing a long "ah". You'll see the note, a clarity bar (green when
   the tracker is confident) and advice ("quiet", "clipping", "can't find a steady pitch").
2. **Headphones:** the guide tone and clicks play from the speaker and your mic hears them. Use
   headphones; _Check for speaker leak_ verifies it (stay quiet while it runs).
3. **Calibrate timing** (`#/calibrate`): say "ta" or clap on each click. The measured offset is
   saved on this device.
4. Pick a song and a **key** (the chart can be shifted +/-7 semitones; any octave of the
   right note counts). **Scoring** has three levels: _Easy_ (100 cent pitch window, short
   sustain is enough), _Normal_ (the default, 80 cents) and _Strict_ (60 cents, the profile's own
   numbers). _Debug overlay_ shows raw frequency, target, deviation, clarity, level,
   frame rate and the applied latency offset.
5. **Play.** _Watch auto-play demo_ runs a synthetic singer through the same pipeline: a
   quick way to see how the screens behave without singing.
6. On the results screen, **Copy session log** puts a plain-text report on the clipboard (build,
   audio latencies, options, score and every note's result). Paste it into the chat when something
   looks off. Beatline also has _Copy hit log_ next to the hit monitor.

## Windline (whistle, recorder, ocarina) on the iPad

`#/wind` (home screen -> Windline). It is Singline's pitch pipeline with a wind profile: range
G4 to C7, a shorter analysis window for high notes, and **octaves count** (a fingering has one
register, so an octave off is wrong, unlike singing).

1. **Start mic** and play a long steady note: you should see the note name and a green clarity
   bar. Hold the instrument a little to the side of the mic: a breath straight into it
   overloads it (the level meter warns about clipping).
2. Use **Key** to move the song to where your instrument plays (a D whistle: +2; a 12-hole
   ocarina or a soprano recorder: original key or +/-). Songs: a C major scale, Twinkle Twinkle,
   Ode to Joy, all within C5 to A5 before the key shift.
3. Use headphones (the guide tone is otherwise heard by the mic), calibrate timing if the first
   notes always feel early or late, pick **Scoring**, and **Play**. _Watch auto-play demo_
   plays a synthetic recorder through the same pipeline.

## Beatline (claps, taps, percussion) on the iPad

`#/beat` (home screen -> Beatline). Three modes: **Clap (any hit)**, one lane where any sound
counts; **Clap + tap**, two lanes where you teach it your two sounds first; **Drum kit**
(experimental, simulated only).

1. **Mic & hit monitor:** _Start mic_ and clap or tap. Every detected hit is listed (newest
   first) with its time, velocity, spectral centroid, low/mid/high energy %, decay, ZCR and the
   **lane it was put in** (`UNKNOWN` = the classifier did not recognise it; `d=` is its distance
   from the nearest enrolled sound, small is confident).
2. **Teach it my sounds** (two-lane mode): clap 6 times, then tap 6 times. It rejects double
   triggers, too-quiet hits and hits unlike your others, and warns if the two sounds are too
   alike. Saved per mode on this device.
3. **Check for click leak** with the metronome on: stay quiet; it plays four clicks and tells
   you if the mic hears them (use headphones, or the click scores for you).
4. Optionally **calibrate timing** (`#/calibrate`), pick a song, **Play**. _Debug overlay_ shows
   the monitor live. Hits flash on the "now" line in the lane they were classified into.
   _Watch auto-play demo_ plays a synthetic clapper through the same pipeline.

## Limitations (known)

- **Windline is simulation-verified only.** The wind profile and synthetic whistle/recorder/ocarina
  prove the software chain (high notes, chiff, drift, airy breath); a real whistle's shrill peaks,
  breath blasts into the mic and room reflections are untested.
- **Overlapping ringing notes confuse single-note pitch tracking.** Two notes
  sounding at once blend into one ambiguous pitch (659 Hz + 880 Hz reads as
  220 Hz). Timing is unaffected; pitch matching on wide leaps over ringing
  notes can be wrong. Covered by explicit "KNOWN LIMITATION" tests.
- **Very breathy or whispered singing loses notes.** Aspiration noise lowers
  pitch clarity below the gate (the clarity meter on the setup screen shows
  this). Clean and moderately breathy voices are fine; covered by a
  "KNOWN LIMITATION" test.
- **Speaker bleed gives free points.** If the guide tone leaks into the mic at a
  level the game can hear, a silent player scores. Use headphones; a
  headphones check measures leakage (`detectBleed`).
- **Layered drum hits are one hit.** Two drums struck at the same instant produce one onset and one
  lane; stagger them. (Test: "KNOWN LIMITATION: two drums struck at once".)
- **Steady room noise starts a false hit now and then** (measured about once per 30 s of loud pink
  noise in simulation). Strays only matter within 120 ms of a note.
- **Percussion bleed gives free points.** A click or backing track the mic can hear registers as
  hits (`detectClickBleed` checks it before a song). Use headphones.
- **Simulations are synthetic.** They prove the software chain; real strings,
  microphones, rooms and iOS audio behaviour are listed per PR under
  "Unverified on real hardware".

## Deploy

Everything goes through PRs. Nothing is pushed directly to `main`.

- `.github/workflows/ci.yml` runs typecheck, lint, test and build on every PR
  and on `main`.
- `.github/workflows/deploy.yml` builds `main` and publishes it to the root of
  the `gh-pages` branch. It leaves `pr-preview/` alone.
- `.github/workflows/preview.yml` builds each PR into `gh-pages:/pr-preview/pr-N/`,
  comments the URL on the PR, and deletes the preview when the PR closes. It
  uses [`rossjrw/pr-preview-action`](https://github.com/rossjrw/pr-preview-action).

`.nojekyll` lives only at the root of `gh-pages` (the deploy workflow adds it); previews don't
carry their own copy.

The Vite `base` (in `apps/web/vite.config.ts`) is `./` (relative), so one build works both at the site root
and in a preview subfolder. Routing uses hashes (`#/mic`) for the same reason.

**One-time setup (done in the GitHub UI):** Settings → Pages → Build and
deployment → Source: **Deploy from a branch** → `gh-pages` / `(root)`. The
`gh-pages` branch appears after the first preview or deploy run.

## Mic & latency test (`#/mic`)

This is the first check on a real device. It shows:

- the live waveform and input level (RMS and peak), with a clipping warning
- the detected pitch: note name, Hz, cents, the nearest open GCEA string, and clarity
- detected onsets (plucks and strums): a count, a flash, the velocity, and the
  delay from detection to the main thread
- the `AudioContext` sampleRate, baseLatency, outputLatency and state, plus the
  mic's own reported sampleRate, latency and channel count
- whether echo cancellation, noise suppression and AGC are actually off, as
  reported by `track.getSettings()`
- an input device picker and channel picker for multi-channel audio interfaces
- **Copy diagnostics**, which copies the details as JSON so you can paste them
  into a PR comment

How audio flows: mic → `MediaStreamSource` → `AudioWorkletNode` (`src/audio/worklet/`)
→ `InputAnalyzer` (pitch via `pitchy`, onsets via an energy-rise detector on the
signal's first difference) → `postMessage` → UI. An `AnalyserNode` taps the
source, but only to draw the waveform.

Automated coverage: unit tests on synthetic sine, additive-pluck and
Karplus-Strong signals at G4/C4/E4/A4 (44.1 and 48 kHz). The page has also been
smoke-tested in headless Chromium using a synthetic WAV as a fake mic.

## Verified on device

| What                                      | iPad Safari | iPad PWA | Desktop Chrome |
| ----------------------------------------- | ----------- | -------- | -------------- |
| Site loads from Pages                     | not yet     | not yet  | not yet        |
| Add to Home Screen + icon                 | not yet     | not yet  | n/a            |
| Footer shows correct build                | not yet     | not yet  | not yet        |
| Mic permission prompt + audio running     | not yet     | not yet  | not yet        |
| EC / NS / AGC reported off                | not yet     | not yet  | not yet        |
| Pitch correct on all 4 strings            | not yet     | not yet  | not yet        |
| One onset per pluck, one per strum        | not yet     | not yet  | not yet        |
| Audio interface selectable, right channel | not yet     | not yet  | not yet        |
