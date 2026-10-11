import type { Screen } from '../router';

/** A short guide to the games, scoring, progress and privacy. */
export const helpScreen: Screen = (root) => {
  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>How to play</h1>

    <section class="panel">
      <h2>The idea</h2>
      <p>Notes or hits scroll toward a line. Play or sing each one as it reaches the line and the app
        listens through the microphone, so you need a real instrument (or your voice, or your hands). Use
        headphones if the click or guide tone is on, or the microphone will hear them.</p>
      <p>First time on a device? Open <strong>Set up</strong> on the home screen: <em>Calibrate timing</em> teaches the
        app how late your speaker and microphone are, and the <em>Mic &amp; latency test</em> shows whether the
        microphone hears you.</p>
    </section>

    <section class="panel">
      <h2>The games</h2>
      <dl class="help">
        <dt>Singline</dt><dd>Sing each note and hold it. Any octave of the right note counts, so sing where it is comfortable.</dd>
        <dt>Windline</dt><dd>Whistles, recorders and other winds. Pick your instrument and the song moves into its key, with a fingering chart.</dd>
        <dt>Strumline</dt><dd>Strum chords or pluck melodies on a ukulele. The four lanes show the fret to hold on each string; a ring is an open string.</dd>
        <dt>Beatline</dt><dd>Clap, tap or drum in time. With two or more lanes you first teach it the sounds.</dd>
        <dt>Ear training</dt><dd>No instrument needed: name the interval between two notes, or the kind of chord.</dd>
      </dl>
    </section>

    <section class="panel">
      <h2>Songs, versions and parts</h2>
      <ul>
        <li><strong>Difficulty</strong> is worked out from the song and shown in the menu (1 to 10, Beginner to Expert). A melody is also <em>diatonic</em> (every note in its key) or <em>chromatic</em> (sharps and flats, which need half-holes or a chromatic instrument).</li>
        <li><strong>Version</strong>: as written, easier, harder, or mixed phrase by phrase.</li>
        <li><strong>Part</strong>: practise one phrase on its own. <strong>Listen first</strong> plays the song once, then asks you to play it back.</li>
        <li><strong>Random songs</strong>: pick a level, then <em>New song</em>, or <em>Aim for</em> a difficulty. A seed number replays the same song.</li>
        <li><strong>My songs</strong> lets you write your own as text.</li>
      </ul>
    </section>

    <section class="panel">
      <h2>Scores and progress</h2>
      <ul>
        <li>Each finished song gives <strong>stars</strong> (★ 60%, ★★ 80%, ★★★ 95% accuracy), <strong>XP</strong> for your level, and counts toward your <strong>streak</strong> of days played.</li>
        <li><strong>Trophies</strong> are earned once. The <strong>daily challenge</strong> is a new random song each day for each game.</li>
        <li>The <strong>scoreboard</strong> keeps your best score for every song and way of playing it. The auto-play demo never counts.</li>
        <li>Clean runs at a practice speed offer the next speed up.</li>
      </ul>
    </section>

    <section class="panel">
      <h2>Private and offline</h2>
      <p>Everything stays on this device: settings, scores, progress, your songs and your trained sounds.
        Nothing is sent anywhere. Once loaded the app works without a connection. In <strong>Options</strong> you can save
        a backup file and restore it on another device.</p>
    </section>
  `;
  return undefined;
};
