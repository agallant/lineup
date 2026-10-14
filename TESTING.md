# Things only a real device can check

The running list of what to try on the iPad (or with a real instrument), kept up to date with every
milestone. **Nothing here blocks development**: each item is built and tested in simulation first, so a
finding is a number, a table or a threshold to change, and the fix goes through the same tests. Pick
whichever you can, in any order; one sentence per finding is plenty ("recorder, low G, never scores").

Mark an item `[x]` when it worked, or write what happened next to it. "Since" says which change added
it, so you can skip what you have already seen.

## Quick tour (about ten minutes, no instrument needed)

- [ ] Open the app from the home screen icon with the network off: it starts and every screen loads.
- [ ] Home: the **Up next** card, today's challenges, level and streak. Portrait and landscape.
- [ ] **Options**: change the colour scheme (dark, light, high contrast) and text size; both stick after a reload.
- [ ] **Options** > backup: download, then restore it; scores, songs and settings come back.
- [ ] **Learn**: all paths open; a step opens the right game with its song chosen.
- [ ] **Ear training**: the tones play and the ten questions can be answered by touch.
- [ ] **Tuner**: plays nothing, listens only; shows a note name and a needle for any sound.
- [ ] VoiceOver on: every control on Home, Learn and one game's setup screen is announced sensibly.

## Microphone and timing (any game)

- [ ] **Mic & latency test**: the level meter moves for speech; "tap to measure" gives a believable latency (tens of ms).
- [ ] **Calibrate timing**: the result is stable if you run it twice.
- [ ] With the speaker (no headphones): do the clicks or backing leak into the mic? (the leak check says so.)

## Singline (voice)

- [ ] A simple song (Hot Cross Buns): sing it; notes light up when you are on pitch, not before.
- [ ] The three scoring levels feel right: easy forgiving, strict demanding.
- [ ] Key menu: a song that is too high or low moves into a comfortable key.
- [ ] **Listen first**: you hear the song as tones, then it asks you to sing it.
- [ ] Range finder exercise finds your real range.
- [ ] Random melody: levels easy/medium/hard feel different; **Aim for** lands near the number you pick.

## Windline (whistle, recorder, flutes)

- [ ] **Any octave** (default) counts the right note an octave off; **exactly the octave shown** does not.
- [ ] Whistle/recorder chart: the sharps and flats (grey rows) match your instrument.
- [ ] While playing, the fingering strip shows the current and next note.
- [ ] Random melody and exercises sit in your instrument's key.
- [ ] _Since the pentatonic flutes:_
  - [ ] Native American flute: the six-hole chart matches your flute (hole order from the bottom, the upper register).
  - [ ] Shakuhachi: the syllables Ro Tsu Re Chi Ri match your teacher's names; say if the octave is wrong.
  - [ ] **Pentatonic flute songs** are playable at their tempos (slow, long notes); say if too slow or fast.
  - [ ] **Random flute song** (minor and major): pleasant, and it varies each time.
  - [ ] **Options** > Windline drone: the key note (and its fifth) sounds low under the song; it does not confuse the mic (headphones).
  - [ ] Breathy attacks, vibrato and pitch bends (meri/kari): are notes still counted? (Tell me which are missed.)

## Strumline (ukulele)

- [ ] Strum a chord song: strums register on the beat; wrong chords are not rewarded (turn on **Also check chords**).
- [ ] Which chords does it confuse? (Am vs Am7, A vs F♯m are known to be close.)
- [ ] Picked melodies: plucked notes register as timing hits.
- [ ] _Since the random-song fixes:_ **Random waltz** counts in **three** clicks; **Random chord song** and **Random waltz** give different progressions on every **New song**, in every level.
- [ ] Practice speed and the **faster speed** offer after a clean run.
- [ ] Tuner in ukulele tuning (G C E A): agrees with another tuner.

## Beatline (claps, taps, drums)

- [ ] **Teach it your sounds** (clap, tap): it then tells them apart.
- [ ] Hand drum and kit modes: your real sounds are classified sensibly.
- [ ] _Since the random-song fixes:_ **Random groove** differs on every **New song** for kit, hands and clap, at every level.
- [ ] **Listen first** + **Unseen**: the notes fade after the listening part and the lanes and timing line stay visible; clapping from memory is judged.
- [ ] Backing does not play (by design) while you clap, so the mic cannot hear it.

## Backing, sounds and feel

- [ ] **Options** > play-along backing: bass line, bass and chords are quiet and in tune with the song.
- [ ] **Options** > drum loop (rock, bossa): quiet enough, not annoying, and the beat is where you expect it (waltz: kick on one).
- [ ] Jingles on a new best, a trophy, a level up, a cleared daily challenge: pleasant, not too loud.
- [ ] Metronome clicks and the guide tone are audible in headphones and do not clip.

