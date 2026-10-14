import type { KeyValueStore } from '@lineup/core';

/** A few lines of first-time help for one game. */
export interface Tip {
  title: string;
  steps: readonly string[];
}

/** Short, game-specific help, shown once at the top of a game until it is dismissed. */
export const TIPS: Readonly<Record<string, Tip>> = {
  singline: {
    title: 'Singing a song',
    steps: [
      'Use headphones, tap “Start mic”, and sing a long “ah” to check it hears you.',
      'Pick a song, then “Play”. Sing each note as it reaches the line; any octave of the note counts.',
      'Stars come from how many notes you hit. “Listen first” plays the song before you sing it.',
    ],
  },
  windline: {
    title: 'Playing a tune',
    steps: [
      'Choose your instrument first: the song moves into its key and the chart shows the fingerings.',
      'Tap “Start mic” and play a note, then pick a song and “Play”.',
      'Slow it down with Speed; a clean run offers the next speed up.',
    ],
  },
  strumline: {
    title: 'Strumming along',
    steps: [
      'Tap “Start mic”, hold your ukulele near the device, and pick a song.',
      'Strum when a bar reaches the line; a single number is a pluck on that string and fret.',
      'Start slow with Speed, then try “Also check the chords”.',
    ],
  },
  bassline: {
    title: 'Playing bass',
    steps: [
      'Tap “Start mic” and play an open string; keep the bass near the device.',
      'Pick a song, then “Play”. Each note shows its string and fret; play it as it reaches the line.',
      'Start slow with Speed, and try the drum loop in Options for a band feel.',
    ],
  },
  keyline: {
    title: 'Playing keys',
    steps: [
      'Plug in a MIDI keyboard and tap “Connect”, or use the on-screen keys or A S D F G H J K.',
      'Notes fall onto the keyboard; press the key as a note reaches it. Chords are several notes at once.',
      'Start slow with Speed. Turn off the piano sound if your keyboard makes its own.',
    ],
  },
  beatline: {
    title: 'Clapping and drumming',
    steps: [
      'Clap, tap or drum near the device after tapping “Start mic”.',
      'For two or more sounds, “Teach it your sounds” first so it can tell them apart.',
      'Try “Listen first” to hear a rhythm, then play it back from memory.',
    ],
  },
};

const KEY = 'lineup.tour.v1';

/** Remembers which games' tips were dismissed, tolerating missing or corrupt storage. */
export class TourStore {
  private seen: Set<string>;

  constructor(private readonly store: KeyValueStore | null) {
    this.seen = this.read();
  }

  /** Whether a game's tips are still to be shown. */
  pending(game: string): boolean {
    return Object.hasOwn(TIPS, game) && !this.read().has(game);
  }

  /** Marks a game's tips as seen. */
  dismiss(game: string): void {
    this.seen = this.read();
    this.seen.add(game);
    try {
      this.store?.setItem(KEY, JSON.stringify([...this.seen]));
    } catch {
      // storage blocked: the tips come back next visit, which is harmless
    }
  }

  private read(): Set<string> {
    try {
      const raw = JSON.parse(this.store?.getItem(KEY) ?? '[]') as unknown;
      return new Set(
        Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [],
      );
    } catch {
      return this.seen ?? new Set();
    }
  }
}

/**
 * Puts a game's tips under its heading if they have not been dismissed. A game with no tips, or
 * with a heading missing, gets nothing.
 */
export function mountTour(root: HTMLElement, game: string, store: TourStore): void {
  const tip = TIPS[game];
  const h1 = root.querySelector('h1');
  if (!tip || !h1 || !store.pending(game)) return;
  const aside = document.createElement('aside');
  aside.className = 'panel tour';
  aside.dataset['id'] = 'tour';
  const title = document.createElement('strong');
  title.textContent = tip.title;
  const list = document.createElement('ol');
  for (const step of tip.steps) {
    const li = document.createElement('li');
    li.textContent = step;
    list.append(li);
  }
  const button = document.createElement('button');
  button.dataset['id'] = 'tour-dismiss';
  button.textContent = 'Got it';
  button.addEventListener('click', () => {
    store.dismiss(game);
    aside.remove();
  });
  aside.append(title, list, button);
  h1.after(aside);
}
