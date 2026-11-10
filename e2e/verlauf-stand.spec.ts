import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { NameReport } from "@/lib/engine/check";
import { computeVerdict, countStatuses, VERDICT_LABEL } from "@/lib/engine/verdict";
import { encodeShared, sharedFromReports } from "@/lib/snapshot-link";
import { stubCheckApi, stubReport, test, type CheckRequest } from "./helpers";

type CheckBody = { names: string[] } & CheckRequest;

const stored = (page: Page) => page.evaluate(() => localStorage.getItem("markenfrei:history"));

/**
 * Stub wie stubCheckApi, aber ab dem `takenFrom`-ten Aufruf meldet `.com` „vergeben“ (Ampel neu berechnet).
 * Gibt die Liste der geprüften Namen zurück.
 */
async function stubComTakenLater(page: Page, takenFrom: number) {
  const calls: string[] = [];
  await page.route("**/api/check", async (route) => {
    const body = route.request().postDataJSON() as CheckBody;
    calls.push(body.names[0]);
    const report = await stubReport(body.names[0], { request: body });
    if (calls.length < takenFrom) {
      await route.fulfill({ json: { reports: [report] } });
      return;
    }
    const results = report.results.map((r) => (r.sourceId === "rdap:com" ? { ...r, status: "taken" as const } : r));
    const verdict = computeVerdict(results);
    const changed: NameReport = {
      ...report,
      results,
      verdict,
      verdictLabel: VERDICT_LABEL[verdict],
      counts: countStatuses(results),
    };
    await route.fulfill({ json: { reports: [changed] } });
  });
  return calls;
}

async function check(page: Page, names: string) {
  await page.getByRole("textbox").first().fill(names);
  await page.getByRole("button", { name: "Prüfen", exact: true }).click();
}

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test.describe("Verlauf: Wiederprüfung mit Vergleich", () => {
  test("mit Verlauf zeigt die zweite Prüfung die Änderung, die dritte „Keine Änderung“", async ({ page }) => {
    const calls = await stubComTakenLater(page, 2);
    await page.goto("/");
    await page.getByText("Zuletzt geprüft", { exact: true }).click();
    await page.getByRole("button", { name: "Verlauf einschalten" }).click();

    await check(page, "wachwerk");
    await expect(page.locator("details#bericht-wachwerk")).toBeVisible();
    // Das Ergebnis landet erst nach dem Abschluss im Eintrag
    await expect
      .poll(async () => JSON.parse((await stored(page)) ?? "[]")[0]?.results?.wachwerk?.["rdap:com"])
      .toBe("n");
    // Ohne frühere Prüfung kein Hinweis
    await expect(page.getByRole("status").filter({ hasText: /^(Seit der Prüfung vom|Keine Änderung seit) / })).toHaveCount(0);

    await check(page, "wachwerk");
    const notice = page.getByRole("status").filter({ hasText: /^Seit der Prüfung vom / });
    await expect(notice).toBeVisible();
    await expect(notice.getByRole("listitem")).toHaveText(["wachwerk · .com: nicht gefunden → vergeben"]);
    expect(calls).toEqual(["wachwerk", "wachwerk"]);
    await expect
      .poll(async () => JSON.parse((await stored(page)) ?? "[]")[0]?.results?.wachwerk?.["rdap:com"])
      .toBe("t");

    await check(page, "wachwerk");
    await expect(page.getByRole("status").filter({ hasText: /^Keine Änderung seit der Prüfung vom / })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /^Seit der Prüfung vom / })).toHaveCount(0);
    expect(JSON.parse((await stored(page)) ?? "[]")).toHaveLength(1);
  });

  test("ohne Verlauf wird nichts gespeichert und nichts verglichen", async ({ page }) => {
    const calls = await stubComTakenLater(page, 2);
    await page.goto("/");
    await check(page, "wachwerk");
    await expect(page.locator("details#bericht-wachwerk")).toBeVisible();
    await check(page, "wachwerk");
    await expect.poll(() => calls.length).toBe(2);
    const com = page
      .locator("details#bericht-wachwerk")
      .getByRole("region", { name: "Domains", exact: true })
      .getByRole("listitem")
      .filter({ hasText: /^\.com/ });
    await expect(com).toContainText("vergeben");
    await expect(page.getByRole("status").filter({ hasText: /^(Seit der Prüfung vom|Keine Änderung seit) / })).toHaveCount(0);
    expect(await stored(page)).toBeNull();
  });
});

