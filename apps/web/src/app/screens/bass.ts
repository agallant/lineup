import { ukuleleNotePerformer } from '@lineup/sim';
import { createHitScreen } from './hit';

export const bassScreen = createHitScreen({
  mode: 'Bassline',
  title: 'Bassline',
  subtitle: 'bass guitar',
  keyPrefix: 'bass',
  plucked: true,
  modes: [
    {
      id: 'bass',
      label: 'Bass guitar (four strings, EADG)',
      note: 'Four lines, one per string (G on top, then D, A and E, as in tab). The number on a line is the fret to hold on that string: 0 is open. Both the note you play and when you play it are judged, and any octave of the right note counts.',
    },
  ],
  micPrompt:
    'Tap “Start mic”, then play an open string. Use the bass’s own sound near the device (unplugged, or through an amp).',
  bleedWarning: 'if the click or drums are on. The mic hears the speaker as notes.',
  demo: () => ({ performer: ukuleleNotePerformer(0.3), model: null }),
});
