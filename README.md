# Lineup

An umbrella platform of rhythm games (DDR / Elite Beat Agents / SingStar style)
that you play by performing on a real instrument. One mode per instrument family:

| Mode          | Instrument                         | Status               |
| ------------- | ---------------------------------- | -------------------- |
| **Strumline** | ukulele (GCEA re-entrant)          | playable (`#/strum`) |
| **Singline**  | voice                              | playable (`#/sing`)  |
| **Windline**  | recorder, tin whistle              | playable (`#/wind`)  |
| **Beatline**  | claps, taps, hand drums, kit, pads | playable (`#/beat`)  |

It's a static web app, built for Safari on iOS/iPadOS first and also tested in
desktop Chrome. You can install it as a PWA. There's no backend. Where it is going next:
[ROADMAP.md](ROADMAP.md).

## Play / test

- **Main:** https://agallant.github.io/lineup/
- **PR previews:** https://agallant.github.io/lineup/pr-preview/pr-N/. A bot
  comments the exact link on each PR.

The footer shows which build you're looking at (`main` or `PR #N`, the commit
SHA and the build time). If it's stale, pull to refresh. GitHub Pages caches
HTML for up to 10 minutes.

To install it as an app on iPad: open it in Safari, tap Share, then **Add to
Home Screen**.

**Offline:** after one visit the app starts without a network (a service worker keeps a copy of the
files the page used, including the audio worklet, and still prefers the network when there is one,
so new deploys show up straight away).

**Scores:** each song keeps its best score on this device, per scoring level (Singline, Windline)
or per practice speed and chord checking (Strumline). The results screen says "New best!" or shows
the current best; the auto-play demo never counts.

## Develop

Requires Node 22+. This is an npm-workspaces monorepo.

```sh
npm ci
npm run dev        # Vite dev server for apps/web
npm run check      # typecheck + lint + test + build + dist check (what CI runs)
npm test           # Vitest, all packages
npm run format     # Prettier
npm run e2e        # real-browser checks in headless Chromium (needs Playwright; CI runs it as its own job),
                   # including an axe-core accessibility audit of every screen in three colour schemes
node scripts/check-dist.mjs   # after a build: relative paths, and a size budget (160 KB gzipped)
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

## Difficulty and diatonic or chromatic

Every song, exercise and random song shows how hard it is, worked out from the chart itself:
**Beginner, Easy, Medium, Hard or Expert** with stars, and a score out of 10 in the song info. A
melody's score looks at tempo, how many short notes, range, leaps and sharps/flats; a chord song's at
how many chords, how often they change and how busy the strumming is; a rhythm's at speed,
syncopation, finer divisions and how many sounds it uses. Songs are listed easiest first.

Melodies are also labelled **diatonic** (every note in the major scale of the song's key: any
diatonic instrument such as a tin whistle can play it in its own key) or **chromatic** (it has sharps
or flats, which need half-holes or cross-fingerings on a whistle or recorder, and a chromatic
instrument, a voice or a ukulele).

## Easier and harder versions

Next to the song menu, **Version** plays any song, exercise or random song as written, or as a
plainer or busier version made from it (the same every time, so scores compare):

- **Melodies** (voice, winds, plucked ukulele): _Easier_ replaces sharps and flats with scale notes
  (so a chromatic song becomes diatonic), merges quick notes into longer ones and is 15% slower.
  _Harder_ fills in a passing note where the melody leaps a third, gives some long notes a turn (the
  note above, then back) and is 15% faster.
- **Chord songs**: _Easier_ keeps the strokes on the beat, drops sevenths (G7 becomes G) and is 15% slower;
  _Harder_ adds up-strokes where the same chord carries on, and is 10% faster.
- **Rhythms**: _Easier_ keeps the hits on the beat and is 15% slower; _Harder_ adds hits between the
  beats (never straight after a kick) at the same tempo.

- **Mixed** takes each phrase (four bars, two in a short song) from the easier, the original or the
  harder version, chosen from a seed (never all the same), at the song's own tempo: good for
  practising the jump between plain and busy.

The difficulty in the song info changes with the version, and best scores are kept per version.

## Home, scoreboard, options and backing music

All of this stays on the device (browser storage); nothing is sent anywhere.

- **Home** groups the games (the four instruments and ear training) under _Play_, the scoreboard under _Progress_, and the timing
  calibration and the mic and latency test under _Set up_ (they are tools, not games), with your level
  and streak on top.
- **Today's challenge**: one random song per game per day (the same for everyone, no network: it
  comes from the date), on the home menu. Reach 60% for +50 XP, once per game per day.
- **Listen first** (Singline, Windline, and Beatline as an alternative to call and response): the song is played once (as tones, or ticks for a rhythm), then you play it back
  from memory (best with a short Part).
- **Part**: next to Version, practise one phrase of a song (four bars, two in a short song) on its own;
  best scores are kept per part.
- **My songs** (`#/make`, under Make): write a melody, a chord song or a rhythm as text (note names
  like `E4:2`, chords like `C | Am | F | G`, lanes like `kick: x...x...`); it is checked as you type,
  rated like any other song, and joins the song menus of the games that suit it (a melody goes to
  Singline, and to Windline when no note is below the key note). Songs are kept on the device and
  included in the backup file. A melody can be moved to another key (semitone or octave buttons),
  given words (one syllable per note, shown under the notes while you sing), and a tune in **ABC
  notation** can be pasted in and read (key, tempo, lengths, accidentals, ties, triplets, words;
  chords, decorations and repeat marks are skipped). **Copy as text** turns any song into a block
  you can send in a message and paste into _Paste a song_ on another device.
