import { ukuleleStrumPerformer } from '@lineup/sim';
import { createHitScreen } from './hit';

export const strumScreen = createHitScreen({
  mode: 'Strumline',
  title: 'Strumline',
  subtitle: 'ukulele',
  keyPrefix: 'strum',
  strum: true,
  modes: [
    {
      id: 'ukulele-strum',
      label: 'Ukulele strumming',
      note: 'Four lines, one per string (A E C G, as in tab). The number on a line is the fret to hold on that string: 0 is open. A bar across the strings is a strum; a single number is a pluck. The timing is what is judged, and optionally the chord.',
    },
  ],
  micPrompt:
    'Tap “Start mic”, then strum near the device. Every strum appears below (with its chord when chord checking is on).',
  bleedWarning: 'if the click is on. The mic hears the speaker as strums.',
  demo: () => ({ performer: ukuleleStrumPerformer, model: null }),
});
