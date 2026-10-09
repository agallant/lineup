# Architecture

Lineup is a set of rhythm games played with a real instrument. Everything runs
in the browser: no backend.

## Packages

| Package           | Depends on          | DOM? | Purpose                                                                        |
| ----------------- | ------------------- | ---- | ------------------------------------------------------------------------------ |
| `@lineup/core`    | none                | no   | Notes/tuning math, `InputEvent`. Later: chart, judge, scoring, clock, profiles |
| `@lineup/input`   | core, pitchy        | yes* | Pitch tracker, onset detector, `InputAnalyzer`, AudioWorklet, mic capture      |
| `@lineup/render`  | none                | yes  | Canvas helpers, scope/meter drawing. Later: lane/pitch/percussion renderers    |
| `@lineup/testkit` | none                | no   | Synthetic signals (sine, pluck, Karplus-Strong, noise) for tests               |
| `@lineup/web`     | core, input, render | yes  | The PWA: router, screens, styles, manifest, service worker                     |

\* `@lineup/input` is DOM-free except `@lineup/input/mic` (getUserMedia,
AudioContext, worklet loading). Node tests import only the DOM-free surface.

Workspace packages are consumed as TypeScript source (`exports` points at
`src/`), so there is no per-package build step. Vite and Vitest resolve them
through the npm workspace symlinks.

## Data flow (today)

```
mic ──getUserMedia(EC/NS/AGC off)──▶ MediaStreamSource
                                        │
                     AudioWorkletNode ◀─┤            AnalyserNode (waveform display only)
                     InputAnalyzer      │
                      ├─ OnsetDetector  │
                      └─ PitchTracker   ▼
                           postMessage { input: InputEvent | frame: AnalysisFrame }
                                        │
                                        ▼
                              apps/web screens (mic test)
```

All times are seconds on `AudioContext.currentTime`. Input events are
_uncorrected_; the judge subtracts the calibrated latency offset.

## Adding things

- **A test signal:** add it to `@lineup/testkit`; keep it deterministic (seeded).
- **Behaviour you must not change by accident:** `packages/input/src/characterization.*`
  holds golden values for the ukulele pipeline. Re-record only on purpose:
  `UPDATE_GOLDEN=1 npx vitest run characterization`, and call it out in the PR.

(Instrument profiles, chart format, judges and renderers are documented here as
they land in L1c onward.)