- **Bassline** (`#/bass`): learn the bass guitar. Songs and exercises are shown as four string lanes
  (G, D, A, E from the top) with the fret to hold on each note; both the note and the timing are judged,
  any octave of the right note counting (a phone mic often hears a bass an octave off). There are blues,
  pop and rock lines in several keys (whole notes, quarters, eighths, root and fifth, walking, disco
  octaves, funk), a few hand-written lines and exercises (open strings, one finger a fret, pentatonic and
  major scales, string crossing). Speed, the drum loop and the first-time tips work as in Strumline. The
  tuner has a bass tuning (E A D G) that listens lower than for other instruments. A Learn path walks
  from open strings to a funk groove.
- **Tuner** (`#/tuner`): a universal tuner for any single note (voice, whistle, flute, strings), with the note,
  Hz and cents and a smooth needle. Tap a note to hold a **reference tone** (any note in an octave, or the
  strings of the instrument), and set the reference pitch (A = 415 to 466 Hz). Ukulele (three tunings),
  guitar (standard, drop D, DADGAD, open G) and bass modes have their strings.
- **Metronome** (`#/metronome`): tempo from 20 to 300 bpm (big − and +, hold to repeat, a slider, tap
  tempo, typed), one to twelve beats a bar where each beat can be strong, normal, soft or silent,
  subdivisions (eighths, triplets, sixteenths, swing), four sounds, volume, a **speed trainer** (change the
  tempo every few bars toward a target) and saved presets. Clicks are scheduled ahead on the audio clock so
  the beat stays steady, and the screen stays awake while it runs.
