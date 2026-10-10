import handPercussion from './profiles/hand-percussion.json';
/* eslint-disable @typescript-eslint/no-explicit-any -- the mutation table pokes at untyped JSON on purpose */
import { describe, expect, it } from 'vitest';
import {
  laneForTimbre,
  loadProfile,
  tabForPitch,
  writtenMidi,
  type InstrumentProfile,
} from './profile';
import { builtinProfiles, getProfile } from './profiles';
import ukuleleNote from './profiles/ukulele-note.json';
import ukuleleStrum from './profiles/ukulele-strum.json';
import voice from './profiles/voice.json';
import wind from './profiles/wind.json';

/** A minimal valid percussion-style profile, mutated by the error table below. */
const base = () =>
  ({
    id: 'test-perc',
    name: 'Test percussion',
    mode: 'beatline',
    input: 'percussion',
    renderer: 'percussion-lanes',
    lanes: [
      { id: 'a', label: 'A', color: '#fff', timbre: 'clap' },
      { id: 'b', label: 'B', color: '#000', timbre: 'tap' },
    ],
    timbreClasses: [
      { id: 'clap', label: 'Clap', prompt: 'Clap' },
      { id: 'tap', label: 'Tap', prompt: 'Tap the table' },
    ],
    detector: {
      windowSize: 1024,
      hopSize: 256,
      clarityThreshold: 0.8,
      minLevelDb: -60,
      minHz: 80,
      maxHz: 2000,
      stabilityGateMs: 0,
      onset: { riseDb: 8, refractoryMs: 50, lookbackMs: 30, minLevelDb: -55 },
    },
    judgment: {
      strategy: 'discrete',
      timing: { perfectMs: 40, goodMs: 100 },
      match: { lane: true, pitch: false, chord: false },
    },
  }) as Record<string, any>;

