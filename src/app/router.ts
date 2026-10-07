/** A screen renders into `root` and returns an optional cleanup function. */
export type Screen = (root: HTMLElement) => (() => void) | undefined;

export type Routes = Record<string, Screen>;

/** Hash routing ("#/mic") so deep links work under any base path. */
export function routeFromHash(hash: string): string {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  return path.replace(/\/+$/, '');
}

export function startRouter(root: HTMLElement, routes: Routes, fallback: string): void {
  let cleanup: (() => void) | undefined;

  const render = (): void => {
    cleanup?.();
    cleanup = undefined;
    root.replaceChildren();
    const screen = routes[routeFromHash(location.hash)] ?? routes[fallback];
    cleanup = screen?.(root);
  };

  window.addEventListener('hashchange', render);
  render();
}
