import type { TextSize } from './settings';

/** How much each text size scales the page's text. */
export const TEXT_SCALE: Readonly<Record<TextSize, number>> = {
  normal: 1,
  large: 1.15,
  larger: 1.3,
};

/** Applies a text size to the page (the style sheet reads `--text-scale`). */
export function applyTextSize(size: TextSize, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--text-scale', String(TEXT_SCALE[size]));
}
