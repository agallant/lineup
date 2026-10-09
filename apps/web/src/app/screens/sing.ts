import { voicePerformer } from '@lineup/sim';
import { createPitchScreen } from './pitch';

export const singScreen = createPitchScreen({
  mode: 'Singline',
  profileId: 'voice',
  title: 'Singline',
  subtitle: 'voice',
  micPrompt: 'Tap “Start mic”, then sing a long “ah”.',
  quietExamples: 'singing, humming or a TV',
  rangeText: (low, high) =>
    `Sing from ${low} to ${high}. Octave-forgiving: any octave of the right note counts, so sing it where it's comfortable.`,
  demoWho: 'singer',
  demoPerformer: () =>
    voicePerformer({ vibratoCents: 25, scoopCents: 60, driftCents: 10, detuneSigma: 12 }),
});
