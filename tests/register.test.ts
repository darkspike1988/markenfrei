import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { checkName, checkNames, clearResultCache } from "@/lib/engine/check";
import type { NameReport } from "@/lib/engine/check";
import { formatRanking, formatReport, MCP_REGISTER_HINT, REGISTER_LINE_PREFIX } from "@/lib/engine/format";
import { NameReportSchema } from "@/lib/engine/report-schema";
import { DOMAIN_TLDS, FEATURED_TLDS } from "@/lib/engine/sources/domains";
import type { Namespace, Source, Status } from "@/lib/engine/types";
import { rankReports } from "@/lib/engine/verdict";
import { CSV_COLUMNS, toCsv, toMarkdown } from "@/lib/export";
import { isHostName, REGISTER_NOTICE, registerConfigFromEnv, registerLink, type RegisterService } from "@/lib/register";

beforeEach(() => clearResultCache());

const SERVICE: RegisterService = { name: "Beispiel-Domains", urlTemplate: "https://example.org/bestellen?domain={domain}" };

test("registerConfigFromEnv: gültige Einstellung, sonst null und keine Ausnahme", () => {
  assert.deepEqual(
    registerConfigFromEnv({
      MARKENFREI_REGISTER_URL: " https://example.org/bestellen?domain={domain} ",
      MARKENFREI_REGISTER_NAME: " Beispiel-Domains ",
    }),
    SERVICE,
  );
  assert.deepEqual(
    registerConfigFromEnv({ MARKENFREI_REGISTER_URL: "https://example.org/{tld}/{name}?d={domain}", MARKENFREI_REGISTER_NAME: "X" }),
    { name: "X", urlTemplate: "https://example.org/{tld}/{name}?d={domain}" },
  );

  const off = (url: string | undefined, name: string | undefined) =>
    registerConfigFromEnv({ MARKENFREI_REGISTER_URL: url, MARKENFREI_REGISTER_NAME: name });
  assert.equal(registerConfigFromEnv({}), null, "ohne Einstellung aus");
  assert.equal(off("https://example.org/?d={domain}", undefined), null, "Name fehlt");
  assert.equal(off("https://example.org/?d={domain}", "   "), null, "Name leer");
  assert.equal(off(undefined, "Beispiel"), null, "URL fehlt");
  assert.equal(off("https://example.org/?d={domain}", "x".repeat(61)), null, "Name zu lang");
  assert.ok(off("https://example.org/?d={domain}", "x".repeat(60)), "60 Zeichen sind erlaubt");
  assert.equal(off("https://example.org/?d={domain}", "Bei\nspiel"), null, "Steuerzeichen im Namen");
  for (const url of [
    "http://example.org/?d={domain}",
    "https://example.org/bestellen",
    "https://example.org/?d={domain}&x={unbekannt}",
    "https://{domain}.example.org/",
    "https://example.org/?d= {domain}",
    "https://user:pass@example.org/?d={domain}",
    "https://example.org/?d={domain}}",
    "javascript:alert(1)//{domain}",
    "kein link {domain}",
    `https://example.org/?d={domain}&p=${"x".repeat(2000)}`,
  ]) {
    assert.equal(off(url, "Beispiel"), null, url);
  }
});

test("registerLink: korrekt kodiert, nur für gültige Hostnamen", () => {
  assert.deepEqual(registerLink(SERVICE, "wachwerk.de"), {
    label: "Registrieren über Beispiel-Domains",
    url: "https://example.org/bestellen?domain=wachwerk.de",
    notice: REGISTER_NOTICE,
  });
  assert.equal(
    registerLink({ name: "X", urlTemplate: "https://example.org/r/{name}?tld={tld}&d={domain}" }, "Wach-Werk.CO.uk")?.url,
    "https://example.org/r/wach-werk?tld=co.uk&d=wach-werk.co.uk",
  );
  for (const bad of ["", "wachwerk", "-x.de", "x-.de", "a..de", "wach werk.de", "wach&x=1.de", "wach/../x.de", "1.123", "ä.de", `${"a".repeat(64)}.de`]) {
    assert.equal(registerLink(SERVICE, bad), null, bad);
    assert.equal(isHostName(bad.toLowerCase()), false, bad);
  }
  assert.equal(
    REGISTER_NOTICE,
    "Angebot des Betreibers dieser Seite; er kann dafür eine Vergütung erhalten. „Nicht gefunden“ ist keine Zusage, dass die Domain bestellbar ist.",
  );
});

/** Quelle mit fester ID und festem Status; target wie bei echten Domains name.tld. */
function source(id: string, namespace: Namespace, status: Status): Source & { calls: number } {
  const s = {
    id,
    namespace,
    label: id,
    defaultEnabled: true,
    description: "",
    endpoint: "",
    calls: 0,
    async check(name: string) {
      s.calls++;
      const target = id.startsWith("rdap:") ? `${name}.${id.slice(5)}` : name;
      return { sourceId: id, namespace, label: id, target, status };
    },
  };
  return s;
}

const UNCHECKED_TLD = DOMAIN_TLDS.find((t) => !FEATURED_TLDS.includes(t)) as string;

test("register nur bei eingestelltem Dienst, Domain einer einzeln geprüften Endung und not_found", async () => {
  assert.ok(UNCHECKED_TLD, "es gibt nicht einzeln geprüfte Endungen");
  const registry = [
    source("rdap:de", "domains", "not_found"),
    source("rdap:com", "domains", "taken"),
    source("rdap:dev", "domains", "unknown"),
    source(`rdap:${UNCHECKED_TLD}`, "domains", "not_found"),
    source("npm", "packages", "not_found"),
  ];
  const report = await checkName("Wachwerk", { registry, register: SERVICE });
  NameReportSchema.parse(report);
  const withLink = report.results.filter((r) => r.register).map((r) => r.sourceId);
  assert.deepEqual(withLink, ["rdap:de"]);
  assert.deepEqual(report.results[0].register, registerLink(SERVICE, "wachwerk.de"));

  clearResultCache();
  const off = await checkName("Wachwerk", { registry, register: null });
  assert.ok(off.results.every((r) => !("register" in r)), "abgeschaltet: kein Feld");
});

