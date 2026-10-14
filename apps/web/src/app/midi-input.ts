/** A key going down or up on a MIDI keyboard. */
export interface KeyMessage {
  type: 'on' | 'off';
  /** MIDI note number, 0..127. */
  midi: number;
  /** 0..1 (a note-on at velocity 0 is a note-off, as MIDI defines it). */
  velocity: number;
  /** Milliseconds on the `performance.now()` clock, when the browser says the key was struck. */
  timeStamp: number;
}

/** Reads one raw MIDI message; anything but a note on or off (clock, pedal, pitch bend...) is null. */
export function parseKeyMessage(data: ArrayLike<number>, timeStamp: number): KeyMessage | null {
  if (data.length < 3) return null;
  const status = data[0]! & 0xf0;
  if (status !== 0x90 && status !== 0x80) return null;
  const midi = data[1]!;
  const raw = data[2]!;
  if (midi > 127 || raw > 127) return null;
  const on = status === 0x90 && raw > 0;
  return { type: on ? 'on' : 'off', midi, velocity: on ? raw / 127 : 0, timeStamp };
}

/** Converts a browser event timestamp to seconds on an audio clock, given both clocks' readings now. */
export function toAudioTime(timeStamp: number, nowMs: number, ctxNow: number): number {
  // a stamp from the future (a clock quirk) is clamped to now: a key cannot be struck ahead of time
  return ctxNow - Math.max(0, nowMs - timeStamp) / 1000;
}

/** The slice of the Web MIDI API used here, so tests can stand in for it. */
export interface MidiInputLike {
  name?: string | null;
  onmidimessage: ((e: { data: Uint8Array | null; timeStamp: number }) => void) | null;
}
export interface MidiAccessLike {
  inputs: { forEach(cb: (input: MidiInputLike) => void): void };
  onstatechange: (() => void) | null;
}

export interface MidiSession {
  /** Names of the keyboards connected now. */
  devices(): string[];
  close(): void;
}

/** Whether this browser can talk to MIDI devices at all (Safari on iPad cannot). */
export function midiSupported(nav: { requestMIDIAccess?: unknown } = navigator): boolean {
  return typeof nav.requestMIDIAccess === 'function';
}

/**
 * Listens to every connected MIDI input, including keyboards plugged in later.
 * `onChange` is told when the list of devices changes.
 */
export async function openMidi(
  onKey: (m: KeyMessage) => void,
  onChange: () => void = () => undefined,
  access?: MidiAccessLike,
): Promise<MidiSession> {
  const acc =
    access ??
    (await (
      navigator as unknown as { requestMIDIAccess(): Promise<MidiAccessLike> }
    ).requestMIDIAccess());
  const attach = () => {
    acc.inputs.forEach((input) => {
      input.onmidimessage = (e) => {
        const m = e.data ? parseKeyMessage(e.data, e.timeStamp) : null;
        if (m) onKey(m);
      };
    });
  };
  attach();
  acc.onstatechange = () => {
    attach();
    onChange();
  };
  return {
    devices() {
      const names: string[] = [];
      acc.inputs.forEach((i) => names.push(i.name || 'MIDI keyboard'));
      return names;
    },
    close() {
      acc.inputs.forEach((i) => (i.onmidimessage = null));
      acc.onstatechange = null;
    },
  };
}

/** The computer keyboard as a piano: a row of white keys on A–; and the black keys above on W E T Y U O P. */
const CODE_TO_SEMITONE: Readonly<Record<string, number>> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
  KeyP: 15,
  Semicolon: 16,
};

/** The MIDI note a computer key plays, with `baseMidi` as the C it starts on; null for other keys. */
export function codeToMidi(code: string, baseMidi: number): number | null {
  const s = Object.hasOwn(CODE_TO_SEMITONE, code) ? CODE_TO_SEMITONE[code] : undefined;
  return s === undefined ? null : baseMidi + s;
}
