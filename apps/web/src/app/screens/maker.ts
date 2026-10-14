import {
  SongClock,
  chartToMidi,
  getProfile,
  midiToMelody,
  midiToRhythm,
  parseMidi,
  transposeNotation,
  type Chart,
  type MidiFile,
} from '@lineup/core';
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
  packFromText,
  packToText,
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
      <div class="row" data-id="pack-row" hidden>
        <button class="primary" data-id="pack-save">Save all</button>
      </div>
      <h3>Or open a MIDI file</h3>
      <p class="muted">A .mid file from a music program or the web: pick the track with the tune (or the drums) and it becomes a melody or a drum-kit rhythm to check and save. Long files are cut to the first part.</p>
      <div class="row">
        <label class="file">Open a MIDI file <input type="file" accept=".mid,.midi,audio/midi,audio/x-midi" data-id="midi-file" /></label>
        <label data-id="midi-track-label" hidden>Track <select data-id="midi-track"></select></label>
        <button data-id="midi-use" hidden>Use this track</button>
      </div>
      <p class="status" data-id="midi-status" role="status"></p>
    </section>

    <section class="panel">
      <h2>Your songs</h2>
      <ul class="scores" data-id="list"></ul>
      <p class="muted" data-id="empty" hidden>Nothing yet. Write one above and save it.</p>
      <div class="row"><button data-id="copy-pack">Copy all as a pack</button></div>
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
          <span class="row"><button data-act="edit">Edit</button><button data-act="copy">Copy as text</button><button data-act="midi">Save as MIDI</button><button data-act="delete" class="danger">Delete</button></span>
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
  let pending: ReturnType<typeof packFromText> | null = null;
  $('read-paste').addEventListener('click', () => {
    const status = $('paste-status');
    pending = null;
    $('pack-row').hidden = true;
    // a pack of several songs is saved in one go; a single song or an ABC tune goes into the form
    if (text('paste').value.trim().startsWith('LINEUP-PACK-1')) {
      const pack = packFromText(text('paste').value);
      status.classList.toggle('error', !pack.ok);
      if (!pack.ok) {
        status.textContent = pack.error;
        return;
      }
      pending = pack;
      $('pack-row').hidden = false;
      $('pack-save').textContent = `Save all ${pack.songs.length}`;
      status.textContent = `A pack of ${pack.songs.length} ${pack.songs.length === 1 ? 'song' : 'songs'}: ${pack.songs
        .map((x) => x.title)
        .slice(0, 6)
        .join(
          ', ',
        )}${pack.songs.length > 6 ? '…' : ''}.${pack.skipped ? ` ${pack.skipped} could not be read.` : ''}`;
      return;
    }
    const imported = songFromText(text('paste').value);
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
  // open a MIDI file: choose a track, and it becomes a melody or a drum-kit rhythm
  let midi: { file: MidiFile; name: string } | null = null;
  const midiStatus = $('midi-status');
  const trackSel = $<HTMLSelectElement>('midi-track');
  const showTracks = (): void => {
    if (!midi) return;
    trackSel.replaceChildren(
      ...midi.file.tracks.map(
        (t, i) =>
          new Option(
            `${t.name} · ${t.drum ? 'drums' : `channel ${t.channel + 1}`} · ${t.notes.length} notes`,
            String(i),
          ),
      ),
    );
    $('midi-track-label').hidden = midi.file.tracks.length < 2;
    $('midi-use').hidden = false;
  };
  $<HTMLInputElement>('midi-file').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;
    midiStatus.classList.remove('error');
    try {
      midi = {
        file: parseMidi(new Uint8Array(await picked.arrayBuffer())),
        name: picked.name.replace(/\.midi?$/i, ''),
      };
      showTracks();
      midiStatus.textContent = `Read ${midi.file.tracks.length} ${midi.file.tracks.length === 1 ? 'track' : 'tracks'}. Choose one and tap Use this track.`;
    } catch (err) {
      midi = null;
      $('midi-use').hidden = true;
      $('midi-track-label').hidden = true;
      midiStatus.classList.add('error');
      midiStatus.textContent = err instanceof Error ? err.message : String(err);
    }
  });
  $('midi-use').addEventListener('click', () => {
    const track = midi?.file.tracks[Number(trackSel.value)];
    if (!midi || !track) return;
    const title = (midi.file.title || midi.name || 'MIDI tune').slice(0, 80);
    const bpm = Math.min(240, Math.max(30, Math.round(midi.file.bpm)));
    try {
      stop();
      if (track.drum) {
        const r = midiToRhythm(track, midi.file.ppq, midi.file.beatsPerBar);
        fill({
          kind: 'rhythm',
          title,
          bpm,
          profile: 'drum-kit',
          lanes: r.lanes,
          stepsPerBeat: r.stepsPerBeat,
        });
        midiStatus.textContent = `Read ${r.bars} ${r.bars === 1 ? 'bar' : 'bars'} of drums. Check it above, then save.`;
      } else {
        const m = midiToMelody(track, midi.file.ppq);
        fill({ kind: 'melody', title, bpm, key: m.key, notes: m.notes });
        midiStatus.textContent =
          m.kept < m.found
            ? `Used the first ${m.kept} of ${m.found} notes. Check it above, then save.`
            : `Read ${m.kept} notes. Check it above, then save.`;
      }
      midiStatus.classList.remove('error');
      window.scrollTo({ top: 0 });
    } catch (err) {
      midiStatus.classList.add('error');
      midiStatus.textContent = err instanceof Error ? err.message : String(err);
    }
  });
  $('pack-save').addEventListener('click', () => {
    if (!pending?.ok) return;
    let saved = 0;
    for (const song of pending.songs) if (store.save({ ...song, id: undefined })) saved++;
    pending = null;
    $('pack-row').hidden = true;
    renderList();
    $('paste-status').textContent =
      saved === 0
        ? 'Could not save: there is no room for more songs. Delete some first.'
        : `Saved ${saved} ${saved === 1 ? 'song' : 'songs'}. They are in the song menus now.`;
  });
  $('copy-pack').addEventListener('click', () => {
    const songs = store.list();
    if (songs.length === 0) {
      $('preview').textContent = 'Nothing to copy yet.';
      return;
    }
    void copyText(packToText(songs)).then((ok) => {
      $('preview').textContent = ok
        ? `Copied ${songs.length} ${songs.length === 1 ? 'song' : 'songs'} as a pack. Paste it into a message, or into Paste a song on another device.`
        : 'Could not copy. Select the text in Paste a song instead.';
      if (!ok) text('paste').value = packToText(songs);
    });
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
    } else if (button.dataset['act'] === 'midi') {
      const song = store.get(id);
      const compiled = song ? compileSong(song) : null;
      if (!song || !compiled?.ok) return;
      const bytes = chartToMidi(compiled.charts[0]!.chart);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/midi' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${song.title.replace(/[^\w -]+/g, '').trim() || 'song'}.mid`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('preview').textContent = `Saved “${song.title}” as a MIDI file.`;
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
