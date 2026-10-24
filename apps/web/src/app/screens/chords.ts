import {
  CHORD_QUALITIES,
  GUITAR_STANDARD,
  ROOT_NAMES,
  UKULELE_OPEN,
  chordFrets,
  defaultFingering,
  chordPitchClasses,
  chordPositions,
  describeFingering,
  parseChordName,
  type Voicing,
} from '@lineup/core';
import { chordDiagramSvg } from '../chord-diagram';
import { chooseFingering } from '../chord-prefs';
import { hashParam } from '../courses';
import { escapeHtml, closeAudio } from '../audio';
import { playTonesNow } from '../game/backing';
import type { Screen } from '../router';
import { safeLocalStorage } from '../settings';

const STORE_KEY = 'lineup.chords.v1';

type Instrument = 'ukulele' | 'guitar';

interface Saved {
  instrument: Instrument;
  chord: string;
}

function loadSaved(): Saved {
  const fallback: Saved = { instrument: 'ukulele', chord: 'C' };
  try {
    const r = JSON.parse(safeLocalStorage()?.getItem(STORE_KEY) ?? 'null') as Partial<Saved> | null;
    if (!r || typeof r !== 'object') return fallback;
    return {
      instrument: r.instrument === 'guitar' ? 'guitar' : 'ukulele',
      chord: typeof r.chord === 'string' && parseChordName(r.chord) ? r.chord : fallback.chord,
    };
  } catch {
    return fallback;
  }
}

