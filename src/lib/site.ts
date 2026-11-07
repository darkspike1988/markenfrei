/** Öffentliche Adresse des Angebots, wenn MARKENFREI_PUBLIC_URL fehlt. */
export const DEFAULT_PUBLIC_URL = "https://markenfrei.app";

/** Öffentliche Adresse aus der Umgebung (MARKENFREI_PUBLIC_URL), sonst die Standardadresse. */
export function publicUrl(env: Record<string, string | undefined> = process.env): URL {
  const raw = env.MARKENFREI_PUBLIC_URL?.trim();
  if (raw) {
    try {
      return new URL(raw);
    } catch {
      // ungültiger Wert: Standardadresse nehmen statt die Seite zu brechen
    }
  }
  return new URL(DEFAULT_PUBLIC_URL);
}

export const SITE_NAME = "Markenfrei";
export const SITE_TITLE = "Markenfrei · Namen vorprüfen";
export const SITE_DESCRIPTION =
  "Wo ist der Name schon vergeben? Domains, Pakete, App Stores und bekannte Namen in einem Durchgang prüfen, mit Link zur Quelle, wo es einen gibt. Marken werden nicht geprüft, die Recherche wird vorbereitet. Keine Rechtsberatung, keine Speicherung von Suchanfragen.";

/** Seiten, die in die Sitemap gehören. Impressum und Datenschutz sind enthalten, damit sie auffindbar sind. */
export const SITEMAP_PATHS = [
  "/",
  "/domain-pruefen",
  "/paketname-pruefen",
  "/app-name-pruefen",
  "/markenrecherche-vorbereiten",
  "/quellen",
  "/mcp",
  "/api-docs",
  "/datenschutz",
  "/impressum",
] as const;
