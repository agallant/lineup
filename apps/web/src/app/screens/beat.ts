import { enrollSynthetic, percussionPerformer, type HitSound } from '@lineup/sim';
import { clap, hihat, kick, snare, tap } from '@lineup/testkit';
import { createHitScreen } from './hit';

/** The sounds the auto-play demo (and the "demo sounds" enrollment) uses for each timbre class. */
const DEMO_SOUNDS: Record<string, Record<string, HitSound>> = {
  clap: { hit: clap },
  'hand-percussion': { clap, tap },
  'drum-kit': { kick, snare, hat: hihat },
};

export const beatScreen = createHitScreen({
  mode: 'Beatline',
  title: 'Beatline',
  subtitle: 'claps, taps &amp; percussion',
  keyPrefix: 'beat',
  modes: [
    { id: 'clap', label: 'Clap (any hit)', note: 'One lane. Any sound counts: clap, tap, snap.' },
    {
      id: 'hand-percussion',
      label: 'Clap + tap (2 lanes)',
      note: 'Two lanes. You teach it your clap and your tap first.',
    },
    {
      id: 'drum-kit',
      label: 'Drum kit (experimental)',
      note: 'Kick / snare / hat. Not tested with a real kit yet.',
    },
  ],
  micPrompt: 'Tap “Start mic”, then clap or tap near the device. Every hit appears below.',
  bleedWarning: 'if the click is on. The mic hears the speaker as hits.',
  demo: (profile) => {
    const sounds = DEMO_SOUNDS[profile.id]!;
    return {
      performer: percussionPerformer(sounds, { variation: 0.2 }),
      model:
        (profile.timbreClasses?.length ?? 1) > 1 ? enrollSynthetic(profile, sounds).model : null,
    };
  },
});
