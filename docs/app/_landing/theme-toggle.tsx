'use client';

import { Moon, Sun } from 'lucide-react';

/** Same storage key and class as the docs theme, so the choice carries over. */
export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.classList.contains('dark') ? 'light' : 'dark';
    root.classList.remove('light', 'dark');
    root.classList.add(next);
    root.style.colorScheme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* private mode */
    }
  };
  return (
    <button type="button" className="pf-icon-btn" onClick={toggle} aria-label="Toggle light and dark theme">
      <Sun size={16} className="pf-sun" />
      <Moon size={16} className="pf-moon" />
    </button>
  );
}
