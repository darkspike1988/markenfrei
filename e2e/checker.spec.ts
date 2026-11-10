import { expect, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubCheckApi, stubReport, test } from "./helpers";

test.describe("Prüfer", () => {
  test("ein freier Name ergibt Grün, ein vergebener Rot, jeweils mit Text", async ({ page }) => {
    await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("textbox").first().fill("wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    // Auf die Berichtskarte begrenzt: Legende und Überschrift enthalten dieselben Wörter und würden immer passen.
    await expect(page.getByTestId("verdict-panel")).toContainText("Keine Treffer");

    await page.getByRole("textbox").first().fill("react");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.locator("details#bericht-react").getByTestId("verdict-panel")).toContainText("Vergeben");
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
    const panel = page.locator("details#bericht-wachwerk").getByTestId("verdict-panel");
    await expect(panel).toContainText("Treffer oder Lücken prüfen");
    // erster Versuch: Lücke; die Oberfläche wiederholt nach wenigen Sekunden von selbst
    await expect.poll(() => calls.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    await expect(panel).toContainText("Keine Treffer", { timeout: 10_000 });
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

  test("Endung über das Suchfeld wählen: Anfrage enthält sie, Enter im Feld sendet nichts ab", async ({ page }) => {
    const bodies: { names: string[]; tlds?: string[] }[] = [];
    await stubCheckApi(page);
    page.on("request", (req) => {
      if (req.url().endsWith("/api/check")) bodies.push(req.postDataJSON());
    });
    await page.goto("/");
    await page.getByText("Anpassen").click();
    await page.getByText("Endungen wählen oder suchen").click();
    const search = page.getByLabel(/Weitere Endung suchen/);
    await search.fill(".Academy");
    await search.press("Enter");
    expect(bodies).toHaveLength(0);
    await expect(page.getByRole("button", { name: /^\.academy/ }).first()).toBeVisible();
    await page.getByRole("textbox").first().fill("wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    expect(bodies.at(-1)?.tlds).toContain("academy");
    expect(page.url()).toMatch(/tld=[^&]*academy/);
  });

  test("Exporte: CSV, Markdown und JSON laden eine Datei", async ({ page }) => {
    await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("textbox").first().fill("wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    for (const [label, ext] of [["CSV", ".csv"], ["Markdown", ".md"], ["JSON", ".json"]] as const) {
      await page.getByRole("button", { name: "Exportieren" }).click();
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: label, exact: true }).click();
      expect((await download).suggestedFilename()).toMatch(new RegExp(`\\${ext}$`));
    }
  });

  test("Erinnerung (.ics): Download ohne neue Netzanfrage, Inhalt mit eigener Adresse", async ({ page }) => {
    const calls = await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("textbox").first().fill("wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    const callsBefore = calls.length;
    await page.getByRole("button", { name: "Exportieren" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Erinnerung (.ics)", exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("markenfrei-wachwerk.ics");
    const { readFile } = await import("node:fs/promises");
    const text = await readFile((await file.path())!, "utf8");
    expect(text).toContain("SUMMARY:wachwerk erneut prüfen");
    expect(text).toContain("URL:http://");
    expect(calls).toHaveLength(callsBefore);
    expect(requests.filter((u) => !u.startsWith("blob:"))).toEqual([]);
  });

  test("leere und zu lange Eingaben zeigen eine Fehlermeldung statt einer Anfrage", async ({ page }) => {
    const calls = await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.locator("form [role=alert]")).toBeVisible();
    expect(calls).toHaveLength(0);

    // 11 Namen, erlaubt sind 10
    const eleven = Array.from({ length: 11 }, (_, i) => `name${String.fromCharCode(97 + i)}`).join(", ");
    await page.getByRole("textbox").first().fill(eleven);
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.locator("form [role=alert]")).toBeVisible();
    await expect(page.locator("form [role=alert]")).toContainText("Höchstens 10 Namen");
    expect(calls).toHaveLength(0);
  });

  test("Eingabe-Vorschau zeigt die geprüften Namen; Doppelte werden nur einmal abgefragt, Plättchen lassen sich entfernen", async ({ page }) => {
    const calls = await stubCheckApi(page);
    await page.goto("/");
    const field = page.getByRole("textbox").first();
    await field.fill("Wach Werk, wachwerk, müller.de, xy");
    const tokens = page.getByRole("list", { name: "Erkannte Namen" });
    await expect(tokens.getByRole("listitem")).toHaveCount(4);
    await expect(tokens.getByRole("listitem").filter({ hasText: "doppelt" })).toHaveCount(1);
    await expect(tokens).toContainText("mueller");

    await page.getByRole("button", { name: "xy entfernen" }).click();
    await expect(field).toHaveValue("Wach Werk, wachwerk, müller.de");

    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.locator("details[id^='bericht-']")).toHaveCount(2);
    expect([...calls].sort()).toEqual(["Wach Werk", "müller.de"]);
  });

  test("„Nur Auffälliges“ blendet Quellen ohne Fund aus und wieder ein", async ({ page }) => {
    await stubCheckApi(page);
    await page.goto("/");
    await page.getByRole("textbox").first().fill("react");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    const card = page.locator("details#bericht-react");
    await expect(card.getByText("PyPI", { exact: true })).toBeVisible();

    const filter = page.getByRole("button", { name: "Nur Auffälliges" });
    await filter.click();
    await expect(filter).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByText("npm", { exact: true })).toBeVisible();
    await expect(card.getByText("PyPI", { exact: true })).toBeHidden();
    await expect(card.getByText(/Quellen ohne Fund\s+ausgeblendet/).first()).toBeVisible();

    await filter.click();
    await expect(card.getByText("PyPI", { exact: true })).toBeVisible();
  });

  test("Abbrechen beendet eine laufende Prüfung; „Erneut prüfen“ holt das Ergebnis nach", async ({ page }) => {
    let hanging = true;
    let release = () => {};
    const hang = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/check", async (route) => {
      if (hanging) {
        await hang;
        await route.abort().catch(() => {});
        return;
      }
      const body = route.request().postDataJSON() as { names: string[] };
      await route.fulfill({ json: { reports: [await stubReport(body.names[0])] } });
    });
    await page.goto("/");
    await page.getByRole("textbox").first().fill("wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await page.getByRole("button", { name: "Abbrechen" }).click();
    await expect(page.getByText("Prüfung abgebrochen.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Abbrechen" })).toBeHidden();

    hanging = false;
    await page.getByRole("button", { name: "Erneut prüfen" }).click();
    await expect(page.locator("details#bericht-wachwerk")).toContainText("Keine Treffer");
    release();
  });

  test("Seitenkopf bei 360 px: einzeilig, ohne Umbruch in Wörtern, ohne horizontales Überlaufen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await page.goto("/");
    const links = page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link").filter({ visible: true });
    await expect(links).toHaveCount(2);
    const wordmark = page.locator("header").getByText("Markenfrei", { exact: true });
    // Zeilen eines Elements: verschiedene Oberkanten der Textfragmente (ein Umbruch mitten im Wort ergibt zwei).
    const lineCount = (l: Locator) =>
      l.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top))).size;
      });
    for (const el of [wordmark, ...(await links.all())]) {
      const box = await el.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThanOrEqual(40);
      expect(await lineCount(el)).toBe(1);
    }
    await expect(page.getByRole("button", { name: "Darstellung" })).toBeVisible();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("Darstellung: „Dunkel“ gilt nach dem Neuladen, „System“ entfernt Wahl und Speichereintrag", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).not.toHaveAttribute("data-theme");
    expect(await page.evaluate(() => localStorage.getItem("markenfrei:theme"))).toBeNull();

    await page.getByRole("button", { name: "Darstellung" }).click();
    await page.getByRole("button", { name: "Dunkel", exact: true }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => localStorage.getItem("markenfrei:theme"))).toBe("dark");

    // Neu laden (goto wartet, bis die Seite aktiv ist): das Skript im Kopf setzt die Wahl wieder
    await page.goto("/");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Darstellung" }).click();
    await expect(page.getByRole("button", { name: "Dunkel", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "System", exact: true }).click();
    await expect(html).not.toHaveAttribute("data-theme");
    expect(await page.evaluate(() => localStorage.getItem("markenfrei:theme"))).toBeNull();
  });

  test("Verlauf: aus, bis man ihn einschaltet; merkt sich Prüfungen, prüft per Klick erneut und lässt sich löschen", async ({ page }) => {
    const calls = await stubCheckApi(page);
    const stored = () => page.evaluate(() => localStorage.getItem("markenfrei:history"));
    await page.goto("/");
    await page.getByRole("textbox").first().fill("planzeit");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    expect(await stored()).toBeNull();

    await page.getByText("Zuletzt geprüft", { exact: true }).click();
    await page.getByRole("button", { name: "Verlauf einschalten" }).click();
    expect(await stored()).toBe("[]");
    await expect(page.getByText("Noch keine Prüfung gemerkt.")).toBeVisible();

    await page.getByRole("textbox").first().fill("wachwerk");
    await page.getByRole("button", { name: "Prüfen", exact: true }).click();
    await expect(page.locator("details#bericht-wachwerk")).toBeVisible();
    expect(JSON.parse((await stored()) ?? "[]")).toEqual([expect.objectContaining({ query: "q=wachwerk" })]);

    await page.goto("/");
    await page.getByText("Zuletzt geprüft", { exact: true }).click();
    const entry = page.getByRole("button", { name: /^wachwerk/ });
    await expect(entry).toBeVisible();
    const before = calls.length;
    await entry.click();
    await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
    await expect.poll(() => calls.length).toBeGreaterThan(before);
    await expect(page.getByRole("textbox").first()).toHaveValue("wachwerk");

    await page.getByRole("button", { name: "Verlauf löschen und ausschalten" }).click();
    expect(await stored()).toBeNull();
    await expect(page.getByRole("button", { name: "Verlauf einschalten" })).toBeVisible();
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
