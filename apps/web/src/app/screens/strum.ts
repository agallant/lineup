import { GUITAR_TUNINGS } from '@lineup/core';
import { guitarStrumPerformerFor, ukuleleNotePerformer, ukuleleStrumPerformer } from '@lineup/sim';
import { createHitScreen } from './hit';

/** Note letters, for naming a tuning's strings. */
const NOTE = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const strumScreen = createHitScreen({
  mode: 'Strumline',
  title: 'Strumline',
  subtitle: 'ukulele and guitar',
  keyPrefix: 'strum',
  strum: true,
  modes: [
    {
      id: 'ukulele-strum',
      label: 'Ukulele strumming',
      note: 'Four lines, one per string (A E C G, as in tab). The number on a line is the fret to hold on that string: 0 is open. A bar across the strings is a strum; a single number is a pluck. The timing is what is judged, and optionally the chord.',
    },
    ...GUITAR_TUNINGS.map((t) => ({
      id: `guitar-strum${t.suffix}`,
      label: `Guitar strumming, ${t.label}`,
      note: `Six lines, one per string (${[...t.open]
        .reverse()
        .map((m) => NOTE[m % 12])
        .join(
          ' ',
        )}, as in tab). The number on a line is the fret to hold on that string: 0 is open, and a string with no mark is not played. A bar across the strings is a strum; a single number is a pluck. The timing is what is judged, and optionally the chord. The songs are the ukulele ones, with guitar chords${t.suffix ? ' fingered for this tuning' : ''}.`,
    })),
  ],
  micPrompt:
    'Tap “Start mic”, then strum near the device. Every strum appears below (with its chord when chord checking is on).',
  bleedWarning: 'if the click is on. The mic hears the speaker as strums.',
  demo: (profile, options) => ({
    performer: options?.pitched
      ? ukuleleNotePerformer()
      : profile.id.startsWith('guitar-')
        ? guitarStrumPerformerFor(profile.id)
        : ukuleleStrumPerformer,
    model: null,
  }),
});
