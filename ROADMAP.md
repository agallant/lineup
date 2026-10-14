# Lineup roadmap

Where the project is and where it is going. Updated with every milestone; the README says how to
use what exists, [ARCHITECTURE.md](ARCHITECTURE.md) how it is built, and
[TESTING.md](TESTING.md) is the running list of things only a real instrument, microphone or iPad can
check. Development does not wait on that list: everything is built and verified in simulation first, a
real-device finding becomes a fix, and the fix goes through the same tests.

## Where it stands

A private, offline, installable web app (no accounts, nothing leaves the device) of rhythm and ear
games played with a real instrument and the microphone:

- **Singline** (voice), **Windline** (whistles, recorders, Native American flutes, shakuhachi),
  **Strumline** (ukulele chords and picked notes), **Beatline** (claps, taps, hand drums, kit), plus
  **ear training**, a **tuner**, **Learn** paths, **My songs**, a daily challenge per game, and
  **scoreboard / XP / streaks / trophies / options / backup**.
- Every song, exercise and random song is rated 1 to 10; any can be made easier, harder or mixed;
  random songs come from seeded generators (melody, flute, chord song, waltz, groove) that are tested
  for variety over hundreds of seeds; listen-first and "unseen" play; practice speed, one-phrase
  practice, play-along bass, chords, drum loop and drone.
- The README lists every feature; ARCHITECTURE.md the modules; this file what is next.

## The plan, milestone by milestone

Each milestone is one pull request (or a short series): built and tested in simulation, reviewed by
CodeRabbit, merged on a real approval with CI green, and its real-device checks added to TESTING.md.
They are ordered by how much each adds to a player who has only a device and an instrument, and none
waits on the ones before it.

1. **Game feel** (done). Streak freezes (one earned per week of streak) and a rest day, so a missed day
   does not erase a long streak; a collection page of songs cleared with three stars, with a medal per
   song family; a personal-records timeline; a themed week (waltz, pentatonic, slow and steady, fresh
   songs, ...) alongside the daily challenge.
2. **More to play** (done). A larger public-domain and original repertoire in every mode (easy first, then
   harder and chromatic), harder grooves, more flute repertoire, more chord songs, each checked for
   range, fit and rating.
3. **Practice tools** (partly done: tempo ladders for winds and _name that note_ are in; interval
   singing and the chord-change drills were already exercises; the rest below is kept for later).
   Tempo ladders (finish a song at 65%, 80%, 100% in a row); interval singing
   (hear a note, sing the note a fourth above it); a "name that note" quiz and a staff view with the
   note names hidden; a chord-change trainer scored on the change; call and response in Beatline; a
   voice range setting (the guide tone in your octave, a "fits your voice" mark). _The voice range is
   small because Singline already counts a note in any octave and folds your pitch for display._
4. **Make and share (still private)** (done). Transpose in My songs, paste ABC notation, copy a song as text
   (through the backup file or a message), lyrics under a melody for sing-along.
5. **Plucked notes judged by pitch** (done, experimental; Strumline). Today a picked note is judged on timing only; judge
   the string and fret by pitch with the same detector Windline uses, in simulation first.
6. **Duet and free play** (done). Two players alternate phrases of one song on one device with separate
   scores; free play with a metronome and a take recorded and played back on the device.
7. **Quality** (done for what can be automated: an axe-core audit of every screen in three colour schemes in the end-to-end job, and a size budget on the build). An automated accessibility audit of every screen in CI; performance and offline
   checks; docstring and test coverage kept up; whatever the real-device list turns up.

Done after the first seven (and Bassline, the bass guitar game, and Keyline, the keyboard game): voice range, staff view with hidden note names, call and response,
song packs, MIDI in and out, short per-game tips, and Start over in Options. Ideas kept for later, none
blocking: left-handed layouts (lower priority), more song packs, MIDI folders as packs. (Haptics were considered and dropped: iPad Safari has no vibration API.)

Next up, in this order (asked for by the user):

1. **Guitar in Strumline** (standard tuning done; alternate tunings in the game itself, such as drop D,
   DADGAD and open G, still to do). The tuner already has them.
2. **Beginner step mode** (done for Singline, Windline, Bassline and Keyline; still to do for Strumline picked
   notes and chords, and Beatline) in every game: not timed. Each note is shown on the line and played for the
   player, who plays or sings it back; getting it right moves on to the next, one note at a time. Singline
   first, then the instrument games, and Beatline once its sounds are taught.

## Not buildable without a real instrument or sounds you teach it

- Telling a **shaker from a tambourine or a hand drum**: needs your own recordings to train on.
- Judging a **shakuhachi's meri/kari pitch bends** and a verified hole chart per school.
- Hearing **strum direction** reliably (not reliable in simulation at realistic strum speeds).
- A real **VoiceOver** pass, and every layout on the iPad itself.
- An **ocarina** (needs a verified fingering chart per type before it is offered).

These stay on the list with a clear test in [TESTING.md](TESTING.md); the software around them is
built so a finding changes a number or a table, not a design.

## Known limits of the simulation

- The simulated strum analyzer can miss, or be late on, the first strum after a chord change, and
  near-identical shapes (Am/Am7, A/F♯m) are not told apart in one song.
- Whistles, recorders, flutes, ukuleles, hand drums and the iPad microphone have only been tried as
  synthetic sounds, so thresholds (clarity, level, timing windows) are educated defaults.

## How each milestone ships

One pull request per milestone, reviewed by CodeRabbit and merged only on a real approval with CI
green. Each PR lists what was verified in simulation, what is unverified on real hardware, and what to
try on the iPad.
