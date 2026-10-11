import { exportBackup, importBackup, lineupKeys } from '../backup';
import { ProgressStore } from '../progress';
import type { Screen } from '../router';
import { ScoreStore } from '../scores';
import { applyTextSize, applyTheme } from '../appearance';
import {
  ACCOMPANIMENTS,
  DEFAULT_SETTINGS,
  GOAL_MINUTES,
  SettingsStore,
  safeLocalStorage,
  type TextSize,
  type Theme,
} from '../settings';
import { DIFFICULTIES } from '@lineup/core';

const DIFFICULTY_TEXT: Record<string, string> = {
  easy: 'Easy: forgiving of wobble',
  normal: 'Normal',
  strict: 'Strict: tight pitch and timing',
};
const ACCOMPANIMENT_TEXT: Record<string, string> = {
  off: 'Off',
  bass: 'Bass line',
  full: 'Bass and chords',
};

/** A file named like "lineup-backup-2026-10-11.json" offered for download. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Options: sound, scoring, how things are shown, and your data (reset and backup). */
export const optionsScreen: Screen = (root) => {
  const storage = safeLocalStorage();
  const settings = new SettingsStore(storage);

  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Options</h1>

    <section class="panel">
      <h2>Sound</h2>
      <label class="check"><input type="checkbox" data-id="metronome" /> Metronome clicks (needs headphones)</label>
      <label class="check"><input type="checkbox" data-id="guide" /> Guide tone: hear the target note (needs headphones)</label>
      <label class="check"><input type="checkbox" data-id="effects" /> Short jingles for a new best, a trophy or a level up</label>
      <div class="row"><label>Play-along backing <select data-id="accompaniment">${ACCOMPANIMENTS.map(
        (a) => `<option value="${a}">${ACCOMPANIMENT_TEXT[a]}</option>`,
      ).join('')}</select></label></div>
      <p class="muted">Backing is quiet music under the song. Use headphones, or the microphone will hear it.</p>
    </section>

    <section class="panel">
      <h2>Scoring</h2>
      <div class="row"><label>Singline and Windline pitch <select data-id="difficulty">${DIFFICULTIES.map(
        (d) => `<option value="${d}">${DIFFICULTY_TEXT[d] ?? d}</option>`,
      ).join('')}</select></label></div>
      <div class="row"><label>Windline octaves <select data-id="octave">
        <option value="auto">Any octave counts</option>
        <option value="exact">Exactly the octave shown</option></select></label></div>
      <label class="check"><input type="checkbox" data-id="chords" /> Strumline: also check the chords (experimental)</label>
    </section>

    <section class="panel">
      <h2>Practice goal</h2>
      <div class="row"><label>Minutes to practise each week <select data-id="goal">${GOAL_MINUTES.map(
        (m) => `<option value="${m}">${m === 0 ? 'No goal' : `${m} minutes`}</option>`,
      ).join('')}</select></label></div>
      <p class="muted">The home menu shows the last seven days against your goal.</p>
    </section>

    <section class="panel">
      <h2>Display</h2>
      <div class="row"><label>Colours <select data-id="theme">
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="contrast">High contrast</option></select></label></div>
      <div class="row"><label>Text size <select data-id="text-size">
        <option value="normal">Normal</option>
        <option value="large">Large</option>
        <option value="larger">Larger</option></select></label></div>
      <label class="check"><input type="checkbox" data-id="fingerings" /> Windline: show the fingering of the current and next note</label>
      <label class="check"><input type="checkbox" data-id="debug" /> Debug overlay while playing</label>
    </section>

    <section class="panel">
      <h2>Your data</h2>
      <p class="muted">Everything lives in this browser on this device. Nothing is ever sent anywhere.
        A backup file holds your settings, scores, progress, timing calibration and trained sounds.</p>
      <div class="row">
        <button data-id="export">Save a backup file</button>
        <label class="file">Restore from a backup <input type="file" accept="application/json,.json" data-id="import" /></label>
      </div>
      <div class="row">
        <button data-id="reset-settings">Reset options</button>
        <button data-id="clear-scores" class="danger">Erase scores</button>
        <button data-id="clear-progress" class="danger">Erase progress and trophies</button>
      </div>
      <p class="status" data-id="msg" role="status"></p>
    </section>
  `;

  const $ = <T extends HTMLElement>(id: string): T =>
    root.querySelector<T>(`[data-id="${id}"]`) as T;
  const msg = (text: string): void => {
    $('msg').textContent = text;
  };

  const show = (): void => {
    const v = settings.get();
    $<HTMLInputElement>('metronome').checked = v.metronome;
    $<HTMLInputElement>('guide').checked = v.guideTone;
    $<HTMLInputElement>('effects').checked = v.effects;
    $<HTMLSelectElement>('accompaniment').value = v.accompaniment;
    $<HTMLSelectElement>('difficulty').value = v.difficulty;
    $<HTMLSelectElement>('octave').value = v.windOctave;
    $<HTMLInputElement>('chords').checked = v.checkChords;
    $<HTMLInputElement>('fingerings').checked = v.showFingerings;
    $<HTMLInputElement>('debug').checked = v.debug;
    $<HTMLSelectElement>('goal').value = String(v.goalMinutes);
    $<HTMLSelectElement>('text-size').value = v.textSize;
    $<HTMLSelectElement>('theme').value = v.theme;
  };
  show();

  const checkbox = (
    id: string,
    key: 'metronome' | 'effects' | 'guideTone' | 'checkChords' | 'showFingerings' | 'debug',
  ) =>
    $<HTMLInputElement>(id).addEventListener('change', (e) =>
      settings.update({ [key]: (e.target as HTMLInputElement).checked }),
    );
  checkbox('metronome', 'metronome');
  checkbox('guide', 'guideTone');
  checkbox('effects', 'effects');
  checkbox('chords', 'checkChords');
  checkbox('fingerings', 'showFingerings');
  checkbox('debug', 'debug');
  $<HTMLSelectElement>('accompaniment').addEventListener('change', (e) =>
    settings.update({
      accompaniment: (e.target as HTMLSelectElement).value as (typeof ACCOMPANIMENTS)[number],
    }),
  );
  $<HTMLSelectElement>('difficulty').addEventListener('change', (e) =>
    settings.update({
      difficulty: (e.target as HTMLSelectElement).value as (typeof DIFFICULTIES)[number],
    }),
  );
  $<HTMLSelectElement>('octave').addEventListener('change', (e) =>
    settings.update({
      windOctave: (e.target as HTMLSelectElement).value === 'exact' ? 'exact' : 'auto',
    }),
  );

  $<HTMLSelectElement>('goal').addEventListener('change', (e) =>
    settings.update({ goalMinutes: Number((e.target as HTMLSelectElement).value) }),
  );
  $<HTMLSelectElement>('text-size').addEventListener('change', (e) => {
    const size = settings.update({
      textSize: (e.target as HTMLSelectElement).value as TextSize,
    }).textSize;
    applyTextSize(size);
  });

  $<HTMLSelectElement>('theme').addEventListener('change', (e) => {
    applyTheme(settings.update({ theme: (e.target as HTMLSelectElement).value as Theme }).theme);
  });

  $('reset-settings').addEventListener('click', () => {
    settings.update({ ...DEFAULT_SETTINGS, songs: {}, keyShifts: {} });
    show();
    applyTextSize(settings.get().textSize);
    applyTheme(settings.get().theme);
    msg('Options are back to their defaults.');
  });
  // erasing needs a second tap, so a stray touch cannot lose a high score
  const confirmed = (button: HTMLButtonElement, what: string, action: () => void): void => {
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    button.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        const label = button.textContent;
        button.textContent = 'Tap again to erase';
        msg(`This erases ${what}. Tap the button again within 5 seconds to confirm.`);
        timer = setTimeout(() => {
          armed = false;
          button.textContent = label;
          msg('');
        }, 5000);
        return;
      }
      clearTimeout(timer);
      armed = false;
      action();
    });
  };
  confirmed($<HTMLButtonElement>('clear-scores'), 'every best score', () => {
    new ScoreStore(storage).clear();
    msg('Scores erased.');
    $('clear-scores').textContent = 'Erase scores';
  });
  confirmed($<HTMLButtonElement>('clear-progress'), 'your level, streak and trophies', () => {
    new ProgressStore(storage).clear();
    msg('Progress erased.');
    $('clear-progress').textContent = 'Erase progress and trophies';
  });

  $('export').addEventListener('click', () => {
    if (!storage || lineupKeys(storage as unknown as Storage).length === 0) {
      msg('Nothing to back up yet.');
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    download(`lineup-backup-${day}.json`, exportBackup(storage as unknown as Storage));
    msg('Backup file saved. Keep it somewhere private.');
  });
  $<HTMLInputElement>('import').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !storage) return;
    void file.text().then((text) => {
      const n = importBackup(storage as unknown as Storage, text);
      input.value = '';
      if (n === null)
        msg('That is not a Lineup backup, or this device has no room for it. Nothing was changed.');
      else {
        show();
        msg(
          `Restored ${n} saved ${n === 1 ? 'item' : 'items'}. Reload the page to use them everywhere.`,
        );
      }
    });
  });
  return undefined;
};
