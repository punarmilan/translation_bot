import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

export function AdminThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("admin_theme") || "light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("admin_theme", theme);
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, toggle: () => setTheme((value) => value === "light" ? "dark" : "light") }}>{children}</ThemeContext.Provider>;
}

export function useAdminTheme() {
  return useContext(ThemeContext);
}