describe('built-in profiles', () => {
  it('all validate (they are checked when the module loads)', () => {
    expect(Object.keys(builtinProfiles).sort()).toEqual([
      'clap',
      'drum-kit',
      'hand-percussion',
      'ukulele-note',
      'ukulele-strum',
      'voice',
      'wind',
    ]);
  });

  it.each([
    ['ukulele-strum', ukuleleStrum],
    ['ukulele-note', ukuleleNote],
    ['voice', voice],
    ['wind', wind],
  ])('%s loads with no warnings (every field it uses is a known one)', (_id, raw) => {
    const r = loadProfile(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
  });

  it('ukulele profiles use GCEA re-entrant tuning', () => {
    for (const id of ['ukulele-strum', 'ukulele-note']) {
      const t = getProfile(id).tuning!;
      expect(t.reentrant).toBe(true);
      expect(t.strings.map((s) => [s.label, s.midi])).toEqual([
        ['G4', 67],
        ['C4', 60],
        ['E4', 64],
        ['A4', 69],
      ]);
    }
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'getProfile treats inherited Object.prototype names like "%s" as unknown ids',
    (id) => {
      expect(() => getProfile(id)).toThrow(/unknown instrument profile/);
    },
  );

  it('getProfile explains an unknown id', () => {
    expect(() => getProfile('kazoo')).toThrow(
      /unknown instrument profile "kazoo" \(have: ukulele-strum, ukulele-note, voice, wind, clap, hand-percussion, drum-kit\)/,
    );
  });

  it('loadProfile round-trips the raw JSON to the same profile', () => {
    const r = loadProfile(ukuleleStrum);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(builtinProfiles['ukulele-strum']);
  });
});

describe('loadProfile: valid', () => {
  it('accepts the percussion base', () => {
    expect(loadProfile(base()).ok).toBe(true);
  });
});

describe('loadProfile: readable errors', () => {
  const cases: [string, (p: Record<string, any>) => void, string][] = [
    [
      'bad id characters',
      (p) => (p['id'] = 'Test Perc'),
      'id: expected lowercase letters, digits and dashes (got "Test Perc")',
    ],
    ['missing name', (p) => delete p['name'], 'name: required, expected non-empty text'],
    [
      'unknown mode',
      (p) => (p['mode'] = 'kazooline'),
      'mode: expected one of strumline, singline, windline, beatline (got "kazooline")',
    ],
    [
      'unknown renderer',
      (p) => (p['renderer'] = 'hologram'),
      'renderer: expected one of lane-highway, pitch-highway, percussion-lanes (got "hologram")',
    ],
    [
      'window not a power of two',
      (p) => (p['detector'].windowSize = 1000),
      'detector.windowSize: expected a power of two (got 1000)',
    ],
    [
      'hop larger than window',
      (p) => (p['detector'].hopSize = 2048),
      'detector.hopSize: must not exceed windowSize (1024)',
    ],
    [
      'clarity out of range',
      (p) => (p['detector'].clarityThreshold = 1.5),
      'detector.clarityThreshold: expected a number from 0 to 1 (got 1.5)',
    ],
    [
      'minHz above maxHz',
      (p) => (p['detector'].minHz = 3000),
      'detector: minHz (3000) must be below maxHz (2000)',
    ],
    [
      'missing onset settings',
      (p) => delete p['detector'].onset,
      'detector.onset: required, expected an object',
    ],
    [
      'perfect window wider than good',
      (p) => (p['judgment'].timing = { perfectMs: 200, goodMs: 100 }),
      'judgment.timing: perfectMs (200) must not exceed goodMs (100)',
    ],
    [
      'continuous without pitch settings',
      (p) => (p['judgment'].strategy = 'continuous'),
      'judgment.pitch: required when strategy is "continuous"',
    ],
    ['duplicate lane ids', (p) => (p['lanes'][1].id = 'a'), 'lanes[1]: lane id "a" is used twice'],
    [
      'lane timbre not defined',
      (p) => (p['lanes'][0].timbre = 'stomp'),
      'lanes[0]: timbre "stomp" is not in timbreClasses',
    ],
    [
      'percussion renderer without lanes',
      (p) => delete p['lanes'],
      'lanes: required for the percussion-lanes renderer',
    ],
    [
      'percussion input without timbre classes',
      (p) => delete p['timbreClasses'],
      'timbreClasses: required for percussion input',
    ],
    ['pitch input without range', (p) => (p['input'] = 'pitch'), 'range: required for pitch input'],
    [
      'pitch matching on non-pitch input',
      (p) => (p['judgment'].match.pitch = true),
      'judgment.match.pitch: only valid for pitch input',
    ],
    [
      'range upside down',
      (p) => (p['range'] = { lowMidi: 70, highMidi: 60 }),
      'range: lowMidi (70) must be below highMidi (60)',
    ],
    [
      'text in a number field',
      (p) => (p['judgment'].timing.goodMs = 'wide'),
      'judgment.timing.goodMs: expected a number from 1 to 2000 (got "wide")',
    ],
  ];

  it.each(cases)('%s', (_name, mutate, expected) => {
    const p = base();
    mutate(p);
    const r = loadProfile(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain(expected);
  });

  it('rejects non-objects', () => {
    expect(loadProfile('x')).toEqual({
      ok: false,
      errors: ['a profile must be an object (got "x")'],
    });
  });

  it('warns about an unknown field with a typo hint', () => {
    const p = base();
    p['judgement'] = {};
    const r = loadProfile(p);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toContain('judgement: unknown field (did you mean "judgment"?)');
  });
});

describe('percussion profiles', () => {
  it('clap is a single any-hit lane; the others classify by timbre', () => {
    const clap = getProfile('clap');
    expect(clap.lanes).toHaveLength(1);
    expect(clap.judgment.match.lane).toBe(false);
    for (const id of ['hand-percussion', 'drum-kit']) {
      const p = getProfile(id);
      expect(p.judgment.match).toMatchObject({ lane: true, laneStrict: true });
      expect(p.lanes!.map((l) => l.timbre)).toEqual(p.timbreClasses!.map((t) => t.id));
    }
    expect(getProfile('drum-kit').lanes!.map((l) => l.id)).toEqual(['kick', 'snare', 'hat']);
  });

  it('laneStrict without lane matching is an error', () => {
    const raw = JSON.parse(JSON.stringify(handPercussion)) as Record<string, any>;
    raw['judgment'].match.lane = false;
    const r = loadProfile(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/laneStrict/);
  });
});

describe('chord matching in profiles', () => {
  it('the ukulele strum profile matches chords, without insisting on them', () => {
    const m = getProfile('ukulele-strum').judgment.match;
    expect(m.chord).toBe(true);
    expect(m.chordStrict).toBeUndefined();
  });

  it('chordStrict without chord matching is an error; with it, it loads', () => {
    const raw = JSON.parse(JSON.stringify(ukuleleStrum)) as Record<string, any>;
    raw['judgment'].match.chordStrict = true;
    const ok = loadProfile(raw);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.judgment.match.chordStrict).toBe(true);
    raw['judgment'].match.chord = false;
    const bad = loadProfile(raw);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join('\n')).toMatch(/chordStrict/);
  });
});

describe('helpers', () => {
  const uke = getProfile('ukulele-note');

  it('tabForPitch picks the lowest fret across a re-entrant tuning', () => {
    // open strings: C=60, E=64, G=67, A=69
    expect(tabForPitch(uke, 60)).toEqual({ stringIndex: 1, fret: 0 }); // open C
    expect(tabForPitch(uke, 69)).toEqual({ stringIndex: 3, fret: 0 }); // open A
    expect(tabForPitch(uke, 71)).toEqual({ stringIndex: 3, fret: 2 }); // B: A string fret 2 beats E fret 7
    expect(tabForPitch(uke, 62)).toEqual({ stringIndex: 1, fret: 2 }); // D: C string fret 2
    expect(tabForPitch(uke, 81)).toEqual({ stringIndex: 3, fret: 12 }); // top of the neck
  });

  it('tabForPitch returns null out of reach', () => {
    expect(tabForPitch(uke, 59)).toBeNull(); // below the lowest string
    expect(tabForPitch(uke, 82)).toBeNull(); // above fret 12
    expect(tabForPitch(getProfile('ukulele-strum') as InstrumentProfile, 100)).toBeNull();
  });

  it('writtenMidi applies the transposition (0 for the ukulele)', () => {
    expect(writtenMidi(uke, 64)).toBe(64);
    const bb = { ...uke, transposition: { writtenMinusSounding: 2 } };
    expect(writtenMidi(bb, 60)).toBe(62);
  });

  it('laneForTimbre finds the lane', () => {
    const p = loadProfile(base());
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(laneForTimbre(p.value, 'tap')?.id).toBe('b');
    expect(laneForTimbre(p.value, 'nope')).toBeUndefined();
  });
});
