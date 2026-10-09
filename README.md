# Lineup

An umbrella platform of rhythm games (DDR / Elite Beat Agents / SingStar style)
that you play by performing on a real instrument. One mode per instrument family:

| Mode          | Instrument                         | Status                     |
| ------------- | ---------------------------------- | -------------------------- |
| **Strumline** | ukulele (GCEA re-entrant)          | mic test + detectors exist |
| **Singline**  | voice                              | planned (L2)               |
| **Windline**  | ocarina, recorder, penny whistle   | planned (L3, later)        |
| **Beatline**  | claps, taps, hand drums, kit, pads | planned (L4)               |

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

## Limitations (known)

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
