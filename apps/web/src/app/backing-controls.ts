import { escapeHtml } from './audio';
import { ACCOMPANIMENT_FEELS } from './game/accompaniment';
import { DRONES, type Drone } from './game/backing';
import { DRUM_LABELS, DRUM_STYLES } from './game/drums';
import { ACCOMPANIMENTS, type Accompaniment, type SettingsStore } from './settings';

/** How each drone is described in a menu. */
export const DRONE_LABELS: Readonly<Record<Drone, string>> = {
  off: 'Off',
  root: 'The key note',
  fifth: 'Key note and fifth',
  octave: 'Key note and octave',
  tanpura: 'Tanpura (plucked)',
};

/**
 * The backing options on a game's set-up page: the feel of the play-along music and the drum loop,
 * kept in the same settings as Options so a change here shows there. Either can be left out when the
 * game has no use for it (a rhythm game has no chords to play along with); `mic: false` drops the
 * headphones advice for a game that does not listen (Keyline).
 */
export function mountBackingControls(
  box: HTMLElement,
  settings: SettingsStore,
  {
    music = true,
    drums = true,
    drone = false,
    mic = true,
  }: { music?: boolean; drums?: boolean; drone?: boolean; mic?: boolean } = {},
): void {
  const labels: Record<string, string> = {
    off: 'Off',
    ...Object.fromEntries(ACCOMPANIMENT_FEELS.map((f) => [f.id, f.label])),
  };
  box.innerHTML = `
    <div class="row">
      ${
        music
          ? `<label>Play-along music <select data-id="backing-music">${ACCOMPANIMENTS.map(
              (a) => `<option value="${a}">${escapeHtml(labels[a] ?? a)}</option>`,
            ).join('')}</select></label>`
          : ''
      }
      ${
        drone
          ? `<label>Drone <select data-id="backing-drone">${DRONES.map(
              (d) => `<option value="${d}">${escapeHtml(DRONE_LABELS[d])}</option>`,
            ).join('')}</select></label>`
          : ''
      }
      ${
        drums
          ? `<label>Drums <select data-id="backing-drums">${DRUM_STYLES.map(
              (d) => `<option value="${d}">${escapeHtml(DRUM_LABELS[d])}</option>`,
            ).join('')}</select></label>`
          : ''
      }
    </div>
    <p class="muted">${music ? 'Quiet music under the song.' : 'A quiet drum loop under the song.'} “Match the song” picks a feel to suit its tempo and meter and changes it as the song goes.${mic ? ' Use headphones, or the microphone will hear it.' : ''}</p>`;
  const music$ = box.querySelector<HTMLSelectElement>('[data-id=backing-music]');
  const drums$ = box.querySelector<HTMLSelectElement>('[data-id=backing-drums]');
  const drone$ = box.querySelector<HTMLSelectElement>('[data-id=backing-drone]');
  const v = settings.get();
  if (music$) {
    music$.value = v.accompaniment;
    music$.addEventListener('change', () =>
      settings.update({ accompaniment: music$.value as Accompaniment }),
    );
  }
  if (drone$) {
    drone$.value = v.drone;
    drone$.addEventListener('change', () => settings.update({ drone: drone$.value as Drone }));
  }
  if (drums$) {
    drums$.value = v.drums;
    drums$.addEventListener('change', () =>
      settings.update({ drums: drums$.value as (typeof DRUM_STYLES)[number] }),
    );
  }
}