## My songs, scores and progress

- [ ] **My songs**: write a melody, a chord song and a rhythm as text; each appears in its game's menu and plays.
- [ ] **Scoreboard**: sort and filter; stars match what you played.
- [ ] A streak, trophies and the weekly goal update as you play across days.
- [ ] **Daily challenge**: the same song as the date says, once per day.

## Accessibility and layout on the iPad

- [ ] Every button is easy to hit with a finger (the game screens in both orientations).
- [ ] Text is readable at the largest text size; nothing is cut off.
- [ ] VoiceOver reads the song info, the best score and results.
- [ ] Reduce Motion on: animations stop.

## New with each milestone

Items for features still to come are added here as they ship, under the milestone that adds them.

### Game feel (streak freezes, themes, collection, records)

- [ ] **Home**: the **This week** card names a theme and shows its count ("0 of 3" on a fresh profile; otherwise note the number); play a matching song (for
      example a waltz in a waltz week) and the results screen says "Waltz week: 1 of 3"; the card follows.
- [ ] Finish the goal: the results say the week is finished (+100 XP) and the _Theme of the week_ trophy appears.
- [ ] **Streak freeze**: play for seven days in a row; on the seventh the results say you earned a
      freeze and Home shows ❄ 1. Then skip exactly one day and play on the next: the results say a freeze
      kept the streak alive (and the streak number did not drop). Skipping two days breaks it.
- [ ] **Options > Rest day**: pick a weekday; skip it and check the streak survives.
- [ ] **Collection** (`#/collection`): families listed, songs you three-starred are highlighted, a song
      opens in its game, the medal text ("3 more for bronze") reads right.
- [ ] **Scoreboard > Records**: after beating a best, the timeline shows "78% → 85%".
- [ ] Do any of these feel too easy, too hard, or unclear (the goals, the freeze rule, the medal thresholds)?

### More to play (repertoire)

- [ ] **Singline / Windline**: the new tunes (Old MacDonald, Au clair de la lune, Lightly Row, Oh! Susanna,
      Yankee Doodle, Arpeggio Climb, Chromatic Walk) sound like the tunes you know; say if a note is wrong.
- [ ] **Windline**: Au clair de la lune and Yankee Doodle are lifted a little so they stay above the
      instrument's lowest note; does the lift sound odd?
- [ ] **Strumline**: the new chord songs (Campfire in G, Pop progression, Sunny day, Minor blues, Turnaround,
      Slow waltz in G) are strummable at their tempos; the waltz counts in three.
- [ ] **Beatline**: Bossa nova, Double-time rock, Clap swing, Running sixteenths, Pulse and offbeat and
      Conversation: are they too hard for their star rating?
- [ ] **Flute songs**: Cedar Wind, Night Fire, Geese Overhead, Thunder Drum: tempo and breath marks feel right.

### Practice tools

- [ ] **Ear training > Name that note**: you hear a short do-mi-sol-do, a pause, then one note; the
      choices (Do, Mi, Sol at easy) feel answerable and the pause is long enough.
- [ ] **Windline tempo ladder**: play a song at 65%, 80% and 100% with a clean run each; the results line
      reads "Tempo ladder: 65% ✓ · 80% ✓ · 100%" and fills in; the third rung shows "climbed!" and a trophy.
      Say if 90% accuracy is too strict or lenient for a rung.

### Make and share

- [ ] **My songs > Paste a song**: paste a tune from an ABC site (try one with a key signature and a
      repeat); the notes, key and tempo look right and it plays the way you know it. Say which tunes fail.
- [ ] **Move to another key** keeps the tune recognisable; **Words to sing** show under the notes in
      Singline, one syllable per note, and keep up with the singing.
- [ ] **Copy as text** on a song, then paste it into a message and back into **Paste a song** (on the
      same or another device): the same song comes back.

### Plucked notes by pitch

- [ ] **Strumline > a picked song (Picking: Ode to Joy)**: tick _Also check the pitch of each plucked
      note_ and pluck the melody: right notes score, a wrong string or fret is a miss ("Wrong note").
- [ ] Notes that ring into the next (a wide leap) can be judged wrong when they were right: say which
      passages (a known limit in simulation).
- [ ] Does it work with your tuning (re-entrant GCEA, or low-G)? Low-G plays an octave low on the G string.

### Duet and free play

- [ ] **Singline or Windline > Duet**: with a friend, take turns by phrase; "Player 1's turn / Player 2's
      turn" changes at the right moment, and each player's count matches what you sang.
- [ ] **Free play**: the metronome keeps a steady beat (check against another metronome at 60 and 120);
      a recorded take plays back, with the count-in left out; **Save to this device** gives a file you can open.
- [ ] Free play with the metronome on and no headphones: do the clicks come out in the take?

## Findings

Write anything you notice here, or just tell me in the chat:

-