/** A chord finder: any chord by name, with where to play it on the ukulele or guitar, in several places on the neck. */
export const chordsScreen: Screen = (root) => {
  const saved = loadSaved();
  // a link from a song names the chord (and instrument) to look at
  const linked = hashParam(location.hash, 'chord');
  if (linked && parseChordName(linked)) saved.chord = linked;
  const linkedInstrument = hashParam(location.hash, 'instrument');
  if (linkedInstrument === 'guitar' || linkedInstrument === 'ukulele') {
    saved.instrument = linkedInstrument;
  }
  const save = () => {
    try {
      safeLocalStorage()?.setItem(STORE_KEY, JSON.stringify(saved));
    } catch {
      // storage blocked: the choices last for this visit only
    }
  };

  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Chord finder</h1>
    <p class="muted">Look up any chord and see how to play it on the ukulele or the guitar. The same chord
      can be played in several places on the neck: the shapes slide, so learn a few and you have them all.</p>
    <section class="panel">
      <div class="row">
        <label>Instrument
          <select data-id="instrument">
            <option value="ukulele">Ukulele (G C E A)</option>
            <option value="guitar">Guitar (E A D G B E)</option>
          </select>
        </label>
        <label>Chord
          <input data-id="name" type="text" value="" size="10" autocomplete="off" autocapitalize="none"
            spellcheck="false" aria-describedby="name-help" />
        </label>
      </div>
      <p class="muted" id="name-help">Type a name such as F#m, Bb7, Cmaj7, Dsus4, E5 or G/B, or choose below.</p>
      <div class="row" data-id="roots" role="group" aria-label="Root note"></div>
      <div class="row">
        <label>Kind
          <select data-id="quality"></select>
        </label>
        <label>Bass note
          <select data-id="bass"></select>
        </label>
      </div>
      <p class="status" data-id="status" role="status"></p>
    </section>
    <section class="panel" data-id="result" hidden>
      <h2 data-id="title"></h2>
      <p class="muted" data-id="notes"></p>
      <div class="diagrams" data-id="diagrams"></div>
    </section>
  `;
  const q = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-id="${id}"]`)!;
  const instrumentSel = q<HTMLSelectElement>('instrument');
  const nameInput = q<HTMLInputElement>('name');
  const rootsBox = q<HTMLElement>('roots');
  const qualitySel = q<HTMLSelectElement>('quality');
  const bassSel = q<HTMLSelectElement>('bass');
  const status = q<HTMLElement>('status');
  const result = q<HTMLElement>('result');
  const title = q<HTMLElement>('title');
  const notes = q<HTMLElement>('notes');
  const diagrams = q<HTMLElement>('diagrams');

  for (const [i, name] of ROOT_NAMES.entries()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset['root'] = String(i);
    b.textContent = name;
    b.setAttribute('aria-pressed', 'false');
    rootsBox.append(b);
  }
  for (const quality of CHORD_QUALITIES) {
    qualitySel.append(new Option(`${quality.id || 'major'} (${quality.label})`, quality.id));
  }
  qualitySel.options[0]!.text = 'major';
  bassSel.append(new Option('the root', ''));
  for (const [i, name] of ROOT_NAMES.entries()) bassSel.append(new Option(name, String(i)));

  let ctx: AudioContext | null = null;
  const open = (): readonly number[] =>
    saved.instrument === 'guitar' ? GUITAR_STANDARD : UKULELE_OPEN;
  const profileId = (): string | undefined =>
    saved.instrument === 'guitar' ? 'guitar-strum' : undefined;

  const hear = (frets: readonly (number | null)[]) => {
    ctx ??= new AudioContext();
    void ctx.resume();
    const strings = open();
    const midis = frets.flatMap((f, i) => (f === null ? [] : [strings[i]! + f]));
    // the strings in turn, quickly, as a strum
    playTonesNow(
      ctx,
      midis.map((midi) => ({
        midi: midi + 12,
        duration: 1.2,
        level: 0.9,
        voice: 'pluck' as const,
      })),
      0.03,
    );
  };

  /** Brings the pickers into line with a chord name. */
  const syncPickers = (name: string) => {
    const c = parseChordName(name);
    if (!c) return;
    qualitySel.value = c.quality.id;
    bassSel.value = c.bass === null ? '' : String(c.bass);
    for (const b of rootsBox.querySelectorAll<HTMLButtonElement>('button')) {
      b.setAttribute('aria-pressed', String(Number(b.dataset['root']) === c.root));
    }
  };

  const show = () => {
    instrumentSel.value = saved.instrument;
    const parsed = parseChordName(saved.chord);
    if (!parsed) {
      status.textContent = 'That is not a chord name I know. Try something like Am, F#m7 or Dsus4.';
      result.hidden = true;
      return;
    }
    status.textContent = '';
    syncPickers(saved.chord);
    // the ukulele plays a two-note power chord as the major chord of the same root
    const asPlayed =
      saved.instrument === 'ukulele' && parsed.quality.id === '5'
        ? ROOT_NAMES[parsed.root]!
        : saved.chord;
    const used = chordFrets(profileId(), asPlayed);
    const easiest = defaultFingering(profileId(), asPlayed);
    if (used === null || easiest === null) {
      const named = chordPitchClasses(parsed).length;
      status.textContent = `The ${saved.instrument} has no fingering for ${saved.chord}${named > open().length ? ` (it has ${named} different notes and the ${saved.instrument} has ${open().length} strings)` : ''}. Try leaving out the bass note or a simpler kind.`;
      result.hidden = true;
      return;
    }
    result.hidden = false;
    // the notes this fingering really sounds, from the root up
    const sounding = new Set(used.flatMap((f, i) => (f === null ? [] : [(open()[i]! + f) % 12])));
    const spelled = [...sounding]
      .sort((a, b) => ((a - parsed.root + 12) % 12) - ((b - parsed.root + 12) % 12))
      .map((pc) => ROOT_NAMES[pc]);
    title.textContent = `${saved.chord}: ${parsed.quality.label}${parsed.bass === null ? '' : ` with ${ROOT_NAMES[parsed.bass]} in the bass`}`;
    notes.textContent = `Notes: ${spelled.join(' ')}${asPlayed === saved.chord ? '' : `. The ukulele plays ${saved.chord} as ${asPlayed}.`}`;
    const same = (a: readonly (number | null)[], b: readonly (number | null)[]) =>
      a.join(',') === b.join(',');
    const rest = chordPositions(open(), asPlayed, saved.instrument === 'guitar', 8).filter(
      (v) => !same(v.frets, easiest),
    );
    const cards: { v: Voicing; label: string }[] = [
      { v: describeFingering(easiest), label: 'Easiest' },
      ...rest.map((v) => ({ v, label: v.position === 0 ? 'Open position' : `Fret ${v.position}` })),
    ];
    // a fingering chosen earlier that the list above does not show is kept in view
    if (!cards.some((c) => same(c.v.frets, used))) {
      cards.splice(1, 0, { v: describeFingering(used), label: 'Your choice' });
    }
    diagrams.innerHTML = cards
      .map(({ v, label }, i) => {
        const isUsed = same(v.frets, used);
        return `<figure class="chord-card${isUsed ? ' chosen' : ''}">
          ${chordDiagramSvg(v, `${saved.chord} ${label}`)}
          <figcaption>${escapeHtml(label)}${isUsed ? ' · used in songs' : ''}</figcaption>
          <button type="button" data-hear="${i}">Hear it</button>
          <button type="button" data-use="${i}" ${isUsed ? 'disabled' : ''}>Use this one</button>
        </figure>`;
      })
      .join('');
    for (const b of diagrams.querySelectorAll<HTMLButtonElement>('[data-hear]')) {
      b.addEventListener('click', () => hear(cards[Number(b.dataset['hear'])]!.v.frets));
    }
    for (const b of diagrams.querySelectorAll<HTMLButtonElement>('[data-use]')) {
      b.addEventListener('click', () => {
        const pick = cards[Number(b.dataset['use'])]!;
        // the easiest one is the default: choosing it forgets any other choice
        chooseFingering(
          saved.instrument,
          asPlayed,
          same(pick.v.frets, easiest) ? null : pick.v.frets,
        );
        show();
        status.textContent = `Songs and exercises now use this ${asPlayed} on the ${saved.instrument}, except the slide-a-shape exercises, which teach their own shapes.`;
      });
    }
  };

  const setChord = (name: string) => {
    saved.chord = name;
    nameInput.value = name;
    save();
    show();
  };
  const fromPickers = () => {
    const rootButton = rootsBox.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    const rootIndex = rootButton ? Number(rootButton.dataset['root']) : 0;
    const bass = bassSel.value === '' ? '' : `/${ROOT_NAMES[Number(bassSel.value)]}`;
    setChord(`${ROOT_NAMES[rootIndex]}${qualitySel.value}${bass}`);
  };

  instrumentSel.addEventListener('change', () => {
    saved.instrument = instrumentSel.value === 'guitar' ? 'guitar' : 'ukulele';
    save();
    show();
  });
  rootsBox.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-root]');
    if (!b) return;
    for (const other of rootsBox.querySelectorAll('button')) {
      other.setAttribute('aria-pressed', String(other === b));
    }
    fromPickers();
  });
  qualitySel.addEventListener('change', fromPickers);
  bassSel.addEventListener('change', fromPickers);
  nameInput.addEventListener('input', () => {
    const name = nameInput.value.trim();
    if (parseChordName(name)) {
      saved.chord = name;
      save();
      show();
    } else {
      status.textContent = name === '' ? '' : `“${name}” is not a chord I know yet.`;
      result.hidden = true;
    }
  });

  nameInput.value = saved.chord;
  show();
  return () => {
    if (ctx) closeAudio(ctx);
  };
};
