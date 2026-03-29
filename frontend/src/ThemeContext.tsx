/**
 * Theme system — 3 themes: 清雅 (light), 墨韵 (dark), 锦绣 (gold)
 * Persists choice to localStorage and applies data-theme to <html>.
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'gold';

export const THEMES: { id: Theme; label: string; icon: string; desc: string }[] = [
  { id: 'light', label: '清雅',  icon: '☀️', desc: '简约清爽' },
  { id: 'dark',  label: '墨韵',  icon: '🌙', desc: '暗色墨韵' },
  { id: 'gold',  label: '锦绣',  icon: '🏮', desc: '金红锦绣' },
];

interface ThemeCtx { theme: Theme; setTheme: (t: Theme) => void; }

const ThemeContext = createContext<ThemeCtx>({ theme: 'light', setTheme: () => {} });

function applyTheme(t: Theme) {
  const html = document.documentElement;
  if (t === 'light') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', t);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('hl-theme') as Theme | null;
    return (saved && ['light', 'dark', 'gold'].includes(saved)) ? saved : 'light';
  });

  useEffect(() => { applyTheme(theme); }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem('hl-theme', t);
    applyTheme(t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }
