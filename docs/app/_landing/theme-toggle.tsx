'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <Button variant="outline" size="icon-sm" className="ml-2" onClick={toggle} aria-label="Toggle light and dark theme">
      <Sun className="pf-sun" />
      <Moon className="pf-moon" />
    </Button>
  );
}
