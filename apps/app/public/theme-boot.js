// Spec 0019, REQ-008 (AC-023, AC-025): the page background and the status bar colour of the
// stored theme before the app's first frame, so a dark theme never flashes light at a cold start.
// An external file, not an inline script: the CSP allows only same-origin scripts. The colours
// are the `bg` of each theme (packages/ui/src/themes); scripts/theme-boot.test.mjs keeps them equal.
(() => {
  const BG = {
    markthalle: { light: '#FAF6EE', dark: '#1B1613' },
    klar: { light: '#F2F2F7', dark: '#000000' },
    frisch: { light: '#FAF8F5', dark: '#111116' },
    wolke: { light: '#F2D3DB', dark: '#241A1D' },
    mitternacht: { light: '#F4F2EC', dark: '#0E1322' },
    zitrus: { light: '#FFF8EC', dark: '#12131C' },
    salbei: { light: '#F2F3EC', dark: '#131A15' },
    lavendel: { light: '#F4F1F9', dark: '#17131F' },
    espresso: { light: '#EEEAE6', dark: '#120D0A' },
  };
  let settings = {};
  try {
    settings = JSON.parse(window.localStorage.getItem('housekeeping.settings.v1') || '{}') || {};
  } catch {
    // Storage can be unavailable (private mode); the defaults apply.
  }
  const family = BG[settings.themeId] || BG.markthalle;
  const appearance = settings.appearance;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const mode =
    appearance === 'dark' || appearance === 'light' ? appearance : prefersDark ? 'dark' : 'light';
  const color = family[mode];
  document.documentElement.style.backgroundColor = color;
  document.documentElement.style.colorScheme = mode;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', color);
    meta.removeAttribute('media');
  }
})();
