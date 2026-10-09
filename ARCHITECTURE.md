# Architecture

Lineup is a set of rhythm games played with a real instrument. Everything runs
in the browser: no backend.

## Packages

| Package           | Depends on           | DOM? | Purpose                                                                                                                                     |
| ----------------- | -------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lineup/core`    | none                 | no   | Notes/tuning math, `InputEvent`, chart format + loader, instrument profiles, `SongClock`, calibration math, judges, scoring, built-in songs |
| `@lineup/input`   | core, pitchy         | yes* | Pitch tracker, onset detector, `InputAnalyzer`, onset-to-pitch attacher, AudioWorklet, mic capture                                          |
| `@lineup/render`  | none                 | yes  | Canvas helpers, scope/meter drawing. Later: lane/pitch/percussion renderers                                                                 |
| `@lineup/testkit` | none                 | no   | Deterministic synthetic signals: sine, pluck, Karplus-Strong, ukulele strums/notes, room noise                                              |
| `@lineup/sim`     | core, input, testkit | yes† | Headless end-to-end harness: performs a chart as audio, runs the real pipeline, returns judgments and score                                 |
| `@lineup/web`     | core, input, render  | yes  | The PWA: router, screens, styles, manifest, service worker                                                                                  |

\* `@lineup/input` is DOM-free except `@lineup/input/mic` (getUserMedia,
AudioContext, worklet loading). Node tests import only the DOM-free surface.
† test tooling only; it needs the DOM _types_ because it imports `@lineup/input`.

Workspace packages are consumed as TypeScript source (`exports` points at
`src/`), so there is no per-package build step. Vite and Vitest resolve them
through the npm workspace symlinks.

## Data flow

```
mic ──getUserMedia(EC/NS/AGC off)──▶ MediaStreamSource
                                        │
                     AudioWorkletNode ◀─┤            AnalyserNode (waveform display only)
                     InputAnalyzer      │
                      ├─ OnsetDetector  │
                      └─ PitchTracker   ▼
                           postMessage { input: InputEvent | frame: AnalysisFrame }
                                        │
                  (pitch-matched modes) OnsetPitchAttacher: waits ~140 ms after an onset,
                                        attaches the median pitch, keeps the onset time
                                        │
                  SongClock.toSongTime  ▼   (AudioContext time -> song time)
                                     Judge.feed(input)           game loop, each frame:
                                        │                        judge.advance(clock.now())
                                        ▼                                │
                                   Judgments ──▶ Scoreboard ◀────────────┘
```

All times are seconds. Detectors stamp events on the `AudioContext` clock
(uncorrected for latency). The app converts to **song time** with `SongClock`
(0 = first beat after the count-in; negative during the count-in). Judges work
in song time and subtract the calibrated latency offset themselves.

## Core concepts

- **Chart** (`chart.ts`, `chart.v1.schema.json`): instrument-agnostic
  `{t, duration, lane?, pitch?, expected?}` notes + metadata. Pitched notes
  store _concert_ MIDI pitch; percussion stores lane ids. Loader returns
  `{ok, value, warnings}` or `{ok: false, errors}` with phone-readable messages.
  Bumping the format means bumping `CHART_VERSION` and adding a migration.
- **Instrument profile** (`profile.ts`, `profiles/*.json`): everything that makes
  an instrument different - input kind, renderer, range, transposition, tuning,
  lanes, detector settings, judgment settings. Validated at load.
- **Judge** (`judge/`): a pure state machine behind one interface
  (`feed`, `advance`, `finish`, `judgments`). `DiscreteJudge` does onset timing
  (+ lane/pitch match). A continuous judge for sustained pitch arrives with voice.
- **Calibration** (`calibration.ts`): `estimateOffset` finds the latency offset
  from clicks and responses; `CalibrationStore` persists it over an injected
  key-value store (no DOM in core).

## Testing strategy

1. **Unit tests**, table-driven where there are many cases.
2. **Characterization tests** (`packages/input/src/characterization.*`): golden
   values for the ukulele pipeline. Re-record only on purpose:
   `UPDATE_GOLDEN=1 npx vitest run characterization`, and call it out in the PR.
3. **Simulation tests** (`packages/sim`): a synthetic player performs a chart
   (configurable latency, jitter, skipped/wrong notes, noise); the real
   analyzer -> clock -> judge -> scoreboard chain judges it. This proves the
   software, not the instrument: it cannot vouch for real strings, real
   microphones or Safari quirks.

## Adding things

- **An instrument profile:** add `profiles/<id>.json`, register it in
  `profiles/index.ts`, add a built-in song in `songs/` if it has one, add a
  `Performer` in `packages/sim/src/performers.ts`, and a `*.sim.test.ts` that
  plays the song and asserts the score.
- **A test signal:** add it to `@lineup/testkit`; keep it deterministic (seeded).
- **Behaviour you must not change by accident:** `packages/input/src/characterization.*`.

(Renderers and the continuous judge are documented here as they land.)