test("register folgt der aktuellen Einstellung, auch bei Zeilen aus dem Zwischenspeicher", async () => {
  const de = source("rdap:de", "domains", "not_found");
  const first = await checkName("speicher", { registry: [de], register: SERVICE });
  assert.equal(first.results[0].register?.url, "https://example.org/bestellen?domain=speicher.de");

  const other: RegisterService = { name: "Andere", urlTemplate: "https://andere.example/?q={domain}" };
  const second = await checkName("speicher", { registry: [de], register: other });
  assert.equal(de.calls, 1, "zweiter Aufruf aus dem Zwischenspeicher");
  assert.equal(second.results[0].register?.url, "https://andere.example/?q=speicher.de");
  assert.equal(second.results[0].register?.label, "Registrieren über Andere");

  const third = await checkName("speicher", { registry: [de], register: null });
  assert.equal(de.calls, 1);
  assert.equal(third.results[0].register, undefined, "kein veralteter Link aus dem Zwischenspeicher");
});

test("ohne Angabe gilt die Umgebung (wie bei contact), ohne Umgebung kein Link", async () => {
  const saved = { url: process.env.MARKENFREI_REGISTER_URL, name: process.env.MARKENFREI_REGISTER_NAME };
  const registry = [source("rdap:de", "domains", "not_found")];
  try {
    delete process.env.MARKENFREI_REGISTER_URL;
    delete process.env.MARKENFREI_REGISTER_NAME;
    assert.equal((await checkName("umwelt", { registry })).results[0].register, undefined);

    process.env.MARKENFREI_REGISTER_URL = SERVICE.urlTemplate;
    process.env.MARKENFREI_REGISTER_NAME = SERVICE.name;
    const { reports } = await checkNames(["umwelt"], { registry });
    assert.equal(reports[0].results[0].register?.url, "https://example.org/bestellen?domain=umwelt.de");
  } finally {
    for (const [key, value] of [
      ["MARKENFREI_REGISTER_URL", saved.url],
      ["MARKENFREI_REGISTER_NAME", saved.name],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

async function reportWithLink(): Promise<NameReport> {
  return checkName("wachwerk", {
    registry: [source("rdap:de", "domains", "not_found"), source("rdap:com", "domains", "taken"), source("npm", "packages", "not_found")],
    register: SERVICE,
  });
}

test("MCP-Text: beschrifteter Block nach den Quellenzeilen und Anweisung an den Agenten", async () => {
  const report = await reportWithLink();
  const lines = formatReport(report).split("\n");
  const block = `${REGISTER_LINE_PREFIX}: wachwerk.de → https://example.org/bestellen?domain=wachwerk.de`;
  assert.equal(REGISTER_LINE_PREFIX, "Domain registrieren (Angebot des Betreibers, vergütet)");
  const at = lines.indexOf(block);
  assert.ok(at > 0, lines.join("\n"));
  assert.ok(lines.slice(0, at).some((l) => l.startsWith("Domains: ")), "nach den Quellenzeilen");
  assert.equal(lines[at + 1], MCP_REGISTER_HINT);
  assert.match(MCP_REGISTER_HINT, /dem Nutzer zeigen, nichts selbst bestellen/);
  assert.ok(!lines.some((l) => l.includes("wachwerk.com →")), "vergebene Domain ohne Link");

  const ranking = formatRanking(rankReports([report]), [report]).split("\n");
  assert.ok(ranking.includes(`   ${block}`), ranking.join("\n"));
  assert.equal(ranking.filter((l) => l === MCP_REGISTER_HINT).length, 1);

  // Ohne Link kein Block und keine Anweisung
  clearResultCache();
  const plain = await checkName("wachwerk", { registry: [source("rdap:de", "domains", "not_found")], register: null });
  assert.ok(!formatReport(plain).includes(REGISTER_LINE_PREFIX));
  assert.ok(!formatRanking(rankReports([plain]), [plain]).includes(MCP_REGISTER_HINT));
});

test("Markdown-Export nennt den Link mit Hinweis, CSV bleibt bei ihren Spalten", async () => {
  const report = await reportWithLink();
  const md = toMarkdown([report]);
  assert.ok(md.includes("Domain registrieren (Angebot des Betreibers, vergütet):"), md);
  assert.ok(md.includes("- [Registrieren über Beispiel-Domains: wachwerk.de](https://example.org/bestellen?domain=wachwerk.de)"), md);
  assert.ok(md.includes(REGISTER_NOTICE.replace(/[\\|`*_[\]<>#]/g, (c) => `\\${c}`)), md);
  assert.ok(md.indexOf("Domain registrieren") > md.indexOf("| Domains |"), "unter der Tabelle");

  const csv = toCsv([report]);
  assert.equal(csv.split("\r\n")[0], CSV_COLUMNS.join(","));
  assert.deepEqual([...CSV_COLUMNS], ["name", "namespace", "source", "target", "status", "note", "url", "checkedAt"]);
  assert.ok(!csv.includes("example.org/bestellen"), "kein Registrierungs-Link in der CSV");

  clearResultCache();
  const plain = await checkName("wachwerk", { registry: [source("rdap:de", "domains", "not_found")], register: null });
  assert.ok(!toMarkdown([plain]).includes("Domain registrieren"));
});
