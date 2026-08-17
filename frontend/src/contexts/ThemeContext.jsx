import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useConfig } from "./ConfigContext";

const STORAGE_KEY = "translation_bot_theme";
const ThemeContext = createContext(null);

function getInitialTheme() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const hadExplicitChoice = useRef(
    window.localStorage.getItem(STORAGE_KEY) === "light" || window.localStorage.getItem(STORAGE_KEY) === "dark",
  );
  const [theme, setThemeState] = useState(getInitialTheme);
  const { settings } = useConfig();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Admin-configured default theme (platform_settings{key:"general"}.theme,
  // fetched into ConfigContext's `settings`) only applies before the visitor
  // has ever made an explicit choice -- a stored preference at mount, or a
  // manual toggle during this session, always wins.
  useEffect(() => {
    if (!hadExplicitChoice.current && (settings.theme === "light" || settings.theme === "dark")) {
      setThemeState(settings.theme);
    }
  }, [settings.theme]);

  const setTheme = (value) => {
    hadExplicitChoice.current = true;
    setThemeState(value);
  };

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === "light" ? "dark" : "light"),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
