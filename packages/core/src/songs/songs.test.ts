import { describe, expect, it } from 'vitest';
import { getSong } from './index';

describe('built-in songs', () => {
  it('getSong returns a known song', () => {
    expect(getSong('ukulele-strum-demo').meta.title).toMatch(/Island/);
  });

  it('getSong explains an unknown id and lists the known ones', () => {
    expect(() => getSong('nope')).toThrow(/unknown song "nope" \(have: ukulele-strum-demo/);
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'treats inherited Object.prototype names like "%s" as unknown ids',
    (id) => {
      expect(() => getSong(id)).toThrow(/unknown song/);
    },
  );
});
