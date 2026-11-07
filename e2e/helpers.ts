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
import { checkName, clearResultCache, type NameReport } from "@/lib/engine/check";

/** Namen, die der Stub als vergeben meldet (npm). Alles andere: nirgends gefunden. */
export const TAKEN = new Set(["react", "docker-compose"]);

/**
 * Baut einen echten Bericht mit der Engine, aber ohne Netz: npm kennt nur die Namen in TAKEN, alle
 * anderen Quellen antworten "nicht gefunden". So stimmen Schema und Ampel mit dem Server überein.
 */
export async function stubReport(name: string, opts: { budgetGap?: boolean } = {}): Promise<NameReport> {
  clearResultCache();
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://registry.npmjs.org/")) {
      const n = decodeURIComponent(url.split("/").pop() ?? "");
      return new Response("{}", { status: TAKEN.has(n) ? 200 : 404 });
    }
    return new Response("{}", { status: 404 });
  };
  const report = await checkName(name, { fetchImpl, namespaces: ["packages"], tlds: [] });
  if (!opts.budgetGap) return report;
  // Wie der Server bei erschöpftem Abfragebudget: unknown, Beleg "budget", retryable
  const results = report.results.map((r) =>
    r.sourceId === "crates" ? { ...r, status: "unknown" as const, evidence: "budget", note: "Abfragelimit erreicht", retryable: true } : r,
  );
  return { ...report, results, verdict: "yellow", verdictLabel: "Treffer oder Lücken prüfen", incomplete: ["crates.io"] };
}

/** Ersetzt POST /api/check durch den Stub. `calls` zählt die Aufrufe je Name. */
export async function stubCheckApi(page: Page, opts: { budgetGapFirst?: boolean } = {}) {
  const calls: string[] = [];
  const seen = new Map<string, number>();
  await page.route("**/api/check", async (route: Route) => {
    const body = route.request().postDataJSON() as { names: string[] };
    const name = body.names[0];
    calls.push(name);
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    const report = await stubReport(name, { budgetGap: opts.budgetGapFirst && n === 1 });
    await route.fulfill({ json: { reports: [report] } });
  });
  return calls;
}
