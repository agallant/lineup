import { describe, expect, it } from 'vitest';
import { routeFromHash } from './router';

describe('routeFromHash', () => {
  it.each([
    ['', ''],
    ['#', ''],
    ['#/', ''],
    ['#/mic', 'mic'],
    ['#mic', 'mic'],
    ['#/mic/', 'mic'],
    ['#/mic?debug=1', 'mic'],
  ])('%j -> %j', (hash, route) => {
    expect(routeFromHash(hash)).toBe(route);
  });
});
