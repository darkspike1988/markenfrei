/**
 * Darstellung (hell, dunkel oder wie das System). Ohne Wahl folgt die Seite `prefers-color-scheme`
 * und es wird nichts gespeichert. Erst wenn jemand „Hell“ oder „Dunkel“ wählt, merkt sich der Browser
 * das unter THEME_KEY; „System“ löscht den Eintrag wieder. Nichts davon erreicht den Server.
 */
export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "markenfrei:theme";

export const THEME_LABEL: Record<Theme, string> = {
  system: "System",
  light: "Hell",
  dark: "Dunkel",
};

/** Liest einen gespeicherten oder am <html> gesetzten Wert; alles Unbekannte bedeutet „System“. */
export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * Läuft im <head> vor dem ersten Zeichnen (siehe layout.tsx), damit die gewählte Darstellung ohne
 * Aufblitzen gilt. Bewusst ohne Abhängigkeiten und fehlertolerant: Ist der Speicher gesperrt, bleibt „System“.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
