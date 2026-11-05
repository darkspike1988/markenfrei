import type { z } from "zod";
import { checkNames, CheckInputError, MAX_NAMES } from "@/lib/engine/check";
import type { Namespace } from "@/lib/engine/types";
import { CHECK_ERRORS, CHECK_MAX_BODY_BYTES, checkBodySchema } from "@/app/api/_lib/check-schema";
import { checkCost, distinctNameCount, guard, isAllowedBrowserCall, isJsonContentType, jsonError, NO_STORE, readLimited } from "@/app/api/_lib/http";

/**
 * POST /api/check
 * Eingabe: { names: string[] (1–MAX_NAMES), tlds?: string[], namespaces?: string[], sources?: string[] }
 * Ausgabe: { ranking, reports } aus checkNames. Suchanfragen werden nicht gespeichert.
 *
 * Schutz: nur Content-Type application/json (fremde Seiten brauchen dann einen Preflight),
 * Origin wie in _lib/http.ts, Body höchstens 16 KB, Rate-Limit nach Namen und Quellenumfang.
 */

// Schema, Grenzen und feste Meldungen stehen in _lib/check-schema.ts (auch für /api/openapi.json).

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

  const limited = guard(req, cost);
  if (limited) return limited;

  try {
    const result = await checkNames(body.names, opts);
    return Response.json(result, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof CheckInputError) return fail(400, err.message);
    return fail(500, CHECK_ERRORS.failed);
  }
}
