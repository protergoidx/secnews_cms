export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "secnews_theme";

export function getInitialTheme(): Theme {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);

  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  localStorage.setItem(THEME_STORAGE_KEY, theme);
}