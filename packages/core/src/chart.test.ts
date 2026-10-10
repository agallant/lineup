import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import {
  CHART_VERSION,
  activeNoteIndex,
  chartEnd,
  chartFromBeats,
  chartPitchRange,
  loadChart,
  migrateChart,
  parseChart,
  nextNoteIndex,
  rescaleChart,
  transposeChart,
  type Chart,
} from './chart';
import schema from './chart.v1.schema.json';
import { getSong } from './songs';
import { describeJsonError } from './validate';

const minimal = () => ({
  version: 1,
  meta: { title: 'Test', bpm: 120 },
  notes: [{ t: 0.5 }],
});

describe('loadChart: valid charts', () => {
  it('accepts a minimal chart and fills defaults', () => {
    const r = loadChart(minimal());
    expect(r).toEqual({
      ok: true,
      warnings: [],
      value: {
        version: 1,
        meta: { title: 'Test', bpm: 120, countInBeats: 4 },
        notes: [{ t: 0.5, duration: 0 }],
      },
    });
  });

  it('keeps every optional field', () => {
    const r = loadChart({
      version: 1,
      meta: {
        title: 'Full',
        artist: 'Me',
        bpm: 90,
        countInBeats: 2,
        audio: 'song.ogg',
        instruments: ['voice'],
      },
      notes: [
        { t: 1, duration: 0.5, pitch: 60.5, lane: 'a' },
        { t: 2, expected: { chord: 'Am', direction: 'down' } },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.meta).toEqual({
      title: 'Full',
      artist: 'Me',
      bpm: 90,
      countInBeats: 2,
      audio: 'song.ogg',
      instruments: ['voice'],
    });
    expect(r.value.notes[0]).toEqual({ t: 1, duration: 0.5, pitch: 60.5, lane: 'a' });
    expect(r.value.notes[1]).toEqual({
      t: 2,
      duration: 0,
      expected: { chord: 'Am', direction: 'down' },
    });
  });

  it('reads the frets to hold on each string, with null for a string not played', () => {
    const r = loadChart({
      version: 1,
      meta: { title: 'Frets', bpm: 90 },
      notes: [{ t: 0, expected: { frets: [null, 0, null, 3] } }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.notes[0]?.expected?.frets).toEqual([null, 0, null, 3]);
  });

  it.each([
    ['a fret that is not a whole number', [1.5, 0, 0, 0], 'notes[0].expected.frets[0]'],
    ['a negative fret', [0, -1, 0, 0], 'notes[0].expected.frets[1]'],
    ['a fret past the neck', [0, 0, 25, 0], 'notes[0].expected.frets[2]'],
    ['text for a fret', [0, 0, 0, 'x'], 'notes[0].expected.frets[3]'],
  ])('rejects %s', (_name, frets, where) => {
    const r = loadChart({
      version: 1,
      meta: { title: 'Bad', bpm: 90 },
      notes: [{ t: 0, expected: { frets } }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain(where);
  });

  it('rejects an empty frets list and more than eight strings', () => {
    for (const frets of [[], Array.from({ length: 9 }, () => 0)]) {
      const r = loadChart({
        version: 1,
        meta: { title: 'Bad', bpm: 90 },
        notes: [{ t: 0, expected: { frets } }],
      });
      expect(r.ok).toBe(false);
    }
  });

  it('sorts out-of-order notes and says so', () => {
    const r = loadChart({ ...minimal(), notes: [{ t: 2 }, { t: 1 }, { t: 3 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.notes.map((n) => n.t)).toEqual([1, 2, 3]);
    expect(r.warnings).toEqual(['notes: were not in time order, so they were sorted']);
  });

  it('warns about duplicates and unknown fields (with a typo hint)', () => {
    const r = loadChart({ ...minimal(), notes: [{ t: 1, pich: 60 }, { t: 1 }, { t: 1 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toContain('notes[0].pich: unknown field (did you mean "pitch"?)');
    expect(r.warnings).toContain(
      'notes[2]: duplicates the note before it (same time, lane and pitch)',
    );
  });
});

describe('loadChart: readable errors', () => {
  const cases: [string, unknown, string[]][] = [
    ['not an object', 'hello', ['a chart must be an object (got "hello")']],
    ['list instead of object', [], ['a chart must be an object (got a list of 0)']],
    [
      'missing version',
      { meta: { title: 'x', bpm: 100 }, notes: [{ t: 0 }] },
      ['version: required, expected the whole number 1 (got nothing)'],
    ],
    [
      'text version',
      { ...minimal(), version: '1' },
      ['version: required, expected the whole number 1 (got "1")'],
    ],
    [
      'version from the future',
      { ...minimal(), version: 7 },
      ['version: this chart is version 7 but this app only understands up to 1. Update Lineup.'],
    ],
    ['missing meta', { version: 1, notes: [{ t: 0 }] }, ['meta: required, expected an object']],
    [
      'missing title and bpm',
      { version: 1, meta: {}, notes: [{ t: 0 }] },
      [
        'meta.title: required, expected non-empty text',
        'meta.bpm: required, expected a number from 20 to 400',
      ],
    ],
    [
      'bpm too low',
      { ...minimal(), meta: { title: 'x', bpm: 5 } },
      ['meta.bpm: expected a number from 20 to 400 (got 5)'],
    ],
    [
      'bpm as text',
      { ...minimal(), meta: { title: 'x', bpm: 'fast' } },
      ['meta.bpm: expected a number from 20 to 400 (got "fast")'],
    ],
    [
      'blank title',
      { ...minimal(), meta: { title: '  ', bpm: 100 } },
      ['meta.title: expected non-empty text (got "  ")'],
    ],
    [
      'fractional count-in',
      { ...minimal(), meta: { title: 'x', bpm: 100, countInBeats: 2.5 } },
      ['meta.countInBeats: expected a whole number from 0 to 16 (got 2.5)'],
    ],
    [
      'missing notes',
      { version: 1, meta: { title: 'x', bpm: 100 } },
      ['notes: required, expected a list'],
    ],
    ['empty notes', { ...minimal(), notes: [] }, ['notes: expected at least 1 item (got 0)']],
    [
      'note not an object',
      { ...minimal(), notes: [5] },
      ['notes[0]: expected an object like {"t": 1.5} (got 5)'],
    ],
    [
      'note without t',
      { ...minimal(), notes: [{ lane: 'a' }] },
      ['notes[0].t: required, expected a number ≥ 0'],
    ],
    [
      'negative t',
      { ...minimal(), notes: [{ t: -1 }] },
      ['notes[0].t: expected a number ≥ 0 (got -1)'],
    ],
    [
      'pitch as note name',
      { ...minimal(), notes: [{ t: 1 }, { t: 2, pitch: 'C4' }] },
      ['notes[1].pitch: expected a number from 0 to 127 (got "C4")'],
    ],
    [
      'pitch out of range',
      { ...minimal(), notes: [{ t: 1, pitch: 200 }] },
      ['notes[0].pitch: expected a number from 0 to 127 (got 200)'],
    ],
    [
      'bad direction',
      { ...minimal(), notes: [{ t: 1, expected: { direction: 'sideways' } }] },
      ['notes[0].expected.direction: expected one of up, down (got "sideways")'],
    ],
    [
      'bad instruments entry',
      { ...minimal(), meta: { title: 'x', bpm: 100, instruments: ['voice', 3] } },
      ['meta.instruments[1]: expected a profile id like "voice" (got 3)'],
    ],
  ];
  it.each(cases)('%s', (_name, input, expected) => {
    const r = loadChart(input);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(expected);
  });

  it('caps a flood of errors for small screens', () => {
    const notes = Array.from({ length: 40 }, () => ({ t: 'x' }));
    const r = loadChart({ ...minimal(), notes });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(13);
    expect(r.errors[12]).toBe('…and 28 more problems');
  });
});

describe('parseChart', () => {
  it('reports JSON syntax errors', () => {
    const r = parseChart('{\n  "version": 1,\n  "meta": oops\n}');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/^not valid JSON: /);
  });

  it('loads valid text', () => {
    expect(parseChart(JSON.stringify(minimal())).ok).toBe(true);
  });
});

describe('describeJsonError (engine wordings)', () => {
  const text = '{\n  "version": 1,\n  "meta": oops\n}';
  it.each([
    ['old V8: position', 'Unexpected token o in JSON at position 28', 'line 3, column 11'],
    [
      'Firefox: line/column',
      'JSON.parse: unexpected character at line 3 column 11 of the JSON data',
      'line 3, column 11',
    ],
  ])('%s', (_name, message, location) => {
    expect(describeJsonError(text, message)).toBe(`not valid JSON: ${message} (${location})`);
  });

  it('passes through messages with no location (Safari, current V8)', () => {
    expect(describeJsonError(text, 'JSON Parse error: Unexpected identifier "oops"')).toBe(
      'not valid JSON: JSON Parse error: Unexpected identifier "oops"',
    );
  });
});

describe('migrateChart', () => {
  it('passes the current version through untouched', () => {
    expect(migrateChart({ version: 1, x: 1 })).toEqual({
      ok: true,
      value: { version: 1, x: 1 },
      warnings: [],
    });
  });

  it('applies migrations in order up to the target', () => {
    const migrations = {
      1: (raw: Record<string, unknown>) => ({ ...raw, a: 1 }),
      2: (raw: Record<string, unknown>) => ({ ...raw, b: (raw['a'] as number) + 1 }),
    };
    const r = migrateChart({ version: 1 }, migrations, 3);
    expect(r).toEqual({
      ok: true,
      value: { version: 3, a: 1, b: 2 },
      warnings: ['upgraded from version 1'],
    });
  });

  it('fails clearly when a step is missing', () => {
    const r = migrateChart({ version: 1 }, {}, 2);
    expect(r).toEqual({ ok: false, errors: ['version: no migration from chart version 1 to 2'] });
  });
});

describe('chartFromBeats', () => {
  it('converts beats to seconds at the given bpm', () => {
    const c = chartFromBeats({ title: 'T', bpm: 120 }, [
      { beat: 0 },
      { beat: 1, beats: 2, pitch: 60 },
      { beat: 2.5, lane: 'clap' },
    ]);
    expect(c.notes).toEqual([
      { t: 0, duration: 0 },
      { t: 0.5, duration: 1, pitch: 60 },
      { t: 1.25, duration: 0, lane: 'clap' },
    ]);
    expect(c.meta.countInBeats).toBe(4);
  });

  it('refuses to build an invalid chart', () => {
    expect(() => chartFromBeats({ title: 'T', bpm: 1 }, [{ beat: 0 }])).toThrow(/meta\.bpm/);
  });
});

describe('meta.tonic', () => {
  const base = { version: 1, notes: [{ t: 0, pitch: 60 }] };

  it("accepts the MIDI note of the song's key", () => {
    const r = loadChart({ ...base, meta: { title: 't', bpm: 100, tonic: 72 } });
    expect(r.ok && r.value.meta.tonic).toBe(72);
  });

  it('is optional, and rejects a value that is not a MIDI note', () => {
    const none = loadChart({ ...base, meta: { title: 't', bpm: 100 } });
    expect(none.ok && none.value.meta.tonic).toBeUndefined();
    for (const bad of [200, -1, 60.5, 'C']) {
      const r = loadChart({ ...base, meta: { title: 't', bpm: 100, tonic: bad } });
      expect(r.ok, String(bad)).toBe(false);
      if (!r.ok) expect(r.errors.join('\n')).toMatch(/meta\.tonic/);
    }
  });
});

describe('nextNoteIndex', () => {
  const chart = {
    notes: [
      { t: 1, duration: 0 },
      { t: 2, duration: 0 },
      { t: 3, duration: 0 },
    ],
  };
  it('is the first note that starts after the time, or null at the end', () => {
    expect(nextNoteIndex(chart, 0)).toBe(0);
    expect(nextNoteIndex(chart, 1)).toBe(1);
    expect(nextNoteIndex(chart, 2.5)).toBe(2);
    expect(nextNoteIndex(chart, 3)).toBeNull();
  });
});

describe('rescaleChart', () => {
  const chart = getSong('strum-four-chords');

  it('stretches times and durations and keeps the tempo in step', () => {
    const slow = rescaleChart(chart, 0.5);
    expect(slow.meta.bpm).toBe(chart.meta.bpm / 2);
    expect(slow.notes).toHaveLength(chart.notes.length);
    chart.notes.forEach((n, i) => {
      expect(slow.notes[i]!.t).toBeCloseTo(n.t * 2, 5);
      expect(slow.notes[i]!.lane).toBe(n.lane);
      expect(slow.notes[i]!.expected).toEqual(n.expected);
    });
    expect(chartEnd(slow)).toBeCloseTo(chartEnd(chart) * 2, 4);
  });

  it('speed 1 is the same chart; the original is never modified', () => {
    expect(rescaleChart(chart, 1)).toBe(chart);
    const before = chart.notes[5]!.t;
    rescaleChart(chart, 0.7);
    expect(chart.notes[5]!.t).toBe(before);
  });

  it('refuses a speed that is not a positive number', () => {
    for (const bad of [0, -1, NaN, Infinity])
      expect(() => rescaleChart(chart, bad)).toThrow(/speed/);
  });
});

describe('transposeChart / chartPitchRange / chartEnd', () => {
  const chart: Chart = chartFromBeats({ title: 'T', bpm: 60 }, [
    { beat: 0, beats: 1, pitch: 60 },
    { beat: 2, beats: 2, pitch: 64 },
    { beat: 5, lane: 'x' },
  ]);

  it('shifts only pitched notes and does not mutate the original', () => {
    const up = transposeChart(chart, 3);
    expect(up.notes.map((n) => n.pitch)).toEqual([63, 67, undefined]);
    expect(chart.notes.map((n) => n.pitch)).toEqual([60, 64, undefined]);
  });

  it('reports the range, or null without pitches', () => {
    expect(chartPitchRange(chart)).toEqual({ low: 60, high: 64 });
    expect(chartPitchRange(chartFromBeats({ title: 'T', bpm: 60 }, [{ beat: 0 }]))).toBeNull();
  });

  it('finds the end of the last note', () => {
    expect(chartEnd(chart)).toBe(5);
  });

  it('is at the current version', () => {
    expect(chart.version).toBe(CHART_VERSION);
  });
});

describe('JSON Schema agrees with the hand-written loader', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  const fixtures: [string, unknown][] = [
    ['minimal', minimal()],
    [
      'full',
      {
        version: 1,
        meta: {
          title: 'a',
          artist: 'b',
          bpm: 100,
          countInBeats: 0,
          audio: 'x',
          instruments: ['voice'],
        },
        notes: [
          { t: 0, duration: 1, lane: 'l', pitch: 60, expected: { chord: 'C', direction: 'up' } },
        ],
      },
    ],
    ['unsorted notes (loader sorts)', { ...minimal(), notes: [{ t: 2 }, { t: 1 }] }],
    ['unknown fields (loader warns)', { ...minimal(), extra: 1, notes: [{ t: 1, pich: 3 }] }],
    ['wrong version', { ...minimal(), version: 2 }],
    ['no version', { meta: { title: 'x', bpm: 100 }, notes: [{ t: 0 }] }],
    ['bad bpm', { ...minimal(), meta: { title: 'x', bpm: 1000 } }],
    ['blank title', { ...minimal(), meta: { title: ' ', bpm: 100 } }],
    ['no notes', { ...minimal(), notes: [] }],
    ['negative t', { ...minimal(), notes: [{ t: -0.1 }] }],
    ['text pitch', { ...minimal(), notes: [{ t: 0, pitch: 'C4' }] }],
    ['pitch too high', { ...minimal(), notes: [{ t: 0, pitch: 128 }] }],
    ['bad direction', { ...minimal(), notes: [{ t: 0, expected: { direction: 'left' } }] }],
    ['float count-in', { ...minimal(), meta: { title: 'x', bpm: 100, countInBeats: 1.5 } }],
    ['long lane', { ...minimal(), notes: [{ t: 0, lane: 'x'.repeat(33) }] }],
    ['not an object', 7],
  ];

  it.each(fixtures)('%s', (_name, input) => {
    expect(validate(input)).toBe(loadChart(input).ok);
  });
});

describe('activeNoteIndex', () => {
  const chart: Chart = chartFromBeats({ title: 'T', bpm: 60 }, [
    { beat: 1, beats: 1 },
    { beat: 3, beats: 2 },
    { beat: 6 }, // instantaneous: judged over the 0.2 s minimum
  ]);
  it.each([
    [0, null],
    [1, 0],
    [1.99, 0],
    [2, null],
    [3.5, 1],
    [4.99, 1],
    [5, null],
    [6.1, 2],
    [6.3, null],
  ])('t=%d -> %s', (t, expected) => {
    expect(activeNoteIndex(chart, t)).toBe(expected);
  });

  it('slack looks ahead to the next note', () => {
    expect(activeNoteIndex(chart, 0.8, 0.25)).toBe(0);
    expect(activeNoteIndex(chart, 0.7, 0.25)).toBeNull();
  });
});
