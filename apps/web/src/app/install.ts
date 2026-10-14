import { escapeHtml } from './audio';

/** Where the app is being used, as far as installing it goes. */
export type Platform =
  | 'ios-safari'
  | 'ios-other'
  | 'android-chrome'
  | 'android-other'
  | 'desktop-chromium'
  | 'desktop-safari'
  | 'desktop-firefox'
  | 'other';

/**
 * Works out the platform from the browser's own words. iPadOS reports itself as a Mac, so a "Mac"
 * with a touch screen is an iPad.
 */
export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) {
    // Chrome, Firefox and Edge on iOS say so; Safari does not
    return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  }
  if (/Android/.test(ua)) {
    return /Chrome\//.test(ua) && !/SamsungBrowser|OPR\/|Firefox/.test(ua)
      ? 'android-chrome'
      : 'android-other';
  }
  if (/Firefox\//.test(ua)) return 'desktop-firefox';
  if (/Edg\/|Chrome\/|Chromium\//.test(ua)) return 'desktop-chromium';
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return 'desktop-safari';
  return 'other';
}

export interface InstallGuide {
  label: string;
  steps: readonly string[];
}

/** Install instructions for each platform, in plain words. */
export const GUIDES: Readonly<Record<Platform, InstallGuide>> = {
  'ios-safari': {
    label: 'iPhone or iPad (Safari)',
    steps: [
      'Open Lineup in Safari.',
      'Tap the Share button: the square with an arrow pointing up (at the top right on an iPad, at the bottom on an iPhone).',
      'Scroll down and tap “Add to Home Screen”.',
      'Tap “Add”. Lineup now opens full screen from its own icon.',
    ],
  },
  'ios-other': {
    label: 'iPhone or iPad (Chrome, Firefox or Edge)',
    steps: [
      'Tap the Share button in the browser’s toolbar or menu.',
      'Choose “Add to Home Screen” and tap “Add”.',
      'If you do not see it, open this page in Safari and follow the Safari steps instead.',
    ],
  },
  'android-chrome': {
    label: 'Android (Chrome)',
    steps: [
      'Tap the menu (three dots) at the top right.',
      'Tap “Install app” (or “Add to Home screen”).',
      'Tap “Install”. Lineup appears with your other apps.',
    ],
  },
  'android-other': {
    label: 'Android (other browsers)',
    steps: [
      'Open the browser’s menu.',
      'Look for “Install app” or “Add to Home screen” and tap it.',
      'In Samsung Internet the install icon is in the address bar; in Firefox it is in the menu.',
    ],
  },
  'desktop-chromium': {
    label: 'Computer (Chrome or Edge)',
    steps: [
      'Look for the install icon (a monitor with a down arrow) at the right end of the address bar, and click it.',
      'Or open the menu and choose “Install Lineup” (Chrome: “Cast, save and share” then “Install page as app”).',
      'Click “Install”. Lineup opens in its own window.',
    ],
  },
  'desktop-safari': {
    label: 'Mac (Safari)',
    steps: [
      'In the menu bar choose File, then “Add to Dock…”.',
      'Click “Add”. Lineup opens in its own window from the Dock.',
      'Needs macOS Sonoma (14) or later.',
    ],
  },
  'desktop-firefox': {
    label: 'Computer (Firefox)',
    steps: [
      'Firefox on a computer cannot install web apps.',
      'Open Lineup in Chrome, Edge or Safari to install it, or just keep using it here: it works offline once loaded.',
    ],
  },
  other: {
    label: 'Other browsers',
    steps: [
      'Look in the browser’s menu for “Install”, “Add to Home screen” or “Add to Dock”.',
      'Lineup also works without installing, and offline once it has loaded.',
    ],
  },
};

/** The order the other guides are listed in. */
const ORDER: readonly Platform[] = [
  'ios-safari',
  'ios-other',
  'android-chrome',
  'android-other',
  'desktop-chromium',
  'desktop-safari',
  'desktop-firefox',
];

/** True when the app is already running installed, as its own window or full screen. */
export function isInstalled(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    return (
      nav.standalone === true ||
      window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches
    );
  } catch {
    return false;
  }
}

/** The browser's own "install" offer (Chrome and Edge), kept until the player asks for it. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: InstallPromptEvent | null = null;

/** Starts listening for the browser's install offer. Call once at start-up. */
export function listenForInstallOffer(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
  });
}

/** Whether the browser has offered to install the app (so an Install button can do it directly). */
export const canPromptInstall = (): boolean => deferred !== null;

/** Shows the browser's install question. Resolves true when the player accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  return (await e.userChoice).outcome === 'accepted';
}

/** The text of a guide as HTML (an ordered list). */
const guideHtml = (g: InstallGuide): string =>
  `<ol>${g.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;

/**
 * Opens a dialog with how to install the app: the steps for this device first, a button to install
 * straight away where the browser allows it, and the steps for every other device below.
 */
export function showInstallDialog(): void {
  const mine = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  const dialog = document.createElement('dialog');
  dialog.className = 'install-dialog';
  dialog.dataset['id'] = 'install-dialog';
  dialog.setAttribute('aria-labelledby', 'install-title');
  const others = ORDER.filter((p) => p !== mine);
  dialog.innerHTML = `
    <h2 id="install-title">Install Lineup</h2>
    <p>Lineup is a web app you can add to your device like any other app. It opens full screen, from its own
      icon, and <strong>works offline</strong> once it has loaded. Everything stays on the device.</p>
    ${
      isInstalled()
        ? '<p class="status ok" data-id="install-already">Lineup is already installed on this device.</p>'
        : ''
    }
    ${
      canPromptInstall()
        ? '<p><button class="primary" data-id="install-now">Install now</button></p>'
        : ''
    }
    <h3>${escapeHtml(GUIDES[mine].label)}</h3>
    ${guideHtml(GUIDES[mine])}
    <details data-id="install-others">
      <summary>Other devices</summary>
      ${others.map((p) => `<h3>${escapeHtml(GUIDES[p].label)}</h3>${guideHtml(GUIDES[p])}`).join('')}
    </details>
    <div class="row"><button data-id="install-close">Close</button></div>
  `;
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  dialog.querySelector('[data-id=install-close]')!.addEventListener('click', close);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('[data-id=install-now]')?.addEventListener('click', () => {
    void promptInstall().then((ok) => {
      if (ok) close();
    });
  });
  // a click on the backdrop (outside the box) closes it too
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
}
