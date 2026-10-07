# Strumline

A rhythm game (DDR / Elite Beat Agents style) that you play by strumming a real
ukulele instead of stomping on pads. Ukulele only for now, in standard
re-entrant GCEA tuning (G4 C4 E4 A4).

It's a static web app, built for Safari on iOS/iPadOS first and also tested in
desktop Chrome. You can install it as a PWA. There's no backend.

## Play / test

- **Main:** https://agallant.github.io/strumline/
- **PR previews:** https://agallant.github.io/strumline/pr-preview/pr-N/. A bot
  comments the exact link on each PR.

The footer shows which build you're looking at (`main` or `PR #N`, the commit
SHA and the build time). If it's stale, pull to refresh. GitHub Pages caches
HTML for up to 10 minutes.

To install it as an app on iPad: open it in Safari, tap Share, then **Add to
Home Screen**.

## Develop

Requires Node 22+.

```sh
npm ci
npm run dev        # Vite dev server
npm run check      # typecheck + lint + test + build (what CI runs)
npm test           # Vitest unit tests
npm run format     # Prettier
```

Mic access needs a secure context (HTTPS or `localhost`).

## Layout

```
src/
  app/      screens, hash router, app state
  audio/    mic capture, AudioWorklet, pitch + onset detection -> InputEvent   (M1)
  chart/    chart JSON format + loader                                         (M3)
  judge/    pure timing judge: InputEvents vs chart notes -> perfect/good/miss (M3)
  render/   canvas 2D highway                                                  (M3)
public/     manifest, icons, service worker (copied verbatim)
```

Design rules:

- Audio input is captured with echoCancellation, noiseSuppression and
  autoGainControl all off, and processed in an AudioWorklet.
- The game clock is `AudioContext.currentTime`. The renderer only reads it
  inside `requestAnimationFrame`.
- A calibrated input-latency offset is subtracted by the judge.
- DSP and the judge are pure and tested with synthetic audio, so tests don't
  need a mic.

## Deploy

Everything goes through PRs. Nothing is pushed directly to `main`.

- `.github/workflows/ci.yml` runs typecheck, lint, test and build on every PR
  and on `main`.
- `.github/workflows/deploy.yml` builds `main` and publishes it to the root of
  the `gh-pages` branch. It leaves `pr-preview/` alone.
- `.github/workflows/preview.yml` builds each PR into `gh-pages:/pr-preview/pr-N/`,
  comments the URL on the PR, and deletes the preview when the PR closes. It
  uses [`rossjrw/pr-preview-action`](https://github.com/rossjrw/pr-preview-action).

The Vite `base` is `./` (relative), so one build works both at the site root
and in a preview subfolder. Routing uses hashes (`#/mic`) for the same reason.

**One-time setup (done in the GitHub UI):** Settings → Pages → Build and
deployment → Source: **Deploy from a branch** → `gh-pages` / `(root)`. The
`gh-pages` branch appears after the first preview or deploy run.

## Verified on device

| What                       | iPad Safari | iPad PWA | Desktop Chrome |
| -------------------------- | ----------- | -------- | -------------- |
| Site loads from Pages      | not yet     | not yet  | not yet        |
| Add to Home Screen + icon  | not yet     | not yet  | n/a            |
| Footer shows correct build | not yet     | not yet  | not yet        |
