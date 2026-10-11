# Lineup roadmap

Where the project is and where it is going. Updated with every milestone; the README says how to
use what exists, [ARCHITECTURE.md](ARCHITECTURE.md) how it is built.

## Done

- **Singline** (voice): sustained-pitch game, three scoring levels, key menu.
- **Windline** (whistles, recorders): the same pipeline with octave-strict judging; an
  instrument menu for tin whistles in seven keys, recorders, and a generic instrument whose key you set, songs moved into the
  instrument's key, fingering chart and in-play fingering strip, practice speed.
- **Beatline** (claps, taps, hand drums, kit): onset classification with a sound-training step.
- **Strumline** (ukulele): strum detection and chord recognition; four string lanes showing the fret
  to hold on each string (open strings are small rings); strums and plucked notes; chord checking;
  practice speed.
- **Exercises and random melodies** for Singline and Windline: scales, modes, thirds, arpeggios, long
  tones, and a seeded melody generator (scale, level, seed) in the song menu.
- **Chromatic fingerings** for whistles and recorders (half-holes and cross-fingerings), a chromatic
  scale exercise, and Greensleeves as the first song with sharps.
- **Product**: best scores, song info, offline start, session logs you can copy, end-to-end tests in CI.

## Development goals

### 1. More to play, in every mode

- **More songs** (all public domain or original): easy tunes first, a few harder ones. Melodies for
  Singline and Windline, chord songs and picking patterns for Strumline, rhythms for Beatline.
- **Scales and exercises** for every mode: scales and modes, thirds, arpeggios, pentatonics, long
  tones and interval ladders for voice and winds; scales, arpeggios and picking patterns on the
  ukulele; rhythm figures and rudiments (single strokes, doubles, paradiddles) for Beatline.
  Exercises are generated from small descriptions, so adding one is a few lines, not a hand-written
  chart. They are listed under "Exercises" next to each mode's songs.
- **Generative challenges**: a fresh piece every time, still musical. Each is built from a seed
  (shown, so you can replay or share it) and a difficulty:
  - _Melodies_ (done for Singline and Windline; ukulele picking to come): phrases of two bars in forms such as
    AABA, built on a scale with mostly stepwise motion, leaps that recover, strong beats on chord
    tones, a rest or long note at each phrase end, and a final cadence on the tonic.
  - _Chord songs_ (Strumline): progressions from common patterns (I–IV–V–I, I–V–vi–IV, I–vi–IV–V,
    ii–V–I…) in keys where every chord has a ukulele fingering, with strum or picking patterns that
    repeat and vary like real accompaniment.
  - _Grooves_ (Beatline): a repeating bar with a backbeat, variations and an occasional fill.
  - Tests measure "pleasing" with checkable properties over many seeds (range, step and leap
    ratios, repetition, phrase ends, cadence), because a bad piece is a bug.

### 2. Strumline and ukulele

- Use the vertical bars for **barre chords** (one finger holding several strings), which is a clearer
  meaning than the current "strum across the strings" bar (suggested from iPad testing).
- Hear **which string and fret** is played (per-note pitch tracking on top of the strum detector), so a
  plucked note can be judged on pitch, not just timing.
- Strum direction (down or up) is not detected reliably yet.

### 3. Beatline

- Tell sounds apart beyond clap and tap: shaker versus tambourine or jingle, hand-drum tones. Needs
  training the app on your own sounds.

### 4. Quality and plumbing

- Real-device verification: whistles, recorders, ukuleles, hand drums and the iPad
  microphone have only been tried as simulated sounds. The fingering tables need checking against
  your instruments.
- Accessibility audit (VoiceOver, contrast, touch targets).
- Docstring coverage (CodeRabbit reports about 61% against an 80% target).

## How each milestone ships

One pull request per milestone, reviewed by CodeRabbit and merged only on a real approval with CI
green. Each PR lists what was verified in simulation, what is unverified on real hardware, and what to
try on the iPad.
