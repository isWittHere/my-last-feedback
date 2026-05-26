export type Theme = "dark" | "light";

export function getStoredTheme(): Theme {
  return (localStorage.getItem("mlf-theme") as Theme) || "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("mlf-theme", theme);
}

export function getCurrentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function toggleTheme(): Theme {
  const next = getCurrentTheme() === "light" ? "dark" : "light";
  applyTheme(next);
  return next;
}

applyTheme(getStoredTheme());