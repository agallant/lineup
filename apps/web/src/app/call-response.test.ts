import { describe, expect, it } from 'vitest';
import { callSignal } from './call-response';

describe('callSignal', () => {
  const listen = {
    calls: [
      { from: 0, to: 2 },
      { from: 4, to: 6 },
    ],
    responses: [
      { from: 2, to: 4 },
      { from: 6, to: 8 },
    ],
  };

  it('says Listen on the first beat of a call and Your turn on the first beat of an answer', () => {
    expect(callSignal(listen, 0.1, 0.5)).toBe('Listen…');
    expect(callSignal(listen, 2.2, 0.5)).toBe('Your turn!');
    expect(callSignal(listen, 4.4, 0.5)).toBe('Listen…');
    expect(callSignal(listen, 6.0, 0.5)).toBe('Your turn!');
  });

  it('says nothing the rest of the time, or without call and response', () => {
    expect(callSignal(listen, 1.0, 0.5)).toBeNull();
    expect(callSignal(listen, 3.0, 0.5)).toBeNull();
    expect(callSignal(listen, 9, 0.5)).toBeNull();
    expect(callSignal({}, 0.1, 0.5)).toBeNull();
  });
});
