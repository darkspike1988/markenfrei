import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubCheckApi } from "./helpers";

test.describe("Prüfer", () => {
  test("ein freier Name ergibt Grün, ein vergebener Rot, jeweils mit Text", async ({ page }) => {
    await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("textbox").first().fill("wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    await expect(page.getByText("Keine Treffer").first()).toBeVisible();

    await page.getByRole("textbox").first().fill("react");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByText("Vergeben").first()).toBeVisible();
  });

  test("Shortlist: Rangliste zeigt freie Namen zuerst, Vergleich und Liste lassen sich umschalten", async ({ page }) => {
    await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("textbox").first().fill("react, wachwerk, schichtflux");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnisse" })).toBeVisible();

    const rows = page.locator("details summary");
    await expect(rows.filter({ hasText: "react" })).toBeVisible();
    // vergebener Name steht hinter den freien
    const texts = await page.locator("main details > summary").allInnerTexts();
    const idx = (n: string) => texts.findIndex((t) => t.includes(n));
    expect(idx("react")).toBeGreaterThan(idx("wachwerk"));
    expect(idx("react")).toBeGreaterThan(idx("schichtflux"));

    await page.getByRole("button", { name: "Vergleich" }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByRole("button", { name: "Liste" }).click();
    await expect(page.getByRole("table")).toBeHidden();
  });

  test("Zustand im Link: ?q= startet die Prüfung und die Adresse bleibt teilbar", async ({ page }) => {
    const calls = await stubCheckApi(page);
    await page.goto("/?q=wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    expect(calls).toContain("wachwerk");
    expect(page.url()).toContain("q=wachwerk");
  });

  test("Browser-Suche: Seite verlinkt die OpenSearch-Beschreibung, ?q=wachwerk prüft genau einmal", async ({ page }) => {
    const calls = await stubCheckApi(page);
    await page.goto("/?q=wachwerk");
    await expect(page.locator('link[rel="search"][type="application/opensearchdescription+xml"]')).toHaveAttribute(
      "href",
      "/opensearch.xml",
    );
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    await page.waitForTimeout(1000);
    expect(calls).toEqual(["wachwerk"]);
  });

  test("vorübergehende Lücke (retryable) wird automatisch erneut geprüft und danach grün", async ({ page }) => {
    test.setTimeout(40_000);
    const calls = await stubCheckApi(page, { budgetGapFirst: true });
    await page.goto("/");
    await page.getByRole("textbox").first().fill("wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    await expect(page.getByText("Treffer oder Lücken prüfen").first()).toBeVisible();
    // erster Versuch: Lücke; die Oberfläche wiederholt nach wenigen Sekunden von selbst
    await expect.poll(() => calls.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    await expect(page.getByText("Keine Treffer").first()).toBeVisible({ timeout: 10_000 });
  });

  test("Vergleich → Name anklicken wechselt zur Liste und klappt die Berichtszeile auf", async ({ page }) => {
    await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("textbox").first().fill("react, wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnisse" })).toBeVisible();
    await page.getByRole("button", { name: "Vergleich" }).click();
    await page.getByRole("table").getByRole("link", { name: /^react/ }).first().click();
    await expect(page.getByRole("table")).toBeHidden();
    await expect(page.locator("details#bericht-react")).toHaveAttribute("open", "");
  });

  test("Drucken klappt alle Berichtszeilen auf und danach wieder zu", async ({ page }) => {
    await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("textbox").first().fill("react, wachwerk, schichtflux");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnisse" })).toBeVisible();
    const rows = page.locator("details[id^='bericht-']");
    await expect(rows).toHaveCount(3);
    const openCount = () => rows.evaluateAll((els) => els.filter((e) => (e as HTMLDetailsElement).open).length);
    const before = await openCount();
    expect(before).toBeLessThan(3);
    await page.emulateMedia({ media: "print" });
    await expect.poll(openCount).toBe(3);
    await page.emulateMedia({ media: "screen" });
    await expect.poll(openCount).toBe(before);
  });

  test("Zusatzquelle wählen: Anfrage enthält sie und der Link merkt sie sich", async ({ page }) => {
    const bodies: { names: string[]; sources?: string[] }[] = [];
    await stubCheckApi(page);
    page.on("request", (req) => {
      if (req.url().endsWith("/api/check")) bodies.push(req.postDataJSON());
    });
    await page.goto("/");
    await page.getByText("Anpassen").click();
    await page.getByText(/^Pakete\s*\+\d+/).click();
    await page.getByRole("button", { name: "NuGet", exact: true }).click();
    await page.getByRole("textbox").first().fill("wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    expect(bodies.at(-1)?.sources).toContain("nuget");
    expect(page.url()).toMatch(/src=[^&]*nuget/);
  });

  test("Exporte: CSV, Markdown und JSON laden eine Datei", async ({ page }) => {
    await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("textbox").first().fill("wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    for (const [label, ext] of [["Als CSV", ".csv"], ["Als Markdown", ".md"], ["JSON exportieren", ".json"]] as const) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: label }).click();
      expect((await download).suggestedFilename()).toMatch(new RegExp(`\\${ext}$`));
    }
  });

  test("leere und zu lange Eingaben zeigen eine Fehlermeldung statt einer Anfrage", async ({ page }) => {
    const calls = await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.locator("form [role=alert]")).toBeVisible();
    expect(calls).toHaveLength(0);
  });
});

test.describe("Barrierefreiheit (axe, WCAG 2.1 AA)", () => {
  const pages = ["/", "/quellen", "/api-docs", "/mcp", "/kontakt", "/impressum", "/datenschutz", "/domain-pruefen"];
  for (const path of pages) {
    test(`${path} hat keine axe-Verstöße`, async ({ page }) => {
      await page.goto(path);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }

  test("Startseite mit Ergebnis (Shortlist) hat keine axe-Verstöße", async ({ page }) => {
    await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("textbox").first().fill("react, wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnisse" })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test("Tastatur: Prüfen per Enter-Taste im Formular, Fokus landet auf der Ergebnis-Überschrift", async ({ page }) => {
    await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("textbox").first().fill("wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeFocused();
  });
});
