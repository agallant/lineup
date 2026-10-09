import { describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

describe('copyText', () => {
  it('uses the async clipboard when it works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const legacyCopy = vi.fn().mockReturnValue(true);
    expect(await copyText('hello', { writeText, legacyCopy })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(legacyCopy).not.toHaveBeenCalled();
  });

  it('falls back to the legacy copy when the async clipboard is refused', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const legacyCopy = vi.fn().mockReturnValue(true);
    expect(await copyText('hello', { writeText, legacyCopy })).toBe(true);
    expect(legacyCopy).toHaveBeenCalledWith('hello');
  });

  it('falls back when there is no async clipboard at all', async () => {
    const legacyCopy = vi.fn().mockReturnValue(true);
    expect(await copyText('x', { legacyCopy })).toBe(true);
  });

  it('reports failure when nothing works', async () => {
    expect(await copyText('x', {})).toBe(false);
    expect(
      await copyText('x', {
        writeText: () => Promise.reject(new Error('no')),
        legacyCopy: () => false,
      }),
    ).toBe(false);
  });
});
