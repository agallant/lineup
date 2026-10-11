# Lineup roadmap

Where the project is and where it is going. Updated with every milestone; the README says how to
use what exists, [ARCHITECTURE.md](ARCHITECTURE.md) how it is built.

## Done

- **Singline** (voice): sustained-pitch game, three scoring levels, key menu.
- **Windline** (whistles, recorders): the same pipeline, with the right note counting in any octave by default (strict octaves are an option); an
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
- **A song library** written in small text notations: six easy tunes each for Singline and Windline,
  five ukulele chord songs and three picked melodies, and clap, hand and drum-kit rhythms.
- **Random chord songs, picked melodies and grooves** for Strumline and Beatline, rhythm and
  ukulele scale exercises, with the same seed, level and "New song" controls.
- **Windline octave handling**: by default the right note counts in whatever octave you play it
  (low whistle, alto recorder, second octave); strict octaves are an option.
- **Difficulty ratings and diatonic/chromatic labels** on every song and exercise (menus sorted easiest
  first).
- **Easier and harder versions** of any song, exercise or random song.
- **Home, scoreboard and options**: home menu in sections (games, progress, set-up tools, options);
  scoreboard of personal bests with stars; XP, levels, day streaks and trophies; an options screen with
  backup and restore; mixed-difficulty versions; play-along bass and chords; a daily challenge per game;
  practising one phrase of a song at a time.
- **Product**: best scores, song info, offline start, session logs you can copy, end-to-end tests in CI.

## Development goals

In the order I am working through them; each is one or more pull requests. Anything that needs a
real instrument to judge is listed again under "Waiting on real-device testing".

### 1. More to play, in every mode (ongoing)

- **Difficulty and labels** (done): every song, exercise and random song is rated from its chart
  (Beginner to Expert, 1 to 10); melodies are also labelled diatonic or chromatic (other kinds of song
  have no such label), since instruments differ in what they can play.
- **Song variations** (done): any song can be made **easier** or **harder** (generated from the song
  and a seed): fewer or more passing notes, simpler or busier strum patterns, plainer or more
  syncopated grooves; the difficulty score changes with it. **Aim for** a difficulty (1 to 10) next to
  "New song" finds a random song near it. The **Mixed** version takes each phrase from the easier, original or harder version.
- **More generators, not just more songs** (chord songs now cover waltz time and five keys): new forms
  and levels for random melodies and grooves; play-along backing
  for melodies.
- **More songs**: easy tunes first, then harder and chromatic ones, in every mode. Public domain or
  original.
- Tests measure "pleasing" with checkable properties over many seeds, because a bad piece is a bug.

### 2. Strumline and ukulele

- ~~Barre bars~~, ~~waltz random songs~~, ~~more chords (Bm, B♭, Gm, Cm, F♯m, E, E7, B7) and keys (F, A)~~: done.
- The simulated ukulele still misses the odd strum on a new chord a beat after another chord, and
  near-identical shapes (Am/Am7, A/F♯m) are not told apart in one song; both are analyzer limits.
- Hear **which string and fret** is played, so a plucked note can be judged on pitch, not just timing.
- Strum **direction** (down or up) detection, which is not reliable yet.

### 3. Windline

- ~~The C♯ below the upper D on the recorder chart~~ (done); the notes above the upper D are still left to your recorder's own chart.
- More songs, including chromatic ones (Für Elise opening, Greensleeves), labelled so you can tell
  what your instrument can play. Songs below a whistle's tonic are voice-only.
- An ocarina only if a fingering chart can be shown (no ocarina offered until then).
- If testing shows it: move the chart to the octave you play, instead of accepting any octave.

### 4. Singline

- Added: fourths, fifths and octave-leap exercises, a range finder, Auld Lang Syne and Amazing Grace. Still to come: harder songs and exercises that adapt to the range you find.

### 5. Beatline

- Added: paradiddle-diddle, boom-boom-clap, disco, snare triplets, tresillo, son clave and a funk groove. Still to come: harder grooves.
- Tell sounds apart beyond clap and tap: shaker versus tambourine or jingle, hand-drum tones. Needs
  training the app on your own sounds.

### 6. Quality and plumbing

- Accessibility: audited by reading (labels on every control, 44px touch targets, visible focus,
  contrast, reduced motion); a real VoiceOver pass on the iPad is still to do.
- Docstring coverage (CodeRabbit reports about 61% against an 80% target).

### Waiting on real-device testing

- Windline: the any-octave default; the sharps and flats on the whistle and recorder charts (they
  vary between instruments).
- Whether the random songs sound pleasing; Strumline and Beatline random songs with real playing.
- Whistles, recorders, ukuleles, hand drums and the iPad microphone have only been tried as simulated
  sounds.

## How each milestone ships

One pull request per milestone, reviewed by CodeRabbit and merged only on a real approval with CI
green. Each PR lists what was verified in simulation, what is unverified on real hardware, and what to
try on the iPad.
