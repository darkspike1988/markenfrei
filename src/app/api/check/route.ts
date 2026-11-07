import type { z } from "zod";
import { checkNames, CheckInputError, MAX_NAMES } from "@/lib/engine/check";
import type { Namespace } from "@/lib/engine/types";
import { CHECK_ERRORS, CHECK_MAX_BODY_BYTES, checkBodySchema } from "@/app/api/_lib/check-schema";
import { CLIENT_RATE_LIMIT } from "@/lib/rate-limit";
import { checkCost, distinctNameCount, guardDetailed, isAllowedBrowserCall, isJsonContentType, jsonError, NO_STORE, readLimited } from "@/app/api/_lib/http";

/**
 * POST /api/check
 * Eingabe: { names: string[] (1–MAX_NAMES), tlds?: string[], namespaces?: string[], sources?: string[] }
 * Ausgabe: { ranking, reports } aus checkNames. Suchanfragen werden nicht gespeichert.
 *
 * Schutz: nur Content-Type application/json (fremde Seiten brauchen dann einen Preflight),
 * Origin wie in _lib/http.ts, Body höchstens 16 KB, Rate-Limit nach Namen und Quellenumfang.
 */

// Schema, Grenzen und feste Meldungen stehen in _lib/check-schema.ts (auch für /api/openapi.json).

function fail(status: number, error: string, headers: Record<string, string> = {}): Response {
  return jsonError(status, error, headers);
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
  if (!isAllowedBrowserCall(req)) return fail(403, CHECK_ERRORS.forbidden);
  if (!isJsonContentType(req)) return fail(415, CHECK_ERRORS.contentType);

  let raw: string | null;
  try {
    raw = await readLimited(req, CHECK_MAX_BODY_BYTES);
  } catch {
    return fail(400, CHECK_ERRORS.unreadable);
  }
  if (raw === null) return fail(413, CHECK_ERRORS.tooLarge);

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(400, CHECK_ERRORS.invalidJson);
  }

  const parsed = checkBodySchema.safeParse(json);
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
    return fail(500, CHECK_ERRORS.failed);
  }

  // Mehr als das Limit pro Fenster geht nie durch: 400 statt eines 429, das nie endet.
  if (cost > CLIENT_RATE_LIMIT) return fail(400, CHECK_ERRORS.exceedsLimit(CLIENT_RATE_LIMIT));

  const limited = guardDetailed(req, cost);
  if (limited.response) return limited.response;

  try {
    const result = await checkNames(body.names, opts);
    return Response.json(result, { headers: { ...NO_STORE, ...limited.headers } });
  } catch (err) {
    // Einheiten sind verbraucht: Fehlerantworten tragen die RateLimit-Header ebenfalls.
    if (err instanceof CheckInputError) return fail(400, err.message, limited.headers);
    return fail(500, CHECK_ERRORS.failed, limited.headers);
  }
}
