/**
 * Single source of truth for the console theme.
 *
 * Two consoles exist: the light one (plain Tailwind, no overrides) and the dark
 * "clinical" workstation, which is applied purely through [data-theme='clinical']
 * rules on <html>. So the whole theme is one attribute plus one localStorage key.
 *
 * It used to be hardcoded to 'clinical' in three places, which meant changing
 * the default meant finding all three - and a stored 'clinical' would keep
 * pinning a user to dark regardless of the code.
 */
export const THEME_STORAGE_KEY = 'erp-theme';
export const THEMES = { LIGHT: 'light', CLINICAL: 'clinical' };
export const DEFAULT_THEME = THEMES.LIGHT;

const isKnown = (v) => v === THEMES.LIGHT || v === THEMES.CLINICAL;

/** Read the operator's saved choice; anything unknown or absent falls back. */
export const readStoredTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isKnown(stored) ? stored : DEFAULT_THEME;
  } catch {
    // Private mode / blocked storage: the default still has to render.
    return DEFAULT_THEME;
  }
};

export const readActiveTheme = () => {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const attr = document.documentElement.getAttribute('data-theme');
  return isKnown(attr) ? attr : DEFAULT_THEME;
};

export const otherTheme = (theme) =>
  theme === THEMES.CLINICAL ? THEMES.LIGHT : THEMES.CLINICAL;

export const applyTheme = (theme, { persist = true } = {}) => {
  const next = isKnown(theme) ? theme : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', next);
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // A failed write only costs the preference, never the current render.
    }
  }
  return next;
};

export default applyTheme;