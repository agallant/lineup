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
- [ ] **Listen first** + **Unseen** (Beatline; turning on Call and response turns Listen first off): the notes fade after the listening part and the lanes and timing line stay visible; clapping from memory is judged.
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

### Voice range, staff, call and response, packs, MIDI

- [ ] **Options > Singline voice**: pick yours; songs say how they sit in it, and the guide tone is in an
      octave you can sing (headphones).
- [ ] **Staff view** (Singline or Windline, _View_): the notes are on the right lines and spaces for the
      clef shown; with **Show note names** off you can still read it. Is the staff big enough and is the
      scroll speed readable on the iPad? (A plain "G"/"F" stands in for the clef sign.)
- [ ] **Beatline > Call and response** on a clap or kit rhythm: "Listen…" then "Your turn!" bar by bar, and
      you are judged only on your answers.
- [ ] **Song packs**: tap a few songs; each opens in the right game with the song chosen.
- [ ] **My songs > Open a MIDI file**: try a few files from the web or your own music program. Which are read
      wrongly (wrong key, rhythm, wrong track)? **Save as MIDI** opens in GarageBand or a notation app.
- [ ] **Options > Start over** erases everything and reloads; the first-time tips come back.

### More songs, packs and the Singline drone

- [ ] **Singline > Options > Drone**: with headphones, the key note holds low under a song (and its fifth if
      chosen) and does not confuse the mic; it matches the key you sang in after a key shift.
- [ ] New tunes sound like the tunes: Itsy Bitsy Spider, Baa Baa Black Sheep (I wrote these from memory;
      say if a note is off) and the originals Scale Sprint, Three Steps Up, Dusk in A minor, Leap Frog.
- [ ] New chord songs (Fiddle tune, Hymn in C, Rainy day) are strummable; the **Minor moods** and **Made for
      Lineup** packs list sensible songs.

### Bassline

- [ ] **Tuner > Bass guitar (E A D G)**: reads your open strings, E1 included (41 Hz), and agrees with another
      tuner. A phone microphone may struggle with the low E: say what it does.
- [ ] **Bassline > the open-strings exercise**: with your bass near the iPad (unplugged, or through an amp),
      every open string you play registers as the right note and on time. Try with and without headphones.
- [ ] Does it hear the **right octave**? (Octave-forgiving is on; say if notes are missed anyway, or if a
      note an octave off should count wrong.)
- [ ] Plucking hard versus soft, fingers versus pick, and muted notes: which are missed?
- [ ] The tab view (string and fret) reads naturally; are the lines in the **blues, pop and rock** sets at a
      comfortable tempo? Try **Speed**, and the **Drum loop** in Options as a backing.
- [ ] Learn > **Bassline: first lines** opens the right songs in order.

### Keyline

- [ ] **Keyline > Connect a MIDI keyboard** with a real USB or Bluetooth MIDI keyboard on a computer (Chrome or
      Edge): it names your keyboard, and playing a key lights it on screen. Does Safari on the iPad say it
      cannot (expected)? Is a keyboard plugged in later picked up?
- [ ] Is the **timing** right on a MIDI keyboard? Play along on **Five fingers on C** with the metronome:
      the result should say "on the beat". If it says early or late by a steady amount, tell me how many ms.
- [ ] If the keyboard makes its own sound, turn off **Make a piano sound**. Is the lag of the app's piano
      sound (when on) noticeable?
- [ ] **On-screen keys** on the iPad: can you press two or three at once (a chord)? Is the key size fine, and
      does sliding a finger across keys feel right?
- [ ] **Computer keyboard** (A S D F ...): do the notes line up with the keys drawn? Z and X change octave.
- [ ] Both hands on **Ode to Joy, hands together** and the **chord pieces**: are they at a comfortable tempo?
      Which pieces are too hard or too easy for a beginner?
- [ ] **Keyline > Beginner**: it plays the asked note or chord and waits; press the keys to move on. Is that
      a gentle way in? Does the sound of the asked keys come out loud enough, and is "Hear it again" enough?
- [ ] Learn > **Keyline: first steps** opens the right pieces in order.
- [ ] **Keyline > Options > Key timing** starts at 0 ms (no audio-latency correction, since keys and MIDI have almost none). Play a steady piece: do hits land on the beat? If presses count early or late, nudge the slider (below 0 = counted later) and note the value that feels right, so the default can be tuned per device.

### Beginner step mode (Singline, Windline)

