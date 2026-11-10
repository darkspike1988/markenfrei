import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stubCheckApi, test } from "./helpers";

/** Prüft „wachwerk“ mit gestubbter API und klappt den Markenblock auf. */
async function openTrademarkBlock(page: Page) {
  await page.goto("/");
  await page.getByRole("textbox").first().fill("wachwerk");
  await page.getByRole("button", { name: "Prüfen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ergebnis" })).toBeVisible();
  const block = page.locator("details#bericht-wachwerk details").filter({ hasText: "Marke: nicht geprüft" });
  await block.locator("summary").click();
  await expect(block.getByLabel("Was ist das Produkt?")).toBeVisible();
  return block;
}

test.describe("Markenblock", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("Beschreibung und Klassenwahl ändern Vorschlag und Suchstring im Browser, ohne Anfrage", async ({ page }) => {
    const calls = await stubCheckApi(page);
    const block = await openTrademarkBlock(page);
    const callsBefore = calls.length;
    const requests: { url: string; body: string }[] = [];
    page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() ?? "" }));

    const query = block.locator("code");
    const chip = (n: number) => block.getByRole("button", { name: new RegExp(`^Klasse ${n}:`) });

    // Anfangszustand wie vom Server berechnet
    await expect(query).toHaveText(/ UND \(KL=09 ODER KL=42\)$/);
    await expect(chip(9)).toHaveAttribute("aria-pressed", "true");
    await expect(chip(35)).toHaveAttribute("aria-pressed", "false");
    await expect(block.getByRole("button", { name: "Vorschlag wiederherstellen" })).toHaveCount(0);

    await block.getByLabel("Was ist das Produkt?").fill("Online-Shop mit Chat");
    await expect(query).toHaveText(/ UND \(KL=09 ODER KL=42 ODER KL=35 ODER KL=38\)$/);
    await expect(chip(35)).toHaveAttribute("aria-pressed", "true");
    await expect(chip(38)).toHaveAttribute("aria-pressed", "true");
    await expect(block.getByText(/^Klasse 35 · /)).toBeVisible();
    await expect(block.getByRole("listitem").filter({ hasText: "Vorschlag: 9, 42, 35, 38" })).toBeVisible();

    await chip(38).click();
    await expect(chip(38)).toHaveAttribute("aria-pressed", "false");
    await expect(query).toHaveText(/ UND \(KL=09 ODER KL=35 ODER KL=42\)$/);
    await expect(query).not.toContainText("KL=38");
    await expect(block.getByText(/^Klasse 38 · /)).toHaveCount(0);

    // Kopieren nimmt den aktuellen Suchstring
    await block.getByRole("button", { name: "Kopieren" }).click();
    await expect(block.getByRole("button", { name: "Kopiert" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await query.innerText());

    await block.getByRole("button", { name: "Vorschlag wiederherstellen" }).click();
    await expect(query).toHaveText(/ UND \(KL=09 ODER KL=42 ODER KL=35 ODER KL=38\)$/);
    await expect(chip(38)).toHaveAttribute("aria-pressed", "true");

    // Nichts verlässt den Browser: keine Prüfung, keine API, kein fremder Host, die Beschreibung nirgends
    const origin = new URL(page.url()).origin;
    expect(calls).toHaveLength(callsBefore);
    expect(requests.filter((r) => r.url.includes("/api/"))).toEqual([]);
    expect(requests.filter((r) => !r.url.startsWith(origin) && !/^(blob|data):/.test(r.url))).toEqual([]);
    expect(requests.filter((r) => /shop/i.test(decodeURIComponent(r.url) + r.body))).toEqual([]);
  });

  test("keine Klasse gewählt: Suchstring ohne Klasseneinschränkung", async ({ page }) => {
    await stubCheckApi(page);
    const block = await openTrademarkBlock(page);
    await block.getByRole("button", { name: /^Klasse 9:/ }).click();
    await block.getByRole("button", { name: /^Klasse 42:/ }).click();
    await expect(block.getByText("Keine Klasse gewählt: Der Suchstring sucht in allen Klassen.")).toBeVisible();
    await expect(block.locator("code")).not.toContainText("KL=");
    await expect(block.locator("code")).toHaveText(/^\(MARKE=\?wachwerk\?/);
  });

  test("geöffneter Markenblock mit Beschreibung hat keine axe-Verstöße", async ({ page }) => {
    await stubCheckApi(page);
    const block = await openTrademarkBlock(page);
    await block.getByLabel("Was ist das Produkt?").fill("Lern-App mit Chat");
    await block.getByRole("button", { name: /^Klasse 3:/ }).click();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
