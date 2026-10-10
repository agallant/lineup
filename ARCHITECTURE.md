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
  (`feed`, `advance`, `finish`, `judgments`, `judgmentFor`). `DiscreteJudge` does
  onset timing (+ lane/pitch match). `ContinuousJudge` (voice, winds) takes `PitchFrame`s
  and scores each note by the **fraction of its sustain within N cents** of the
  target, after a late-entry check. It folds octaves (octave-forgiving), takes a
  _median_ over a short window so vibrato and stray frames don't count against
  you, ignores frames under the clarity/level gates, and exposes `peek()` for
  live "am I on pitch right now" feedback.
  `applyDifficulty(config, 'easy' | 'normal' | 'strict')` loosens the tolerance,
  timing windows and coverage thresholds on top of the profile's numbers (it never
  tightens one); the app stores the player's choice in settings, and simulations use
  the profile's own ("strict") numbers.
- **Voice** (`profiles/voice.json`): McLeod pitch tracker with a 2048-sample window
  and 256-sample hop, 70-1100 Hz, clarity gate 0.55, `foldIntoRange` (one octave
  only: hiss must not become a pitch), octave-forgiving continuous judging.
  `detectBleed` checks whether the speaker leaks into the mic (headphones check);
  `detectClickBleed` does the same for percussion with clicks and onsets.
- **Percussion** (Beatline): `PercussionAnalyzer` (in `InputAnalyzer` when the profile's input is
  `percussion`) runs `PercussionOnsetDetector` - 128-sample RMS frames against a delayed peak-hold
  envelope (600 dB/s release, so a sound's own tail never re-triggers) and a slow noise-floor
  estimate, one-to-two-frame confirmation, refined to the first sample past half the frame peak -
  and then `extractFeatures` over the 2048 samples after the attack: spectral centroid, low/mid/high
  band fractions (<400 Hz, 400-2500 Hz, >2500 Hz), decay time (-12 dB), zero-crossing rate, flatness.
  All are level-independent, so soft and loud versions of a sound classify alike. No pitch tracker
  runs. The onset is delivered ~43 ms after it happened (the feature window); the attack time is exact.
- **Timbre classification** (`timbre.ts`, `enrollment.ts`, `classify-event.ts`): nearest centroid on
  standardized features, with an "unknown" rejection radius per class (a cough or door slam is no
  note) and `MIN_SEPARATION` to warn when two enrolled sounds are too alike. `EnrollmentSession`
  collects N hits per class and rejects double triggers, too-quiet hits and outliers.
  `TimbreModelStore` persists the model per profile in localStorage behind try/catch. A
  single-class profile (`clap`) is a pure any-hit mode with no classification. Judges with
  `match.laneStrict` (hand-percussion, drum-kit) refuse hits with no lane (unknown sounds).
- **Calibration** (`calibration.ts`): `estimateOffset` finds the latency offset
  from clicks and responses; `CalibrationStore` persists it over an injected
  key-value store (no DOM in core).

## App layer (`apps/web`)

- `app/game/` holds the DOM-free game logic, each unit-tested: `SinglineGame` (analyzer
  messages -> judge input + pitch trail + render state + debug info), `backing`
  (count-in/metronome/guide-tone plan, scheduled on the audio clock), `calibration-run`,
  `mic-advice`, `session-log` (the copy-to-clipboard report). Screens (`app/screens/`) are thin DOM
  wrappers around these. `screens/pitch.ts` is the shared pitch game screen: `sing.ts` (voice) and
  `wind.ts` (whistle, recorder, ocarina) are just a config object each, so a new pitched
  instrument is a profile, songs, a synthetic performer and ~15 lines.
- **Input adapters** (`@lineup/input` `InputAdapter`): the game only needs a clock, a message
  callback and `close()`. `MicSession` (getUserMedia) and `SyntheticSession` (a rendered
  performance played into the same worklet) implement it; desktop MIDI/pad input can too.
- **Renderers** (`@lineup/render` `Renderer`): `draw(g, size, view)` where `view` = clock time,
  notes, per-note status, profile, and (pitched modes) trail/live feedback. `createRenderer`
  picks one from the profile; `pitch-highway` (voice, winds) and `percussion-lanes` (Beatline: per-lane
  colours, judged-note rings, hit flashes, grey bar for rejected sounds) exist; `lane-highway` is for Strumline.
- `BeatlineGame` / `HitMonitor` (`app/game/beatline-game.ts`): analyzer messages -> classified hits
  -> judge input + flashes + the debug text. `enroll-messages.ts` words each enrollment outcome.
- `npm run e2e` drives the built app in headless Chromium (demo player, calibration with a fake
  clapping mic, live-mic Singline, Windline demo, speaker-leak check; Beatline: demo players in both lane modes,
  live fake-mic enrollment + classification + persistence, click-leak check).

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