- [ ] **Singline > Beginner: one note at a time**: tap Play. It plays the first note; sing it and hold it
      for a moment: it says "Got it!" and plays the next. Does it hear you reliably? Is the hold time (0.4 s)
      and the tolerance right for a beginner, or too strict or too loose?
- [ ] Does the **tone sound in your octave** (voice range in Options)? Is "Hear it again" enough, and does
      the app stop listening while the tone plays (it should not pass a note from its own speaker)?
- [ ] **Bassline > Beginner**: the asked bass note is played two octaves up so an iPad speaker can play it
      (the screen shows the real note). Does it hear your open E, A, D, G and move on?
- [ ] **Strumline > Beginner**: it plays the chord, you strum it back (a run of the same chord is one step).
      Does that feel like a gentle start? **Beatline > Beginner**: it plays the drum sound, you hit it.
- [ ] Try it in **Windline** with your instrument: does it ask the notes in the instrument's own key?

### Guitar (Strumline)

- [ ] **Strumline > Mode > Guitar strumming**: six string lines (e B G D A E from the top); a string with no
      mark (the low strings in a C or D chord) is not played. Do the chord fingerings shown match how you
      play them? Which chords would you finger differently (e.g. a different F)?
- [ ] With a real guitar near the iPad, does the **timing** register every strum? Try fast and slow songs.
- [ ] Turn on **Also check the chords**: how often does it name your chords right? (The simulation confuses
      Am with C now and then, because the ringing chord before leaks into the next.)
- [ ] **Tuner > Guitar** (standard, drop D, DADGAD, open G): the low E (82 Hz) reads, and agrees with
      another tuner.
- [ ] **Drop D, DADGAD, open G** modes: tune the guitar that way (Tuner has all three). Do the chord
      fingerings shown (the same chords, moved to the new strings) sound right? Anything you would fix?
- [ ] Picked songs (Hot Cross Buns, Ode to Joy, Mary had a little lamb): shown on guitar strings at low
      frets? Try **Also check the pitch** with a real guitar.

### Tuner and Metronome

- [ ] **Tuner** opens as a universal tuner (any note). Sing, whistle or play a flute: does it name the note and
      show cents steadily, without jumping an octave? Is the needle smooth enough?
- [ ] **Reference tone**: tap a note, it holds until you tap it again. Is it loud and clear on the iPad
      speaker, also for low notes? Does **A = 442** (the + button) change the tone and the reading?
- [ ] Ukulele, guitar and bass modes: the string buttons play each string, and the tuner reads the one you
      pick. Is the switch easy to find and use?
- [ ] **Metronome**: is the click **steady** (listen on a phone and the iPad, with the screen off and
      on)? Does the lit beat match what you hear? Try 40, 120 and 240 bpm, and eighths and triplets.
- [ ] Does **Tap tempo** feel right, and do **− and + held down** change the tempo at a good speed?
- [ ] Does the **speed trainer** (open Speed trainer, set 5 bpm every 4 bars up to 140) feel right?
- [ ] On iPhone: does the sound play with the ringer switch off? Does it keep the screen awake?
- [ ] What would you want from a metronome that this one lacks (rhythm patterns, count-in, a flash)?

### Song picker, first song and the home screen

- [ ] On a **fresh start** (Options > Start over) each game opens on a gentle first song (Hot Cross Buns, Five
      fingers on C, Open strings...) rather than a demo. Is that the right first song for you?
- [ ] The **song picker**: search, sort, difficulty and "hide songs I have cleared" behave as you expect, and
      **Random song** (a separate button) feels clearer than the old menu heading.
- [ ] Home: **Play again** takes you straight back to the last song. Learn paths: collapsed until you start.

### New songs

- [ ] **Do the new tunes sound right?** Twinkle, La Cucaracha, Sakura (opening), Canon (theme), Deck the Halls,
      We Wish You a Merry Christmas. Please say which, if any, have a wrong note or rhythm; they were written
      from memory and are marked "opening" or "theme" where they stop early.
- [ ] **World rhythms** (Beatline, Clap, and Clap & tap): son clave, rumba clave, bossa nova clave, tresillo,
      habanera, cinquillo, the bembé bell, soleá, teental, jhaptal, rupak, rachenitsa, aksak, kopanitsa, maqsum,
      baladi and saidi are in the "Rhythms of the world" pack. Do they feel like the real rhythms? The odd
      meters (7, 9, 10, 11, 12 counts) are counted one count per beat, so set the tempo to taste. Which are wrong?
- [ ] **Kaeru no uta** (the Japanese frog song) was written from memory: right tune?

### Pentatonic flutes and the staff view

