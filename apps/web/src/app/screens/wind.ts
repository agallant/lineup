import { windPerformer } from '@lineup/sim';
import { createPitchScreen } from './pitch';

export const windScreen = createPitchScreen({
  mode: 'Windline',
  profileId: 'wind',
  title: 'Windline',
  subtitle: 'whistle, recorder, ocarina',
  micPrompt: 'Tap “Start mic”, then play a long steady note.',
  quietExamples: 'someone humming, a whistling kettle or a TV',
  instruments: true,
  rangeText: (low, high) =>
    `Plays from ${low} to ${high}. The song is moved into your instrument's key; the octave matters (a fingering has one register), so use Extra shift if it sits too low or high.`,
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
