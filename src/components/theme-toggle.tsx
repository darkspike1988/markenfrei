"use client";

import { useSyncExternalStore } from "react";
import { Menu } from "@/components/menu";
import { parseTheme, THEME_KEY, THEME_LABEL, type Theme } from "@/lib/theme";

const listeners = new Set<() => void>();

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Wahl in einem anderen Tab: dort ist der Speicher schon geschrieben, hier muss <html> nachziehen.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY && e.key !== null) return;
    apply(parseTheme(e.newValue));
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Theme {
  return parseTheme(document.documentElement.getAttribute("data-theme"));
}

function getServerSnapshot(): Theme {
  return "system";
}

/** Setzt die Darstellung; „System“ entfernt Attribut und Eintrag, gespeichert wird nur eine ausdrückliche Wahl. */
function choose(theme: Theme) {
  apply(theme);
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Speicher gesperrt: gilt dann nur bis zum Neuladen.
  }
  for (const l of listeners) l();
}

const THEMES: Theme[] = ["system", "light", "dark"];

/** Umschalter für die Darstellung im Seitenkopf: System, Hell oder Dunkel. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <Menu
      label="Darstellung"
      align="always-end"
      className="btn-quiet size-9 justify-center p-0"
      items={THEMES.map((t) => ({ label: THEME_LABEL[t], pressed: theme === t, onSelect: () => choose(t) }))}
    >
      <svg aria-hidden viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="5.75" />
        <path d="M8 2.25a5.75 5.75 0 0 1 0 11.5Z" fill="currentColor" stroke="none" />
      </svg>
    </Menu>
  );
}