- [ ] **Windline > pick a pentatonic flute** (a shakuhachi, a Native American flute): the song list should show
      the flute songs and only other songs that use the flute's five notes, with **Random flute song** as the
      generator. Is that a good place to start? Does **Show every song** (advanced) bring back the rest?
- [ ] **View > Staff**: the treble clef is now a drawn clef, not a letter G. Does it look right on the iPad?
- [ ] On a shakuhachi, notes are named **Ro Tsu Re Chi Ri** first, with the Western name after it in brackets
      ("Ro (D4)"), on the staff, the bars view and the fingering chart alike. Is it clear, and does anything
      overlap on the iPad (the staff puts the bracketed name on a second line)?

### Hits to strum (Beatles and others)

- [ ] **Strumline > Songs: pick a Beatles song** (Help!, Come Together, Eight Days a Week, Love Me Do, A Hard
      Day's Night, I Saw Her Standing There, Ob-La-Di, Ob-La-Da). Play it on the ukulele and the guitar: are the
      chords the right ones for the song, and does the tempo feel right? These were read from a research
      data set of chord annotations and simplified, so say which are wrong or too fast/slow.
- [ ] Does **capo N** in the artist line put it in the recorded key when you actually use a capo?
- [ ] Is the long list of hits easy to find your way around (search, sort by difficulty or A to Z)? The
      packs **The Beatles** and **Number-one hits to strum** are the shortcuts.

### Backing music and drums

- [ ] **Listen to the feels** (headphones; set Play-along music and Drums on a game's set-up page): do
      _Match the song_, the waltz, boom-chick, walking bass, bossa and reggae sound musical and in time? Any
      that jar, or are too loud, too thin or too busy? Is the **fill** at the end of a phrase welcome?
- [ ] **Drum sounds** are now synthesized (a kick that thumps down in pitch, a noisy snare, hi-hats, a rim click, toms) instead of beeps. Do they sound like a drum kit on your iPad speakers and on headphones? Too boomy, too hissy, too quiet or loud against the music? Say which drum and I will adjust it.
- [ ] Does **Match the song** pick sensibly for a slow ballad, a march, a waltz? Does the change of feel every
      eight bars sound deliberate?
- [ ] The **tanpura** drone under a Singline or Windline song: pleasant, and the right pitch for the key?
- [ ] Do the quiet backing tones still leak into the microphone with headphones **off** (the warning is
      still needed)?
- [ ] **Instrument sounds** are now synthesized per instrument: plucked ukulele/guitar chords (strummed a hair apart), a piano for the Keyline keys, ear training and step-mode notes, a bass, an organ drone, a flute guide tone, a pad, and a marimba-like celebration jingle. On your iPad, which still sound fake or harsh, too quiet or loud against each other? Is the Keyline piano still instant when you press a key?
- [ ] The **piano** is now a recording (a real upright, a few notes stretched to the rest) after the first second or so of using Keyline, ear training or step mode; before that it is the synthesized one. Does the real piano sound good on the iPad, and is the switch between the two noticeable? Does it still work with no network once the app has been visited (airplane mode)?
- [ ] **Hits to strum**: do the chords of songs you know sound right, and is the long list (about 770 songs in the full catalogue, including the newer, jazz and classical ones) still easy to search on the iPad? Tell me any that are wrong and I will fix them.
- [ ] The **song menus** now start with a **Kind of song** menu (Beginner and easy songs, Folk and traditional songs, The Beatles, Number-one hits, Newer songs, Hit songs (all), Jazz and blues, Classical and early music, Christmas and holiday songs, World rhythms and songs, Pentatonic flute songs, Exercises and scales, All songs; each game lists only the kinds it has) before the song list, and the **Search** box is always in view and looks through every kind. Is it quick to find a song on the iPad, and are the kinds the right ones? Anything miscategorised?
- [ ] **Keyline free play** (the "Free play: just fool around" button next to Play): a three-octave piano (two on a phone) with no score and no timing. Touch, slide across the keys for a glissando, or use a MIDI keyboard. Does it sound and feel right? Anything you would want in it (a sustain pedal, a recorder, other sounds)?
- [ ] **Song menus**: choosing a kind of song now starts a new list on its first song, and a line under the menus says how many songs are in it. Does that make it clear that the list changed?
- [ ] **More songs to strum**: about 770 in the full catalogue now (every annotated Billboard song to 1991 that converts, newer ones written by hand, and jazz, blues and classical progressions under their own kinds). Do the jazz and classical ones sound right (they are simplified to the chords Strumline has: _Autumn Leaves_, _Fly Me to the Moon_, _All of Me_, rhythm changes, the canon, the folia, the Andalusian cadence, minor blues, ii-V-I)? Anything you would add?
- [ ] **Every chord**: Strumline now knows any chord (all twelve roots in seventeen kinds, and slash chords like G/B). The ones that are not hand-picked open shapes are fingered by a search for the easiest way to play them. On your ukulele and guitar, do the barre and sharp/flat chords come out as shapes you would really play (try the **Chord finder** under Tools: F#, B, C#m, Bb7, Cmaj7, Dsus4, G/B, E5), and are the "other places on the neck" sensible? Tell me any that are awkward or wrong and I will correct them.
- [ ] **Chord practice**: the Learn paths _Strumline: every chord_ (ukulele) and _guitar barre and power chords_, and the exercises _Slide a shape_, _Every major/minor/seventh chord_ and _Twelve-bar blues in…_ (every key). Does the order feel right, and does the microphone follow barre chords (Bm, B, F#m) and sevenths and suspended chords when you really strum them?
- [ ] **Songs with sharps and flats** (_Photograph_, _Shape of You_, _Yellow_, _Hotel California_, _Stairway to Heaven_, _Creep_, _Smells Like Teen Spirit_ on power chords, and the roughly 85 more Billboard songs that could not be played before): do the chords sound right against the record, and is the capo/key the importer picked comfortable?
- [ ] **Choose a chord's fingering**: in the **Chord finder**, each diagram has "Use this one"; the choice is remembered and used in every song and exercise (not in the other guitar tunings). A song's **Chords:** line in Strumline links each chord to the finder. Is it clear that the choice is kept, and is the list of other places on the neck the right one (are the shapes you would actually play missing)?
- [ ] **More jazz** (_Giant Steps_, _So What_, _Freddie Freeloader_, _Mr. P.C._, _Billie's Bounce_, _Blues for Alice_, _All the Things You Are_, _Satin Doll_, _Misty_, _Take the A Train_, _Sweet Georgia Brown_, _Minor Swing_, _Watermelon Man_, _My Funny Valentine_, _When the Saints_) are outlines of the standard changes, simplified to the chords Strumline has. Do they sound like the tunes, and which jazz standards would you want next?
- [ ] **Christmas and holiday songs** (_Last Christmas_, _Silent Night_, _Away in a Manger_, _The First Noel_, _All I Want for Christmas Is You_...) and **world songs** (_La Bamba_, _Oye Como Va_, _Guantanamera_, _Kalinka_, _Sakura_, _Hava Nagila_, _Danny Boy_, _Loch Lomond_...) are simple harmonizations of traditional tunes (and, for the modern ones, the progressions people play): do they sound like the tunes you know, and which would you change or add?
- [ ] **Install**: from the home page, "install it on this device" shows the right steps for your iPad, and
      adding it to the Home Screen works as described.

## Findings

Write anything you notice here, or just tell me in the chat:

-

## Polish pass (to look at on the iPad)

- [ ] Chord finder: the fret number ("7fr") now sits to the left of the diagram, clear of the dots; the cards line up in a grid with full-width buttons.
- [ ] Song menus (Strumline, Singline, Windline, Keyline) show most of a long title instead of cutting it short.
- [ ] Song packs: nothing sticks out sideways on a tablet.
- [ ] Options: "Choose File" (restore from a backup) looks like the other buttons and is easy to tap.
- [ ] Chord finder on a guitar: a shape up at fret 10 or 12 shows its "10fr"/"12fr" label fully.
- [ ] Song packs and Collection on a phone: each group shows its first few songs (the ones still to clear first) and "Show all N songs" opens the rest; the pages are short to scroll.
- [ ] Options on a phone: every checkbox is the same size, even when its label wraps onto two lines.
- [ ] Menus on a phone (Ear training, Singline, ...): a long menu fits inside its panel instead of sticking out or cutting off early.
- [ ] Metronome: the Volume slider sits level with its label.
- [ ] Beatline, Singline, Windline on a phone in portrait: quick notes no longer run together (the view shows a little less ahead so each note has room).
- [ ] Home: the practice line reads "Practice in the last seven days: N minutes · set a weekly goal" (the link opens Options), separate from the themed week.
- [ ] Tuner: "Reference pitch: A = 440 Hz" with − and +; "Reset to 440" shows only after changing it.
- [ ] A phone on its side while playing: the game title steps aside so the song lane is as tall as it can be; Back and Stop stay.
- [ ] Collection: open "Show all N songs" on a big group (Strumline songs) and type in "Find a song": the list narrows as you type.
