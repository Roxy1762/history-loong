/**
 * Theme system — 4 themes: 清雅 (light), 墨韵 (dark), 锦绣 (gold), 竹青 (jade)
 * Persists choice to localStorage and applies data-theme to <html>.
 * NOTE: index.html has an inline script that applies the saved theme before
 * React hydrates, preventing flash of unstyled content (FOUC).
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'gold' | 'jade';

export const THEMES: { id: Theme; label: string; icon: string; desc: string }[] = [
  { id: 'light', label: '清雅', icon: '☀️', desc: '简约清爽' },
  { id: 'dark',  label: '墨韵', icon: '🌙', desc: '暗色墨韵' },
  { id: 'gold',  label: '锦绣', icon: '🏮', desc: '金红锦绣' },
  { id: 'jade',  label: '竹青', icon: '🎋', desc: '竹韵古风' },
];

const VALID_THEMES: Theme[] = ['light', 'dark', 'gold', 'jade'];

interface ThemeCtx { theme: Theme; setTheme: (t: Theme) => void; }

const ThemeContext = createContext<ThemeCtx>({ theme: 'light', setTheme: () => {} });

let _transitionTimer: ReturnType<typeof setTimeout> | undefined;

function applyTheme(t: Theme) {
  const html = document.documentElement;
  // Add transitioning class so .theme-transitioning * { transition } fires for
  // ~300ms, then remove it — avoids permanently taxing every element with a
  // CSS transition on every render.
  clearTimeout(_transitionTimer);
  html.classList.add('theme-transitioning');
  _transitionTimer = setTimeout(() => html.classList.remove('theme-transitioning'), 300);

  if (t === 'light') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', t);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('hl-theme') as Theme | null;
    return (saved && VALID_THEMES.includes(saved)) ? saved : 'light';
  });

  // Apply on mount (handles SSR/hydration; the inline HTML script handles pre-React flash)
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
