import { describe, expect, it } from 'vitest';
import {
  codeToMidi,
  midiSupported,
  openMidi,
  parseKeyMessage,
  toAudioTime,
  type MidiAccessLike,
  type MidiInputLike,
} from './midi-input';

describe('parseKeyMessage', () => {
  it('reads note on and off', () => {
    expect(parseKeyMessage([0x90, 60, 127], 5)).toEqual({
      type: 'on',
      midi: 60,
      velocity: 1,
      timeStamp: 5,
    });
    expect(parseKeyMessage([0x83, 61, 40], 5)).toMatchObject({ type: 'off', midi: 61 });
  });
  it('treats a note-on at velocity 0 as a note-off', () => {
    expect(parseKeyMessage([0x91, 60, 0], 0)).toMatchObject({ type: 'off', velocity: 0 });
  });
  it('ignores everything else', () => {
    expect(parseKeyMessage([0xb0, 64, 127], 0)).toBeNull(); // sustain pedal
    expect(parseKeyMessage([0xf8], 0)).toBeNull(); // clock
    expect(parseKeyMessage([0x90, 60], 0)).toBeNull(); // truncated
    expect(parseKeyMessage([0x90, 200, 60], 0)).toBeNull(); // out of range
  });
});

describe('toAudioTime', () => {
  it('goes back by how long ago the key was struck', () => {
    expect(toAudioTime(1000, 1050, 10)).toBeCloseTo(9.95);
  });
  it('never puts a key in the future', () => {
    expect(toAudioTime(2000, 1000, 10)).toBe(10);
  });
});

describe('codeToMidi', () => {
  it('maps the home row to a scale', () => {
    expect(['KeyA', 'KeyS', 'KeyD', 'KeyF'].map((c) => codeToMidi(c, 60))).toEqual([
      60, 62, 64, 65,
    ]);
    expect(codeToMidi('KeyW', 60)).toBe(61);
    expect(codeToMidi('Semicolon', 60)).toBe(76);
  });
  it('is null for other keys, including prototype names', () => {
    expect(codeToMidi('KeyQ', 60)).toBeNull();
    expect(codeToMidi('constructor', 60)).toBeNull();
  });
});

describe('openMidi', () => {
  const fake = (): { access: MidiAccessLike; inputs: MidiInputLike[] } => {
    const inputs: MidiInputLike[] = [{ name: 'Piano', onmidimessage: null }];
    const access: MidiAccessLike = {
      inputs: { forEach: (cb) => inputs.forEach(cb) },
      onstatechange: null,
    };
    return { access, inputs };
  };

  it('delivers keys from every input, including ones plugged in later', async () => {
    const { access, inputs } = fake();
    const got: string[] = [];
    let changes = 0;
    const s = await openMidi(
      (m) => got.push(`${m.type}${m.midi}`),
      () => changes++,
      access,
    );
    inputs[0]!.onmidimessage!({ data: new Uint8Array([0x90, 60, 90]), timeStamp: 1 });
    inputs.push({ name: null, onmidimessage: null });
    access.onstatechange!();
    inputs[1]!.onmidimessage!({ data: new Uint8Array([0x80, 62, 0]), timeStamp: 2 });
    inputs[1]!.onmidimessage!({ data: null, timeStamp: 3 });
    expect(got).toEqual(['on60', 'off62']);
    expect(changes).toBe(1);
    expect(s.devices()).toEqual(['Piano', 'MIDI keyboard']);
    s.close();
    expect(inputs[0]!.onmidimessage).toBeNull();
    expect(access.onstatechange).toBeNull();
  });
});

describe('midiSupported', () => {
  it('needs requestMIDIAccess', () => {
    expect(midiSupported({})).toBe(false);
    expect(midiSupported({ requestMIDIAccess: () => undefined })).toBe(true);
  });
});
