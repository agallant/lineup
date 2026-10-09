export interface MicStats {
  /** RMS level of the latest frame, dBFS. */
  levelDb: number;
  /** Highest peak recently, dBFS. */
  peakDb: number;
  /** Fraction (0..1) of the last second's frames that had a clear, in-range pitch. */
  voicedFraction: number;
}

export type MicStatus = 'silent' | 'quiet' | 'clipping' | 'unclear' | 'good';

export interface MicAdvice {
  status: MicStatus;
  message: string;
}

/** What to tell the player about their sound, from live meters. */
export function micAdvice({ levelDb, peakDb, voicedFraction }: MicStats): MicAdvice {
  if (peakDb >= -1) {
    return {
      status: 'clipping',
      message: 'Too loud: the signal is clipping. Move back from the mic or sing softer.',
    };
  }
  if (levelDb < -65) {
    return { status: 'silent', message: 'Waiting for sound. Sing a long “ah”.' };
  }
  if (levelDb < -48) {
    return { status: 'quiet', message: 'Quiet. Sing louder or move closer to the mic.' };
  }
  if (voicedFraction < 0.4) {
    return {
      status: 'unclear',
      message:
        'Loud enough, but I can’t lock onto a steady pitch. Sing a long, open “ah” rather than whispering.',
    };
  }
  return { status: 'good', message: 'Good: clear pitch and a healthy level.' };
}
