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
      note: 'Strum on the beat. Down and up strums are shown as a guide; the timing is what is judged, and optionally the chord.',
    },
  ],
  micPrompt:
    'Tap “Start mic”, then strum near the device. Every strum appears below (with its chord when chord checking is on).',
  bleedWarning: 'if the click is on. The mic hears the speaker as strums.',
  demo: () => ({ performer: ukuleleStrumPerformer, model: null }),
});
