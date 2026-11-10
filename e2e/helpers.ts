import { test as base } from "@playwright/test";

/**
 * Wie der Playwright-`test`, aber `page.goto` wartet, bis das Netz ruhig ist. Ohne das drücken Tests
 * Enter oder klicken, bevor die Seite aktiv ist: Der Browser sendet das Formular dann nativ ab und die
 * Ergebnis-Überschrift erscheint nie (unregelmäßiger Fehler, bei jedem Lauf ein anderer Test).
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await page.waitForLoadState("networkidle");
      return response;
    };
    await provide(page);
  },
});

import type { Page, Route } from "@playwright/test";
import { checkName, clearResultCache, resolveSources, type NameReport } from "@/lib/engine/check";
import type { Namespace, SourceResult } from "@/lib/engine/types";
import { computeVerdict, countStatuses, VERDICT_LABEL } from "@/lib/engine/verdict";

/** Namen, die der Stub als vergeben meldet (npm). Alles andere: nirgends gefunden. */
export const TAKEN = new Set(["react", "docker-compose"]);

/** Was der Stub aus dem Anfragekörper von /api/check liest. */
export type CheckRequest = { namespaces?: string[]; tlds?: string[]; sources?: string[] };

/** Ohne Anfrage: Pakete und Domains mit den Standardwerten (wie bisher). */
const DEFAULT_REQUEST: CheckRequest = { namespaces: ["packages"], tlds: [] };

/**
 * Baut einen echten Bericht mit der Engine, aber ohne Netz, für genau die Quellen der Anfrage (wie der
 * Server über resolveSources; unbekannte IDs werfen wie dort). Domains und Pakete laufen durch die echten
 * Quellen gegen ein Fake-Netz: npm kennt nur die Namen in TAKEN, alles andere antwortet 404. Die übrigen
 * Quellen (Stores, Social, Bekannte Namen) melden „nicht gefunden“ mit Beleg „HTTP 404“, ohne Abfrage.
 * So stimmen Schema und Ampel mit dem Server überein.
 */
export async function stubReport(
  name: string,
  opts: { budgetGap?: boolean; request?: CheckRequest } = {},
): Promise<NameReport> {
  clearResultCache();
  const request = opts.request ?? DEFAULT_REQUEST;
  const namespaces = request.namespaces as Namespace[] | undefined;
  const wanted = resolveSources({ namespaces, tlds: request.tlds, sources: request.sources });
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://registry.npmjs.org/")) {
      const n = decodeURIComponent(url.split("/").pop() ?? "");
      return new Response("{}", { status: TAKEN.has(n) ? 200 : 404 });
    }
    return new Response("{}", { status: 404 });
  };
  const domains = wanted.some((s) => s.namespace === "domains");
  const real = await checkName(name, {
    fetchImpl,
    namespaces: [domains ? "domains" : "packages"],
    ...(domains ? { tlds: request.tlds } : {}),
    sources: wanted.filter((s) => s.namespace === "packages").map((s) => s.id),
  });
  const byId = new Map(real.results.map((r) => [r.sourceId, r]));
  const results = wanted.map(
    (s): SourceResult =>
      byId.get(s.id) ?? {
        sourceId: s.id,
        namespace: s.namespace,
        label: s.label,
        target: real.name,
        status: "not_found",
        evidence: "HTTP 404",
      },
  );
  const verdict = computeVerdict(results);
  const report: NameReport = {
    ...real,
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    counts: countStatuses(results),
    incomplete: results.filter((r) => r.status === "unknown").map((r) => r.label),
    results,
  };
  if (!opts.budgetGap) return report;
  // Wie der Server bei erschöpftem Abfragebudget: unknown, Beleg "budget", retryable
  const gapped = report.results.map((r) =>
    r.sourceId === "crates" ? { ...r, status: "unknown" as const, evidence: "budget", note: "Abfragelimit erreicht", retryable: true } : r,
  );
  return { ...report, results: gapped, verdict: "yellow", verdictLabel: "Treffer oder Lücken prüfen", incomplete: ["crates.io"] };
}

/**
 * Ersetzt POST /api/check durch den Stub, der Namensräume, Endungen und Quellen der Anfrage beachtet.
 * Unbekannte Werte ergeben wie beim Server 400. `calls` zählt die Aufrufe je Name.
 */
export async function stubCheckApi(page: Page, opts: { budgetGapFirst?: boolean } = {}) {
  const calls: string[] = [];
  const seen = new Map<string, number>();
  await page.route("**/api/check", async (route: Route) => {
    const body = route.request().postDataJSON() as { names: string[] } & CheckRequest;
    const name = body.names[0];
    calls.push(name);
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    let report: NameReport;
    try {
      report = await stubReport(name, { budgetGap: opts.budgetGapFirst && n === 1, request: body });
    } catch (err) {
      await route.fulfill({ status: 400, json: { error: err instanceof Error ? err.message : String(err) } });
      return;
    }
    await route.fulfill({ json: { reports: [report] } });
  });
  return calls;
}