test.describe("Stand teilen", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("„Stand kopieren“ legt einen Link mit #stand= ab; er zeigt den Stand ohne Anfrage, „Jetzt neu prüfen“ fragt an", async ({
    page,
    context,
  }) => {
    await stubCheckApi(page);
    await page.goto("/");
    await check(page, "react, wachwerk");
    await expect(page.getByRole("heading", { name: "Ergebnisse" })).toBeVisible();
    const share = page.getByRole("group", { name: "Weitergeben" });
    await share.getByRole("button", { name: "Stand kopieren" }).click();
    await expect(share.getByRole("button", { name: "Kopiert" })).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\?q=react,wachwerk#stand=[A-Za-z0-9_-]+$/);

    const other = await context.newPage();
    const calls = await stubCheckApi(other);
    await other.goto(link);
    await other.waitForLoadState("networkidle");
    const heading = other.getByRole("heading", { name: /^Stand vom / });
    await expect(heading).toBeVisible();
    await expect(heading.locator("xpath=following-sibling::p[1]")).toHaveText(
      /^Gespeichertes Ergebnis aus dem Link, keine neue Prüfung\./,
    );
    await expect(other.getByRole("heading", { name: "Ergebnis" })).toHaveCount(0);
    // Die Abschnitte je Name gibt es nur in der Stand-Ansicht
    const react = other.getByRole("region", { name: "react", exact: true });
    const wachwerk = other.getByRole("region", { name: "wachwerk", exact: true });
    await expect(react).toContainText("Ampel Rot: Vergeben");
    await expect(react.getByRole("region", { name: "Pakete", exact: true }).getByText("npm", { exact: true })).toBeVisible();
    await expect(react.getByRole("region", { name: "Domains", exact: true }).getByText(".com", { exact: true })).toBeVisible();
    await expect(wachwerk).toContainText("Ampel Grün: Keine Treffer");
    // Keine Links, kein Markenblock in der Stand-Ansicht
    for (const section of [react, wachwerk]) {
      await expect(section.getByRole("link")).toHaveCount(0);
      await expect(section.getByText("Marke: nicht geprüft")).toHaveCount(0);
    }
    expect(calls).toEqual([]);

    await other.getByRole("button", { name: "Jetzt neu prüfen", exact: true }).click();
    await expect(other.getByRole("heading", { name: "Ergebnisse" })).toBeVisible();
    await expect.poll(() => [...calls].sort()).toEqual(["react", "wachwerk"]);
    await expect(other.getByRole("heading", { name: /^Stand vom / })).toHaveCount(0);
    expect(new URL(other.url()).hash).toBe("");
    expect(new URL(other.url()).searchParams.get("q")).toBe("react,wachwerk");
  });

  test("ein kaputter Stand wird ignoriert: der Link prüft wie ohne Fragment", async ({ page }) => {
    const calls = await stubCheckApi(page);
    await page.goto("/?q=wachwerk#stand=kaputt");
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    await expect.poll(() => calls).toEqual(["wachwerk"]);
    await expect(page.getByRole("heading", { name: /^Stand vom / })).toHaveCount(0);
  });

  test("der Stand erscheint auch im Prüfer einer Anleitungsseite, ohne Anfrage", async ({ page }) => {
    const calls = await stubCheckApi(page);
    const data = await encodeShared(sharedFromReports([await stubReport("wachwerk")], "2026-11-10T09:30:00.000Z"));
    await page.goto(`/domain-pruefen?q=wachwerk#stand=${data}`);
    await expect(page.getByRole("heading", { name: /^Stand vom / })).toBeVisible();
    expect(calls).toEqual([]);
  });
});

test.describe("Barrierefreiheit (axe, WCAG 2.1 AA)", () => {
  test("Ansicht eines geteilten Stands hat keine axe-Verstöße", async ({ page }) => {
    const calls = await stubCheckApi(page);
    const reports = await Promise.all(["react", "wachwerk"].map((n) => stubReport(n)));
    const data = await encodeShared(sharedFromReports(reports, "2026-11-10T09:30:00.000Z"));
    await page.goto(`/?q=react,wachwerk#stand=${data}`);
    await expect(page.getByRole("heading", { name: /^Stand vom / })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    expect(calls).toEqual([]);
  });
});
