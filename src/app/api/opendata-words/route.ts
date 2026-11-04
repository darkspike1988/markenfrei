import { z } from "zod";
import { guard, isAllowedBrowserCall, isJsonContentType, jsonError, NO_STORE, readLimited } from "@/app/api/_lib/http";
import { discoverOpenDataWords } from "@/lib/opendata";

/**
 * POST /api/opendata-words
 * Eingabe: { keywords: string[] | "a, b", description?, brandSeed?, maxLen?, avoid? }
 * Ausgabe: OpenDataWordField aus src/lib/opendata.ts (regelbasiert, ungeprüft).
 *
 * Schutz wie bei /api/check: nur JSON, Origin-Prüfung, Body höchstens 8 KB, feste
 * Längengrenzen für alles, was an OpenThesaurus und Datamuse weitergeht. Fehlermeldungen
 * sind allgemein und auf Deutsch, interne Meldungen gehen nie nach außen.
 */

const MAX_BODY_BYTES = 8 * 1024;
const MAX_KEYWORDS = 6;

/** Kommagetrennter Text oder Liste; Einträge unter 2 Zeichen fallen weg (wie Füllwörter). */
const keywordsSchema = z.preprocess(
  (v) => {
    const list = typeof v === "string" ? v.split(",") : v;
    return Array.isArray(list)
      ? list.map((k) => (typeof k === "string" ? k.trim() : k)).filter((k) => typeof k !== "string" || k.length >= 2)
      : list;
  },
  z.array(z.string().max(40)).min(1).max(MAX_KEYWORDS),
);

const bodySchema = z.object({
  keywords: keywordsSchema,
  description: z.string().max(500).optional(),
  brandSeed: z.string().max(40).optional(),
  maxLen: z.number().int().min(4).max(16).optional(),
  avoid: z.array(z.string().max(40)).max(50).optional(),
});

function describeIssue(issue: z.core.$ZodIssue): string {
  switch (String(issue.path[0] ?? "")) {
    case "keywords":
      if (issue.code === "too_small") return "Bitte mindestens ein Stichwort mit 2 oder mehr Zeichen angeben.";
      if (issue.code === "too_big" && issue.path.length === 1) return `Höchstens ${MAX_KEYWORDS} Stichwörter.`;
      if (issue.code === "too_big") return "Ein Stichwort darf höchstens 40 Zeichen lang sein.";
      return "keywords muss eine Liste von Texten sein.";
    case "description":
      return "Die Beschreibung darf höchstens 500 Zeichen lang sein.";
    case "brandSeed":
      return "brandSeed darf höchstens 40 Zeichen lang sein.";
    case "maxLen":
      return "maxLen muss eine ganze Zahl von 4 bis 16 sein.";
    case "avoid":
      return "avoid: höchstens 50 Texte mit je bis zu 40 Zeichen.";
    default:
      return "Ungültige Anfrage. Erwartet: { keywords: [\"…\"] }.";
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!isAllowedBrowserCall(req)) return jsonError(403, "Aufrufe von fremden Seiten sind nicht erlaubt.");
  if (!isJsonContentType(req)) return jsonError(415, "Bitte als JSON senden (Content-Type: application/json).");

  let raw: string | null;
  try {
    raw = await readLimited(req, MAX_BODY_BYTES);
  } catch {
    return jsonError(400, "Die Anfrage konnte nicht gelesen werden.");
  }
  if (raw === null) return jsonError(413, `Die Anfrage ist zu groß (höchstens ${MAX_BODY_BYTES / 1024} KB).`);

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return jsonError(400, "Die Anfrage ist kein gültiges JSON.");
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError(400, describeIssue(parsed.error.issues[0]));
  const body = parsed.data;

  const limited = guard(req, 1);
  if (limited) return limited;

  try {
    const field = await discoverOpenDataWords({
      keywords: body.keywords,
      description: body.description ?? "",
      brandSeed: body.brandSeed ?? "",
      maxLen: body.maxLen ?? 11,
      avoid: body.avoid ?? [],
    });
    return Response.json(field, { headers: NO_STORE });
  } catch {
    return jsonError(500, "Die Wortfeld-Abfrage ist fehlgeschlagen. Bitte später erneut versuchen.");
  }
}
