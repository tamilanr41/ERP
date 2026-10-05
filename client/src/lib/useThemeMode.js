import { useEffect, useState } from 'react';

/** Reads the active console theme and re-renders when it is switched. */
export function useThemeMode() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'clinical');

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-theme') || 'clinical');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return { theme, isClinical: theme === 'clinical' };
}

export const CHART_COLORS = {
  light: {
    grid: '#eef1f5',
    axis: '#8793a6',
    tooltipBg: '#ffffff',
    tooltipText: '#525c72',
    tooltipBorder: '#eef1f5',
    line: '#1d6ff5',
  },
  clinical: {
    grid: '#1c2942',
    axis: '#74839e',
    tooltipBg: '#0c1322',
    tooltipText: '#e8eefb',
    tooltipBorder: '#243350',
    line: '#38bdf8',
  },
};

export default useThemeMode;
