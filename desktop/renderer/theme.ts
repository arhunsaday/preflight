import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
const key = "preflight-theme";

function stored(): ThemePreference {
  try {
    const value = localStorage.getItem(key);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** Theme preference persisted per device; "system" follows the OS. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemePreference>(stored);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      if (theme === "system") localStorage.removeItem(key);
      else localStorage.setItem(key, theme);
    } catch {
      /* storage unavailable: the preference lasts for this session */
    }
  }, [theme]);
  const cycle = useCallback(
    () =>
      setTheme((current) =>
        current === "system" ? "light" : current === "light" ? "dark" : "system",
      ),
    [],
  );
  return { theme, setTheme, cycle };
}