- **Guitar** (Strumline, a choice at the top of the setup page, like Windline's instrument): the six-string
  guitar in standard tuning plays the ukulele's songs with guitar chords and picks melodies on its own
  strings, shown on six string lines. The tuner has standard, drop D, DADGAD and open G. Other tunings in
  the game itself come later.
- **Beginner mode** (Singline, Windline, Bassline and Keyline, an option on the setup page): no timing at all. Each note of the
  song is shown on the line and played; sing or play it back and hold it to move on, or skip it. Stars come
  from the notes passed.
- **Keyline** (`#/keys`): learn the keyboard. Notes fall onto a piano keyboard and you press the key as each
  reaches it; chords are several notes at once, judged note by note. Play on a **MIDI keyboard** (Web MIDI:
  Chrome and Edge; Safari on iPad has none), on the on-screen keys (touch, several fingers at once) or on the
  computer keyboard (A S D F G H J K and W E T Y U O P; Z and X change octave). Pieces for both hands,
  chord pieces and exercises (five fingers, scales, arpeggios, hands apart, black keys), with a Learn path.
  The pitch is read from the key, so there is no microphone and no octave forgiveness: the right key counts.
- **Voice range** (Options, Singline): say your voice type and each song gets a line about how it sits
  in it ("sits well", "an octave lower is easier"), and the guide tone plays in your octave; any
  octave of the right note still counts.
- **Staff view** (Singline, Windline): _View_ switches the scrolling bars to written music on a
  treble or bass staff, with the notes coloured as you play them. _Show note names_ can be turned off
  to practise reading the staff.
- **Call and response** (Beatline): each bar of a rhythm is ticked out and then asked of you, bar by
  bar, instead of the whole rhythm at once. It replaces _Listen first_ (one at a time).
- **Song packs** (`#/packs`): themed sets across all the games (campfire, lullabies, waltz time,
  pentatonic calm, rhythm kitchen, a gentle start, beyond the white notes, challenge), each song opening
  in its game; your own songs can be shared as a pack from My songs.
- **MIDI** (My songs): open a `.mid` file and pick a track to turn it into a melody or a drum-kit
  rhythm (the highest note of each chord is kept, timing is moved to a sixteenth or triplet grid, long
  files are cut), and save any song as a `.mid` file for a music program.
- **Tips**: each game shows three short lines of help the first time, until dismissed. Options >
  _Start over_ erases everything the app keeps on the device, for testing from scratch.
- **Duet** (Singline, Windline): on a song with at least two phrases, _Duet_ lets two players take
  turns, phrase by phrase, on one device; the screen says whose turn it is and the results give each
  player their notes hit and a winner (or a tie). It is filed as its own score.
- **Free play** (`#/free`, under Make): a metronome (30 to 240 beats a minute, accented first beat,
  2, 3, 4 or 6 to the bar) and a recorded take with a one-bar count-in, played back on the device and
  optionally saved as a file. Nothing is uploaded; a take is gone when you leave unless saved.
- **Plucked notes by pitch** (Strumline, experimental): on a picked melody or ukulele exercise, _Also
  check the pitch of each plucked note_ judges the string you play as well as the timing; a wrong note
  is a miss ("Wrong note" in the results). It uses the same pitch detector as Windline.
- **Ear training** (`#/ear`): ten questions, no instrument or microphone: name the interval between
  two notes, the kind of chord (major, minor, dominant 7th...), or _name that note_ (hear the key, then
  which note of it is this: do, re, mi...), at three levels; stars, XP and the scoreboard work as in
  the other games.
- **Tempo ladder** (Windline): a clean run (90% or better) at 65%, 80% and then full speed climbs a
  song's ladder; the results show which rungs are cleared, and climbing a whole ladder earns a trophy.
  Interval singing (fourths, fifths, octaves with _Listen first_) and the chord-change drills are
  exercises in the song menus.
- **Tuner** (`#/tuner`, under Set up): ukulele (G C E A), low-G and baritone tunings or any note, with
  a needle and reference tones. A tool, not a game.
- **Practice goal**: pick minutes per week in Options; the home menu and scoreboard show the last
  seven and fourteen days.
- **Up next** (home): a card pointing at the open step of the learning path you played most recently.
- **Learn** (`#/learn`): seven short paths (Singline, Windline, scales and modes for each, ukulele chords, clap rhythm, drum kit) of
  songs and exercises in order of difficulty. A step opens when the one before has a star (60%) and is
  mastered at two (80%); each step opens its game with the song already chosen.
- **Scoreboard** (`#/scores`) lists your best score on every song with stars (★ 60%, ★★ 80%, ★★★ 95%
  accuracy), filtered by game and sorted by newest, highest score, most stars or hardest song.
- **Progress**: every finished song earns XP (more for accuracy and for harder songs, plus a bonus for
  a clean run and for the first song of the day), which raises your level; playing on days in a row
  builds a streak; trophies (First notes, Flawless, Sharps and flats, Full band...) are earned once.
  The auto-play demo earns nothing.
- **Streak freezes and a rest day**: for every week of an unbroken streak you earn a **streak
  freeze** (two at most are banked, shown as ❄ on Home); if you then miss exactly one day, the next
  time you play a freeze covers it and the streak carries on (a freeze never counts as a day played,
  and two missed days still break it). A **rest day** chosen under Options (Practice goal) is a
  weekday that never breaks a streak.
- **This week's theme** (Home): a themed week the same for everyone, on top of the daily challenge:
  waltz, pentatonic, slow and steady (practice speed 80% or less), fresh songs, surprise (random
  songs), ear training, rhythm, challenge (songs rated 6 or more) or exercise week. Clear the goal
  (usually three matching songs at 60% or better) for +100 XP and the _Theme of the week_ trophy.
- **Collection** (`#/collection`): every song and exercise by group (Singline songs, Windline
  flute songs, Strumline exercises, ...) with the ones you have cleared with three stars (playing the
  whole song as written); a group earns a **bronze** medal at a quarter of it, **silver** at half and
  **gold** when all are cleared, with the trophies _Collector_ and _Curator_.
- **Records**: the scoreboard also lists when your bests were set and what each improved on.
- **How to play** (`#/help`): what each game is, scoring, progress and privacy, in a page.
- **Options** (`#/options`): colours (dark, light, high contrast), metronome, guide tone, jingles, play-along backing, weekly goal, text size, scoring strictness, Windline
  octaves and fingerings, chord checking, the debug overlay; reset options, erase scores or progress
  (two taps), and save or restore a **backup file** of everything the app keeps.
- **Drum loop** (Options, off by default): a quiet _rock_ or _bossa nova_ beat under Singline, Windline and Strumline songs (a waltz gets a kick and two ticks). Beatline never plays it, since the mic would hear it.
- **Play-along backing** (Options, off by default): quiet music under a song, for headphones. _Bass
  line_ plays the root of each bar's chord (and the fifth half way through); _Bass and chords_ adds
  the chord softly. A chord song uses its own chords; a melody is harmonised a bar at a time from the
  notes in the bar (I, ii, iii, IV, V or vi of its key), ending at home; a rhythm gets none.

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
   The menu lists **Songs** and **Exercises**: scales and modes (major, natural minor, dorian,
   mixolydian, the pentatonics, the chromatic scale), thirds, 1-2-3-1 patterns, arpeggios, long tones and an interval
   ladder. Exercises are built from small descriptions in the code, not hand-written charts.
   **🎲 Random melody** (under "Random") makes a new tune from a seed: pick a scale and a level
   (easy, medium, hard), press _New melody_ for another, or type a seed to play one again. The seed
   is shown in the song info; the same seed, scale and level always give the same melody. Best
   scores are kept per seed.
5. **Play.** _Watch auto-play demo_ runs a synthetic singer through the same pipeline: a
   quick way to see how the screens behave without singing.
6. On the results screen, **Copy session log** puts a plain-text report on the clipboard (build,
   audio latencies, options, score and every note's result). Paste it into the chat when something
   looks off. Beatline also has _Copy hit log_ next to the hit monitor.

## Strumline (ukulele) on the iPad

`#/strum` (home screen -> Strumline). The song scrolls toward the now line on **four lines, one per
string** (A on top, then E, C, G, like written tab). The number on a line is **the fret to hold on that
string**; an open string has no number, just a small hollow ring. A bar across the strings is a
strum, so a chord shows as its fingering; a single mark is a plucked note. The chord name and the stroke direction are
written above. **The timing of each note is what is judged** (and optionally the chord of a strum);
the direction arrow is a guide, since direction is not detected (see Limitations).

1. **Start mic** and strum: each strum is listed with the chord it was heard as (when chord
   checking is on). Hold the ukulele a little away from the mic; a very loud strum right at the mic clips.
2. Pick a song (_Four chords_ is C Am F G, _Folk strum_ is G C D, _Picking_ is a slow
   fingerpicking pattern over C Am F G, one string at a time) and a **Speed** (50% to 100%) to
   practise slowly. The chart's frets and chord names stay the same. A plucked note is judged on
   timing only: Lineup hears that you played, not which string or fret.
   More songs: chord songs (fifties progression, Skip to My Lou, 12-bar blues, a waltz, a minor
   one), three melodies to pick (Hot Cross Buns, Mary Had a Little Lamb, Ode to Joy), and
   **Exercises**: eight chord-change drills (two chords alternating, the changes coming faster as it goes), major, dorian and pentatonic scales, thirds, arpeggios, long tones and a chromatic
   scale, plucked on single strings. Under "Random": **🎲 Random chord song** (sixteen bars in four
   phrases such as A A′ B A′, the chords walked fresh from a grammar of how chords usually move
   (so two songs are rarely alike), in C, G or D at the easy level and also F or A above it, the
   strum pattern changing for the contrast phrase, a turnaround every four bars, ending at home),
   **🎲 Random waltz (3/4)** (the same in three beats to the bar, counted in with three clicks) and **🎲 Random melody (picked)**. Pick a
   level (and optionally **Aim for** a difficulty from 1 to 10), press _New song_ or type a seed to replay one; the seed is shown in the song info.
3. **Also check the chords** (off by default, experimental): the analyzer is told which chords the
   song uses and a strum of a clearly different chord misses ("wrong chord" is counted on the results
   screen). A strum it cannot name still counts for timing. Turn it off if it penalises you unfairly
   and send me the session log.
4. Use headphones for the metronome, check for a click leak, calibrate timing, **Play**. _Watch
   auto-play demo_ plays a synthetic ukulele through the same pipeline.

## Windline (whistle, recorder, pentatonic flutes) on the iPad

`#/wind` (home screen -> Windline). It is Singline's pitch pipeline with a wind profile: range
C4 to C7, a shorter analysis window for high notes, and an **Octave** option: by default the right
note counts in any octave (so a low whistle or a second octave works, as in singing); choose
_exactly the octave shown_ and an octave off is wrong, since a fingering has one register.

1. **Start mic** and play a long steady note: you should see the note name and a green clarity
   bar. Hold the instrument a little to the side of the mic: a breath straight into it
   overloads it (the level meter warns about clipping).
2. Pick your **Instrument**. The default is a **generic** diatonic instrument in C: choose its
   **Key** yourself (+2 is a D whistle; there is no fingering chart for it). Or pick a **preset**: tin whistles in D, C, B-flat, A, G, F
   and E-flat, a low D whistle, or soprano, alto, tenor and sopranino recorders. Whistles and
   recorders are diatonic, so **the song is moved into the instrument's key** (a C-major song becomes
   D major on a D whistle) and its notes then use only the instrument's own scale. On a preset,
   _Extra shift_ nudges it further (an octave problem, or a lower or higher register) and starts at
   None whenever you change instrument. **Octave** (under Options) defaults to _any octave_: the
   right note counts in whatever octave you play it, so a low whistle, an alto recorder or a second
   octave all work, and the range warning checks the octave that suits the instrument. Choose _exactly
   the octave shown_ if you want the strict version (best scores are kept separately for each). A warning appears if some notes fall outside the
   instrument's range or have no fingering in its chart.
3. The **fingering chart** lists the instrument's scale with the holes drawn (filled = covered),
   the notes of the chosen song highlighted, and "blow harder" for a whistle's second octave. While
   playing, the **current and next note's fingering** are shown under the highway (switch it off under
   Options). Set **Speed** to 50 to 80% to learn a song slowly: with the fingerings on, that is a
   learning mode.
