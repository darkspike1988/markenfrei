import { z } from "zod";
import { checkNames, CheckInputError, MAX_NAMES } from "@/lib/engine/check";
import type { Namespace } from "@/lib/engine/types";
import { checkCost, distinctNameCount, guard, isAllowedBrowserCall, isJsonContentType, jsonError, NO_STORE, readLimited } from "@/app/api/_lib/http";

/**
 * POST /api/check
 * Eingabe: { names: string[] (1–MAX_NAMES), tlds?: string[], namespaces?: string[], sources?: string[] }
 * Ausgabe: { ranking, reports } aus checkNames. Suchanfragen werden nicht gespeichert.
 *
 * Schutz: nur Content-Type application/json (fremde Seiten brauchen dann einen Preflight),
 * Origin wie in _lib/http.ts, Body höchstens 16 KB, Rate-Limit nach Namen und Quellenumfang.
 */

const MAX_BODY_BYTES = 16 * 1024;

const bodySchema = z.object({
  names: z.array(z.string().max(200)).min(1).max(MAX_NAMES),
  tlds: z.array(z.string().max(30)).max(50).optional(),
  namespaces: z.array(z.string().max(30)).max(20).optional(),
  sources: z.array(z.string().max(60)).max(100).optional(),
});

function fail(status: number, error: string): Response {
  return jsonError(status, error);
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const field = String(issue.path[0] ?? "");
  if (field === "names") {
    if (issue.code === "too_big" && issue.path.length === 1) return `Höchstens ${MAX_NAMES} Namen pro Anfrage.`;
    if (issue.code === "too_small") return "Bitte mindestens einen Namen angeben.";
    if (issue.code === "too_big") return "Ein Name ist zu lang.";
    return "names muss eine Liste von Texten sein.";
  }
  if (field === "tlds" || field === "namespaces" || field === "sources") {
    if (issue.code === "too_big" && issue.path.length === 1) return `${field}: zu viele Einträge.`;
    return `${field} muss eine Liste von Texten sein.`;
  }
  return "Ungültige Anfrage. Erwartet: { names: [\"…\"] }.";
}

export async function POST(req: Request): Promise<Response> {
  if (!isAllowedBrowserCall(req)) return fail(403, "Aufrufe von fremden Seiten sind nicht erlaubt.");
  if (!isJsonContentType(req)) return fail(415, "Bitte als JSON senden (Content-Type: application/json).");

  let raw: string | null;
  try {
    raw = await readLimited(req, MAX_BODY_BYTES);
  } catch {
    return fail(400, "Die Anfrage konnte nicht gelesen werden.");
  }
  if (raw === null) return fail(413, "Die Anfrage ist zu groß (höchstens 16 KB).");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(400, "Die Anfrage ist kein gültiges JSON.");
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail(400, describeIssue(parsed.error.issues[0]));
  const body = parsed.data;

  const opts = {
    tlds: body.tlds,
    // Typen prüft resolveSources und meldet unbekannte Werte als CheckInputError.
    namespaces: body.namespaces as Namespace[] | undefined,
    sources: body.sources,
  };

  let cost: number;
  try {
    cost = checkCost(distinctNameCount(body.names), opts);
  } catch (err) {
    if (err instanceof CheckInputError) return fail(400, err.message);
    return fail(500, "Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.");
  }

  const limited = guard(req, cost);
  if (limited) return limited;

  try {
    const result = await checkNames(body.names, opts);
    return Response.json(result, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof CheckInputError) return fail(400, err.message);
    return fail(500, "Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.");
  }
}
