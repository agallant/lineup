import { SongClock, getProfile, transposeNotation, type Chart } from '@lineup/core';
import { copyText } from '../clipboard';
import { escapeHtml } from '../audio';
import { planAllBacking, playBacking, rhythmTones, type BackingHandle } from '../game/backing';
import type { Screen } from '../router';
import { safeLocalStorage } from '../settings';
import {
  MAX_USER_SONGS,
  PERCUSSION_PROFILES,
  UserSongStore,
  compileSong,
  describeCompiled,
  songFromText,
  songToText,
  type NewUserSong,
  type UserSong,
} from '../user-songs';

const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

const EXAMPLES = {
  melody: 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:.5 D4:2',
  chords: 'C | Am | F | G | C | Am | F | G',
  rhythm: 'kick: x...x...\nsnare: ..x...x.\nhat: .x.x.x.x',
} as const;

const LANE_HINT: Record<string, string> = {
  clap: 'hit',
  'hand-percussion': 'clap, tap',
  'drum-kit': 'kick, snare, hat',
};

/** Make your own songs from text: a melody, a chord song or a rhythm, kept on this device. */
export const makerScreen: Screen = (root) => {
  const store = new UserSongStore(safeLocalStorage());
  let editing: string | null = null;
  let handle: BackingHandle | null = null;
  let ctx: AudioContext | null = null;

  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>My songs</h1>
    <p class="muted">Write a melody, a chord song or a rhythm as text. It joins the song menus of the games
      that suit it, and is rated like any other song. Songs stay on this device (the backup file in Options includes them).</p>

    <section class="panel">
      <h2 data-id="form-title">New song</h2>
      <div class="row">
        <label>Title <input data-id="title" type="text" maxlength="80" /></label>
        <label>Kind <select data-id="kind">
          <option value="melody">Melody (Singline, Windline)</option>
          <option value="chords">Chord song (Strumline)</option>
          <option value="rhythm">Rhythm (Beatline)</option></select></label>
        <label>Tempo <input data-id="bpm" type="number" min="30" max="240" step="1" /></label>
      </div>

      <div data-panel="melody">
        <div class="row"><label>Key <select data-id="key">${KEYS.map(
          (k, i) => `<option value="${i}">${k} major</option>`,
        ).join('')}</select></label></div>
        <label class="block">Notes <textarea data-id="notes" rows="5" spellcheck="false"></textarea></label>
        <div class="row" role="group" aria-label="Move the melody to another key">
          <span class="label">Move to another key</span>
          <button data-move="-12">Octave down</button>
          <button data-move="-1">Semitone down</button>
          <button data-move="1">Semitone up</button>
          <button data-move="12">Octave up</button>
        </div>
        <label class="block">Words to sing (optional) <textarea data-id="lyrics" rows="2" spellcheck="false"></textarea></label>
        <p class="muted">One syllable for each note, separated by spaces: <code>Twin kle twin kle</code>.
          They show under the notes while you sing.</p>
        <p class="muted">Note names with an octave: <code>C4</code> is middle C. A colon gives the length in
          beats: <code>E4:2</code> is two beats, <code>G4:.5</code> half a beat, <code>A4:1/3</code> a third.
          <code>r:1</code> is a rest, <code>#</code> and <code>b</code> make sharps and flats (<code>F#4</code>).
          Bar lines <code>|</code> are just for you. A whistle or recorder can only play notes at or above the key note.</p>
      </div>

      <div data-panel="chords" hidden>
        <label class="block">Chords, one per bar <textarea data-id="bars" rows="3" spellcheck="false"></textarea></label>
        <div class="row">
          <label>Strum pattern <input data-id="pattern" type="text" spellcheck="false" /></label>
          <label>Beats to the bar <select data-id="beats"><option value="4">4</option><option value="3">3 (waltz)</option></select></label>
        </div>
        <p class="muted">Chords: C G Am F D Em Dm A G7 C7 A7 D7 Bm Bb Gm Cm F#m E E7 B7. The pattern is one bar
          of eighth notes: <code>D</code> down, <code>U</code> up, <code>.</code> nothing (8 steps for 4 beats, 6 for a waltz).</p>
      </div>

      <div data-panel="rhythm" hidden>
        <div class="row">
          <label>For <select data-id="profile">${PERCUSSION_PROFILES.map(
            (p) => `<option value="${p}">${getProfile(p).name}</option>`,
          ).join('')}</select></label>
          <label>Steps per beat <select data-id="steps"><option value="2">2 (eighths)</option><option value="3">3 (triplets)</option></select></label>
        </div>
        <label class="block">One line per lane <textarea data-id="lanes" rows="4" spellcheck="false"></textarea></label>
        <p class="muted">Lanes for this instrument: <span data-id="lane-hint"></span>. <code>x</code> is a hit and
          <code>.</code> is nothing; every line the same length, and no two lanes on the same step.</p>
      </div>

      <p class="status" data-id="preview" role="status"></p>
      <div class="row">
        <button data-id="hear">🔊 Hear it</button>
        <button class="primary" data-id="save">Save song</button>
        <button data-id="new">Start a new one</button>
      </div>
    </section>

    <section class="panel">
      <h2>Paste a song</h2>
      <p class="muted">Paste a tune in ABC notation (from a tune book or folk-tune site), or a song copied
        from another copy of this app. You can check it and change it before saving.</p>
      <label class="block">Song text <textarea data-id="paste" rows="5" spellcheck="false"></textarea></label>
      <div class="row"><button data-id="read-paste">Read it</button></div>
      <p class="status" data-id="paste-status" role="status"></p>
    </section>

    <section class="panel">
      <h2>Your songs</h2>
      <ul class="scores" data-id="list"></ul>
      <p class="muted" data-id="empty" hidden>Nothing yet. Write one above and save it.</p>
    </section>
  `;
  const $ = <T extends HTMLElement>(id: string): T =>
    root.querySelector<T>(`[data-id="${id}"]`) as T;
  const text = (id: string) => $<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);

  /** The song as the form describes it. */
  const read = (): UserSong => {
    const base = {
      id: editing ?? 'my-draft',
      title: text('title').value,
      bpm: Number(text('bpm').value),
    };
    const kind = text('kind').value;
    if (kind === 'chords') {
      return {
        ...base,
        kind: 'chords',
        bars: text('bars').value,
        pattern: text('pattern').value,
        beatsPerBar: text('beats').value === '3' ? 3 : 4,
      };
    }
    if (kind === 'rhythm') {
      return {
        ...base,
        kind: 'rhythm',
        profile: text('profile').value as (typeof PERCUSSION_PROFILES)[number],
        lanes: text('lanes').value,
        stepsPerBeat: text('steps').value === '3' ? 3 : 2,
      };
    }
    const lyrics = text('lyrics').value.trim();
    return {
      ...base,
      kind: 'melody',
      key: Number(text('key').value),
      notes: text('notes').value,
      ...(lyrics ? { lyrics } : {}),
    };
  };

  const fill = (song: NewUserSong | null): void => {
    text('title').value = song?.title ?? '';
    text('bpm').value = String(song?.bpm ?? 100);
    text('kind').value = song?.kind ?? 'melody';
    text('key').value = String(song?.kind === 'melody' ? song.key : 0);
    text('notes').value = song?.kind === 'melody' ? song.notes : EXAMPLES.melody;
    text('lyrics').value = song?.kind === 'melody' ? (song.lyrics ?? '') : '';
    text('bars').value = song?.kind === 'chords' ? song.bars : EXAMPLES.chords;
    text('pattern').value = song?.kind === 'chords' ? song.pattern : 'D . D U . U D U';
    text('beats').value = String(song?.kind === 'chords' ? song.beatsPerBar : 4);
    text('profile').value = song?.kind === 'rhythm' ? song.profile : 'drum-kit';
    text('lanes').value = song?.kind === 'rhythm' ? song.lanes : EXAMPLES.rhythm;
    text('steps').value = String(song?.kind === 'rhythm' ? song.stepsPerBeat : 2);
    editing = song?.id ?? null;
    $('form-title').textContent = song
      ? editing
        ? `Editing “${song.title}”`
        : `New song: “${song.title}”`
      : 'New song';
    refresh();
  };

  const refresh = (): void => {
    const kind = text('kind').value;
    for (const panel of root.querySelectorAll<HTMLElement>('[data-panel]')) {
      panel.hidden = panel.dataset['panel'] !== kind;
    }
    $('lane-hint').textContent = LANE_HINT[text('profile').value] ?? '';
    const compiled = compileSong(read());
    const p = $('preview');
    p.textContent = compiled.ok ? `Looks good: ${describeCompiled(compiled)}` : compiled.error;
    p.classList.toggle('error', !compiled.ok);
    p.classList.toggle('ok', compiled.ok);
  };

  const renderList = (): void => {
    const songs = store.list();
    $('empty').hidden = songs.length > 0;
    $('list').innerHTML = songs
      .map(
        (s) => `<li data-song="${s.id}">
          <span></span>
          <span class="what"><strong>${escapeHtml(s.title)}</strong>
            <span class="muted">${
              s.kind === 'melody' ? 'Melody' : s.kind === 'chords' ? 'Chord song' : 'Rhythm'
            } · ${s.bpm} bpm</span></span>
          <span class="row"><button data-act="edit">Edit</button><button data-act="copy">Copy as text</button><button data-act="delete" class="danger">Delete</button></span>
        </li>`,
      )
      .join('');
  };

  const stop = (): void => {
    handle?.stop();
    handle = null;
  };

  /** Plays the song softly: the notes, the chords with a bass line, or the rhythm as ticks. */
  const hear = (): void => {
    const compiled = compileSong(read());
    if (!compiled.ok) return;
    stop();
    ctx ??= new AudioContext();
    void ctx.resume();
    const chart: Chart = compiled.charts[0]!.chart;
    const song = read();
    const events =
      song.kind === 'rhythm'
        ? [...planAllBacking(chart, { metronome: true, guideTone: false }), ...rhythmTones(chart)]
        : planAllBacking(chart, {
            metronome: song.kind === 'chords',
            guideTone: song.kind === 'melody',
            accompaniment: song.kind === 'chords' ? 'full' : 'off',
          });
    const clock = new SongClock(ctx);
    clock.start(-chart.meta.countInBeats * (60 / chart.meta.bpm), ctx.currentTime + 0.1);
    handle = playBacking(ctx, clock, events);
  };

  for (const id of [
    'title',
    'bpm',
    'kind',
    'key',
    'notes',
    'lyrics',
    'bars',
    'pattern',
    'beats',
    'profile',
    'steps',
    'lanes',
  ]) {
    $(id).addEventListener('input', refresh);
    $(id).addEventListener('change', refresh);
  }
  // move the melody up or down: every note, and the key with it
  for (const b of root.querySelectorAll<HTMLButtonElement>('button[data-move]')) {
    b.addEventListener('click', () => {
      const by = Number(b.dataset['move']);
      try {
        text('notes').value = transposeNotation(text('notes').value, by);
        text('key').value = String((((Number(text('key').value) + by) % 12) + 12) % 12);
      } catch {
        // the notes do not parse yet: the preview says why, and nothing moves
      }
      refresh();
    });
  }
  $('read-paste').addEventListener('click', () => {
    const imported = songFromText(text('paste').value);
    const status = $('paste-status');
    status.classList.toggle('error', !imported.ok);
    if (!imported.ok) {
      status.textContent = imported.error;
      return;
    }
    stop();
    fill(imported.song);
    status.textContent = `Read “${imported.song.title}”. Check it above, then save.`;
    window.scrollTo({ top: 0 });
  });
  $('hear').addEventListener('click', hear);
  $('new').addEventListener('click', () => {
    stop();
    fill(null);
  });
  $('save').addEventListener('click', () => {
    const song = read();
    const compiled = compileSong(song);
    if (!compiled.ok) {
      refresh();
      return;
    }
    const saved = store.save({ ...song, ...(editing ? { id: editing } : { id: undefined }) });
    if (!saved) {
      $('preview').textContent =
        store.list().length >= MAX_USER_SONGS
          ? 'Could not save: there is no room for more songs. Delete one first.'
          : 'Could not save: that song was not accepted. Check the text above.';
      return;
    }
    renderList();
    fill(null);
    $('preview').textContent = `Saved “${saved.title}”. It is in the song menus now.`;
  });
  $('list').addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    const id = button?.closest<HTMLElement>('[data-song]')?.dataset['song'];
    if (!button || !id) return;
    if (button.dataset['act'] === 'edit') {
      const song = store.get(id);
      if (song) fill(song);
      window.scrollTo({ top: 0 });
    } else if (button.dataset['act'] === 'copy') {
      const song = store.get(id);
      if (!song) return;
      void copyText(songToText(song)).then((ok) => {
        $('preview').textContent = ok
          ? `Copied “${song.title}” as text. Paste it into a message, or into Paste a song on another device.`
          : 'Could not copy. Select the text in Paste a song instead.';
        if (!ok) text('paste').value = songToText(song);
      });
    } else {
      store.delete(id);
      if (editing === id) fill(null);
      renderList();
    }
  });

  fill(null);
  renderList();
  return () => {
    stop();
    if (ctx) void ctx.close();
  };
};