4. Use headphones (the guide tone is otherwise heard by the mic), calibrate timing if the first
   notes always feel early or late, pick **Scoring**, and **Play**. _Watch auto-play demo_
   plays a synthetic recorder through the same pipeline.

**Pentatonic flutes** (a Native American flute, a shakuhachi): in the **Instrument** menu, under
_Pentatonic flutes_. Their scale is the minor pentatonic on the lowest note (A, C, D, E, G on an A
flute), so there are no sharps and flats to learn and the notes of a song are the same five in any key.
Choose a key: Native American flutes in A, G, F♯, F, E, D and C minor (a six-hole flute, whose chart
shows the holes opening one at a time from the bottom), or a shakuhachi 1.8 (D), 1.6 (E) or 2.1 (C),
whose notes are shown by their traditional syllables Ro Tsu Re Chi Ri (no hole diagram, because the
half-hole and meri fingerings differ between schools: use your teacher's chart). A pentatonic flute
plays a song in its easy first register where it fits; the upper register is marked "blow harder".
On one of these instruments the song menu starts with **Pentatonic flute songs** (eight slow original
pieces of long notes and breaths, from three notes to the upper register, in a minor and a major
mood) and offers **🎲 Random flute song**: four phrases with a breath between, pausing on the fifth
and coming home to a long held note, in the minor or major pentatonic scale at three levels. Any
other song is still on the menu; notes outside the scale show the usual warning. Under Options, a
**Windline drone** holds the key note (or the key note and its fifth) low under the whole song,
starting with the count-in, the way these flutes are played. There is a Learn path for them
(_Windline: pentatonic flutes_).

**Exercises** (under the song menu): the same scales, modes, thirds, patterns, arpeggios, long
tones, interval ladder and a chromatic scale (to practise the sharps and flats) as Singline, in the instrument's key. Every one fits every whistle; the
minor, mixolydian and minor-pentatonic ones run above a recorder's range, where
the range warning appears.

**🎲 Random melody**: as in Singline, in the instrument's key. In a major key, every random
melody fits every whistle.

Songs: a C major scale, Twinkle Twinkle, Ode to Joy (written in C, all within C5 to A5 before the
move into your key), and the Greensleeves verse, which has sharps (F♯ and G♯): the chart shows how
to finger them. It spans more than a recorder's range, so a recorder shows the range warning.
There are six more easy tunes (Hot Cross Buns, Mary Had a Little Lamb, Row Row Row Your Boat,
Frère Jacques, Jingle Bells, Silent Night) in the same list for Singline and Windline; Silent Night
is also wider than a recorder's range.

**About the fingerings:** they are the standard six-hole whistle fingerings (the same by scale degree
in every key) and the Baroque (English) recorder fingerings. The chart lists **every semitone**.
Sharps and flats (grey rows) are the commonly taught half-holes (a hole only partly covered, drawn
half filled) and cross-fingerings (a hole left open above covered ones). **These vary between
instruments** and I could not check them against a real whistle or recorder, so check them against
your own instrument's chart and tell me which are wrong. The recorder chart stops at the upper D,
and leaves out the C♯ just below it. There is no ocarina: its fingerings differ between makers, so
there is no chart to show.

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
5. More to play: rhythms for each mode (a gallop, off the beat, a waltz, call and response, a
   heartbeat, disco, a shuffle, a rock beat with a fill, half-time), **Exercises** (single and
   double strokes, a paradiddle and triplets with clap as the right hand and tap as the left; kick
   and snare practice; steady quarters, eighths and syncopation for one clap), and
   **🎲 Random groove**: eight bars with a main bar that repeats, a variation, a fill every four
   bars and a closing hit. Choose a level, press _New song_ or type a seed to replay one. Rhythms
   have one sound at a time: the microphone hears one hit per moment, so two drums never land together.

## Limitations (known)

- **Strokes close behind a different drum or chord can be missed.** In simulation the analyzer
  sometimes misses a strum that comes half a beat (about 0.3 s at 90 bpm) after a strum of another
  chord, and a hi-hat that comes that soon after a kick. The random songs and the library avoid those
  spots (no last stroke before a chord change; the faster grooves are slowed down), so your own
  playing is the real test. Tell me if a real ukulele or drum shows the same. In the harder random
  chord songs the simulated ukulele still has the occasional strum on a new chord missed (about
  2 to 5 in a hundred), for some chords; I have not found why yet.

- **Strumline chord recognition is simulation-verified only.** A synthetic ukulele (Karplus-Strong
  strings) is recognised in all twelve fingerings, in room noise and at 44.1 and 48 kHz, but a real
  ukulele, strumming hand and microphone are untested.
- **Strumline shows the strings and frets but does not hear which ones you play.** A plucked note
  counts when a sound lands on time; a wrong string or fret is not noticed. Telling single strings
  apart is future work (it needs per-note pitch tracking on top of the strum detector).
- **Chords are picked from the song's own chords, not named from scratch.** Choosing among four
  or five is reliable; **Am, F and C share notes** and are the closest trio (the analyzer says
  "no chord" rather than guess when two fit about equally, and a strum with no recognised chord
  still counts for timing).
- **The first strum right after a quick chord change can read as the old chord**, because that chord
  is still ringing (about one strum in 24 at 160 bpm in the demo song; pinned by a test).
- **Strum direction (down vs up) is not detected.** In simulation it could not be told from the audio
  reliably at realistic strum speeds (gaps of 4 to 10 ms between strings: 55 to 80% right), so the
  charts show the arrows as a guide and only timing and the chord are judged.
- **Windline is simulation-verified only, and its fingerings are from standard charts, not checked on
  every make** (a six-hole Native American flute opens its holes in order from the bottom, but makers differ; the shakuhachi shows syllables, not holes, on purpose). The wind profile and synthetic whistle/recorder
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

- `.github/workflows/ci.yml` runs typecheck, lint, test and build on every PR (job `check`) and the
  headless-Chromium end-to-end checks (job `e2e`, which installs Playwright just for that job)
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
