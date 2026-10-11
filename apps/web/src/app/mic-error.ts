/** A sentence a player can act on for a failed attempt to open the microphone. */
export function describeError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
        return 'Microphone permission denied. In Safari, tap aA → Website Settings → Microphone → Allow, then reload.';
      case 'NotFoundError':
        return 'No microphone found.';
      case 'NotReadableError':
        return 'The microphone is busy or unavailable (another app may be using it).';
      case 'OverconstrainedError':
        return 'That input device is no longer available. Pick another one.';
    }
    return `${err.name}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
