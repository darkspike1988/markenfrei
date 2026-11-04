/**
 * Unterstützte Domain-Endungen. Quelle der Wahrheit für UI, API-Validierung und Tests.
 * Eine Endung gehört hier nur hinein, wenn sie in clearance.ts einen RDAP-Server hat
 * oder bewusst nur über den DoH-Fallback läuft.
 */
export const SUPPORTED_TLDS = [
  "de",
  "com",
  "net",
  "app",
  "dev",
  "io",
  "ai",
  "fr",
  "uk",
  "kr",
] as const;

export const DEFAULT_TLDS: readonly string[] = ["de", "com", "app", "ai", "io"];

/** Mehr Endungen pro Anfrage bedeuten mehr Abfragen bei Dritten. */
export const MAX_TLDS_PER_REQUEST = 8;

export type TldResult =
  | { ok: true; tlds: string[] }
  | { ok: false; error: string };

export function parseTlds(input: unknown): TldResult {
  if (input === undefined || input === null) {
    return { ok: true, tlds: [...DEFAULT_TLDS] };
  }
  if (!Array.isArray(input)) {
    return { ok: false, error: "tlds muss eine Liste von Endungen sein." };
  }
  if (input.length === 0) {
    return { ok: true, tlds: [...DEFAULT_TLDS] };
  }

  const seen = new Set<string>();
  for (const raw of input) {
    const tld = String(raw ?? "")
      .trim()
      .toLowerCase()
      .replace(/^\./, "");
    if (!(SUPPORTED_TLDS as readonly string[]).includes(tld)) {
      return {
        ok: false,
        error: `Endung „${tld.slice(0, 20)}“ wird nicht unterstützt. Erlaubt: ${SUPPORTED_TLDS.join(", ")}.`,
      };
    }
    seen.add(tld);
  }

  if (seen.size > MAX_TLDS_PER_REQUEST) {
    return {
      ok: false,
      error: `Höchstens ${MAX_TLDS_PER_REQUEST} Endungen pro Anfrage.`,
    };
  }
  return { ok: true, tlds: [...seen] };
}
