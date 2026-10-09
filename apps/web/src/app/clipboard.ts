/** The browser pieces copyText needs, injectable for tests. */
export interface ClipboardDeps {
  writeText?: ((text: string) => Promise<void>) | undefined;
  /** Legacy fallback (older Safari / non-secure contexts): returns whether the copy command worked. */
  legacyCopy?: ((text: string) => boolean) | undefined;
}

function browserDeps(): ClipboardDeps {
  return {
    writeText:
      typeof navigator !== 'undefined' && navigator.clipboard?.writeText
        ? (t) => navigator.clipboard.writeText(t)
        : undefined,
    legacyCopy: (text) => {
      if (typeof document === 'undefined') return false;
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      try {
        return document.execCommand('copy');
      } catch {
        return false;
      } finally {
        area.remove();
      }
    },
  };
}

/** Copies text to the clipboard. Call it from a click handler. Returns whether it worked. */
export async function copyText(
  text: string,
  deps: ClipboardDeps = browserDeps(),
): Promise<boolean> {
  if (deps.writeText) {
    try {
      await deps.writeText(text);
      return true;
    } catch {
      // permission denied or no user gesture: fall through to the legacy path
    }
  }
  return deps.legacyCopy?.(text) ?? false;
}
