import { windPerformer } from '@lineup/sim';
import { createPitchScreen } from './pitch';

export const windScreen = createPitchScreen({
  mode: 'Windline',
  profileId: 'wind',
  title: 'Windline',
  subtitle: 'whistle, recorder, ocarina',
  micPrompt: 'Tap “Start mic”, then play a long steady note.',
  adviceText: {
    clipping: 'Too loud: the signal is clipping. Move back from the mic or blow more gently.',
    silent: 'Waiting for sound. Play a long steady note.',
    quiet: 'Quiet. Play a little stronger or move closer to the mic.',
    unclear:
      'Loud enough, but I can’t lock onto a steady pitch. Play one long, steady note and keep the air even.',
  },
  quietExamples: 'someone humming, a whistling kettle or a TV',
  rangeText: (low, high) =>
    `Play from ${low} to ${high}. The right octave matters, so use the Key menu to move the song to where your instrument sounds best.`,
  demoWho: 'player',
  demoPerformer: () =>
    windPerformer({
      timbre: 'recorder',
      chiff: 0.6,
      bendCents: -25,
      driftCents: 8,
      detuneSigma: 10,
    }),
});
