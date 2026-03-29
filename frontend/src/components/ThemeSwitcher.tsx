/**
 * ThemeSwitcher — compact 3-option theme selector button.
 * Renders a floating row of theme icons.
 */

import { useState } from 'react';
import { useTheme, THEMES } from '../ThemeContext';

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const current = THEMES.find(t => t.id === theme)!;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg transition-all select-none"
        style={{
          background: 'var(--bg-muted)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
        }}
        title="切换主题"
      >
        <span>{current.icon}</span>
        <span className="text-xs font-medium hidden sm:inline">{current.label}</span>
        <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1.5 z-50 rounded-xl shadow-lg overflow-hidden"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              minWidth: '140px',
            }}
          >
            {THEMES.map(t => (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors"
                style={{
                  background: theme === t.id ? 'var(--brand-light)' : 'transparent',
                  color: theme === t.id ? 'var(--brand)' : 'var(--text-secondary)',
                }}
              >
                <span>{t.icon}</span>
                <div className="text-left">
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs opacity-60">{t.desc}</div>
                </div>
                {theme === t.id && (
                  <svg className="w-3.5 h-3.5 ml-auto opacity-70" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
