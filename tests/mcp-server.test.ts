import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { clearAllCaches } from "@/lib/cache";
import { clearResultCache, resolveSources } from "@/lib/engine/check";
import { MCP_REGISTER_HINT, PROFILE_IDS, REGISTER_LINE_PREFIX, selectSources } from "@/lib/engine/format";
import { NameReportSchema } from "@/lib/engine/report-schema";
import type { NameReport } from "@/lib/engine/check";
import { rankReports } from "@/lib/engine/verdict";
import {
  CheckNamesOutputSchema,
  createMarkenfreiMcpServer,
  formatRanking,
  INTERNAL_ERROR_TEXT,
  prepareShortlist,
  SuggestNamesOutputSchema,
  TOOL_NAMES,
  TrademarkPrepOutputSchema,
} from "@/mcp/server";

// Gestubbtes Netz: nur "vergeben.de" ist registriert, alles andere gibt 404.
const realFetch = globalThis.fetch;
const requested: string[] = [];
const stubFetch = (async (input: string | URL | Request) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  requested.push(url);
  if (url.startsWith("https://rdap.denic.de/domain/vergeben.de")) {
    return new Response(JSON.stringify({ objectClassName: "domain", ldhName: "vergeben.de" }), {
      status: 200,
      headers: { "Content-Type": "application/rdap+json" },
    });
  }
  return new Response("", { status: 404 });
}) as typeof fetch;

let client: Client;

before(async () => {
  clearAllCaches();
  clearResultCache();
  globalThis.fetch = stubFetch;
  const server = createMarkenfreiMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

after(async () => {
  await client.close();
  globalThis.fetch = realFetch;
  clearAllCaches();
  clearResultCache();
});

function text(result: CallToolResult): string {
  const first = result.content[0];
  return first && first.type === "text" ? first.text : "";
}

async function call(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  // Der SDK-Client prüft structuredContent selbst gegen das outputSchema aus tools/list.
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

test("Server-Anweisungen warnen vor grün als Markenfreigabe und vor unknown", () => {
  const instructions = client.getInstructions() ?? "";
  assert.match(instructions, /keine Markenfreigabe/);
  assert.match(instructions, /unknown nie als frei werten/);
  assert.match(instructions, /markenfrei_trademark_prep/);
  assert.equal(client.getServerVersion()?.name, "markenfrei");
});

test("Server-Anweisungen nennen Anlass, Ablauf, Profile und den Umgang mit dem Registrierungs-Link", () => {
  const instructions = client.getInstructions() ?? "";
  assert.match(instructions, /bevor du ein Projekt, Paket, eine App, ein Repository oder eine Domain anlegst, benennst/);
  assert.match(instructions, /Namensideen/);
  assert.match(instructions, /5 bis 10 Kandidaten/);
  assert.match(instructions, /markenfrei_check_names und dem passenden profile/);
  for (const id of PROFILE_IDS) assert.ok(instructions.includes(id), `Profil ${id} fehlt`);
  assert.match(instructions, /Namen ohne Treffer bevorzugen/);
  assert.match(instructions, /Gelb und unknown gelten als nicht geklärt/);
  assert.match(instructions, /nie „frei“ nennen/);
  assert.match(instructions, /Nichts selbst bestellen/);
  assert.ok(instructions.length < 2000, `Anweisungen sind ${instructions.length} Zeichen lang`);
});

test("tools/list: genau vier Werkzeuge, alle mit Titel, outputSchema und Annotationen", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort());
  for (const t of tools) {
    assert.ok(t.title, `${t.name}: title fehlt`);
    assert.ok(t.description && t.description.length > 50, `${t.name}: description fehlt`);
    assert.equal(t.outputSchema?.type, "object", `${t.name}: outputSchema fehlt`);
    assert.equal(t.annotations?.readOnlyHint, true);
    assert.equal(t.annotations?.destructiveHint, false);
    assert.equal(t.annotations?.idempotentHint, true);
    assert.equal(t.annotations?.openWorldHint, t.name !== "markenfrei_trademark_prep", `${t.name}: openWorldHint`);
  }
  const check = tools.find((t) => t.name === "markenfrei_check_name");
  const props = check?.inputSchema.properties as Record<string, { type?: string; items?: { enum?: string[] }; maxItems?: number }>;
  assert.equal(props.tlds.maxItems, 8);
  assert.deepEqual(props.namespaces.items?.enum, ["domains", "packages", "stores", "social", "known_names"]);
  assert.ok(props.sources.items?.enum?.includes("npm"));
  assert.ok(!props.sources.items?.enum?.some((id) => id.startsWith("rdap:")), "Domains laufen über tlds");
  for (const name of ["markenfrei_check_name", "markenfrei_check_names"]) {
    const tool = tools.find((t) => t.name === name);
    const profile = (tool?.inputSchema.properties as Record<string, { enum?: string[]; description?: string }>).profile;
    assert.deepEqual(profile.enum, [...PROFILE_IDS], name);
    for (const id of PROFILE_IDS) assert.ok(profile.description?.includes(`${id} = `), `${name}: ${id} nicht beschrieben`);
    assert.match(tool?.description ?? "", /profile/, name);
  }
});

test("tools/list ohne Endungs-Aufzählung", async () => {
  const { tools } = await client.listTools();
  for (const name of ["markenfrei_check_name", "markenfrei_check_names"]) {
    const tool = tools.find((t) => t.name === name);
    const props = tool?.inputSchema.properties as Record<string, { description?: string; items?: { enum?: string[]; pattern?: string } }>;
    assert.equal(props.tlds.items?.enum, undefined, `${name}: keine Aufzählung der Endungen`);
    assert.ok(props.tlds.items?.pattern, `${name}: Muster statt Aufzählung`);
    assert.match(props.tlds.description ?? "", /\/api\/sources/);
    // die ganze Schemaausgabe bleibt klein, auch mit über 1.000 gültigen Endungen
    assert.ok(JSON.stringify(tool?.inputSchema).length < 8000, `${name}: Schema ist ${JSON.stringify(tool?.inputSchema).length} Zeichen lang`);
  }
});

test("markenfrei_check_name: kompakter Text und NameReport", async () => {
  const res = await call("markenfrei_check_name", { name: "Vergeben", tlds: ["de"], sources: ["npm"] });
  assert.notEqual(res.isError, true, text(res));
  const report = NameReportSchema.parse(res.structuredContent);
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.name, "vergeben");
  assert.equal(report.verdict, "red");
  assert.deepEqual(
    report.results.map((r) => [r.sourceId, r.status]),
    [
      ["rdap:de", "taken"],
      ["npm", "not_found"],
    ],
  );
  assert.equal(report.trademark.status, "not_checked");

  const lines = text(res).split("\n");
  assert.ok(lines.length >= 3 && lines.length <= 10, `Zeilen: ${lines.length}`);
  assert.equal(lines[0], "vergeben: ROT (Vergeben)");
  assert.ok(lines.includes("Domains: .de vergeben"), text(res));
  assert.ok(lines.some((l) => l.startsWith("Pakete: npm nicht gefunden")), text(res));
  assert.equal(lines.at(-1), "Marke: nicht geprüft → markenfrei_trademark_prep");

  // Links stehen auch im Text, nicht nur in structuredContent
  const deUrl = report.results.find((r) => r.sourceId === "rdap:de")?.url;
  assert.ok(deUrl, "rdap:de liefert einen Link");
  assert.ok(lines.includes("Nachprüfen:"), text(res));
  assert.ok(lines.includes(`- .de vergeben: ${deUrl}`), text(res));
  assert.ok(!lines.some((l) => l.startsWith("- npm")), "nicht gefundene Quellen ohne Link-Zeile");
  const manual = lines.find((l) => l.startsWith("Manuell prüfen (nicht abgefragt): "));
  assert.ok(manual?.includes("Instagram https://www.instagram.com/vergeben/"), text(res));
});

test("not_found wird überall eindeutig erklärt (heißt nicht frei oder registrierbar)", async () => {
  const { tools } = await client.listTools();
  const texts = [client.getInstructions() ?? "", JSON.stringify(tools)];
  for (const t of texts) {
    assert.doesNotMatch(t, /heißt nicht registrierbar/);
    assert.doesNotMatch(t, /\(heißt nicht/);
  }
  assert.match(texts[0], /not_found = die Quelle kennt den Namen nicht, das heißt nicht, dass er frei oder registrierbar ist/);
  for (const name of ["markenfrei_check_name", "markenfrei_check_names"]) {
    const d = tools.find((t) => t.name === name)?.description ?? "";
    assert.match(d, /not_found = nicht gefunden \(das heißt nicht, dass der Name frei oder registrierbar ist\)/, name);
  }
  const check = tools.find((t) => t.name === "markenfrei_check_name");
  const status = JSON.stringify(check?.outputSchema);
  assert.match(status, /das heißt nicht, dass er frei oder registrierbar ist/);
});

test("namespaces [social] ohne sources fragt Bluesky und Mastodon ab", async () => {
  const res = await call("markenfrei_check_name", { name: "zzqxkvjwabc", namespaces: ["social"] });
  assert.notEqual(res.isError, true, text(res));
  const report = NameReportSchema.parse(res.structuredContent);
  assert.deepEqual(
    report.results.map((r) => r.sourceId),
    ["bluesky", "mastodon"],
  );
  assert.ok(text(res).split("\n").some((l) => l.startsWith("Social: Bluesky ")), text(res));

  // Zusammen mit anderen Namensräumen bleiben deren Standardquellen erhalten
  const mixed = await call("markenfrei_check_name", { name: "zzqxkvjwabc", namespaces: ["packages", "social"] });
  const ids = NameReportSchema.parse(mixed.structuredContent).results.map((r) => r.sourceId);
  assert.ok(ids.includes("npm") && ids.includes("bluesky") && ids.includes("mastodon"), ids.join(","));
  assert.ok(!ids.includes("hackernews"), "Hacker News nur über sources");
  assert.ok(!ids.some((id) => id.startsWith("rdap:")), "ohne domains keine Domains");

  // Ausdrückliche sources gelten unverändert
  const explicit = await call("markenfrei_check_name", { name: "zzqxkvjwabc", namespaces: ["social"], sources: ["hackernews"] });
  assert.deepEqual(
    NameReportSchema.parse(explicit.structuredContent).results.map((r) => r.sourceId),
    ["hackernews"],
  );
});

test("ohne abgefragte Quelle erklärt der Text die gelbe Ampel", async () => {
  const res = await call("markenfrei_check_name", { name: "zzqxkvjwabc", namespaces: ["social"], sources: [] });
  assert.notEqual(res.isError, true, text(res));
  const report = NameReportSchema.parse(res.structuredContent);
  assert.equal(report.results.length, 0);
  assert.match(text(res), /Keine Quelle abgefragt, Gelb heißt hier nur: nichts geprüft/);
  assert.match(text(res), /Manuell prüfen \(nicht abgefragt\): Instagram/);
});

test("markenfrei_check_names: Rangliste und Berichte", async () => {
  const res = await call("markenfrei_check_names", {
    names: ["vergeben", "wachwerk"],
    tlds: ["de"],
    sources: ["npm"],
  });
  assert.notEqual(res.isError, true, text(res));
  const out = CheckNamesOutputSchema.parse(res.structuredContent);
  assert.deepEqual(
    out.ranking.map((e) => [e.name, e.verdict]),
    [
      ["wachwerk", "green"],
      ["vergeben", "red"],
    ],
  );
  assert.equal(out.reports.length, 2);
  assert.deepEqual(out.ranking[1].taken, [".de"]);
  const t = text(res);
  assert.match(t, /^Rangliste \(2 Namen/);
  assert.match(t, /1\. wachwerk: GRÜN/);
  assert.match(t, /2\. vergeben: ROT · vergeben: \.de/);
  const deUrl = out.reports.find((r) => r.name === "vergeben")?.results.find((r) => r.sourceId === "rdap:de")?.url;
  assert.ok(t.includes(`   .de vergeben: ${deUrl}`), t);

  // Shortlist-Berichte ohne Markenvorbereitung (die kommt über markenfrei_trademark_prep)
  for (const r of out.reports) assert.ok(!("trademark" in r), `${r.name}: trademark im Bericht`);
  for (const r of (res.structuredContent as { reports: object[] }).reports) assert.ok(!("trademark" in r));
  assert.ok(Array.isArray(out.reports[0].manualLinks));
});

test("markenfrei_check_names: outputSchema ohne trademark, kurze sources-Beschreibung", async () => {
  const { tools } = await client.listTools();
  const names = tools.find((t) => t.name === "markenfrei_check_names");
  const schema = names?.outputSchema as unknown as {
    properties: { reports: { items: { properties: Record<string, unknown>; required?: string[] } } };
  };
  const reportProps = schema.properties.reports.items.properties;
  assert.ok(!("trademark" in reportProps));
  assert.ok("results" in reportProps && "manualLinks" in reportProps);
  assert.ok(!(schema.properties.reports.items.required ?? []).includes("trademark"));

  const single = tools.find((t) => t.name === "markenfrei_check_name");
  assert.ok("trademark" in ((single?.outputSchema as { properties: object }).properties), "check_name behält trademark");
  const sources = (single?.inputSchema.properties as Record<string, { description?: string }>).sources;
  assert.ok((sources.description ?? "").length < 300, `sources-Beschreibung: ${sources.description?.length}`);
});

test("markenfrei_check_names: ungültiger Name mit Position, ohne Netzabfrage", async () => {
  const before = requested.length;
  const res = await call("markenfrei_check_names", { names: ["frischname", "--"], tlds: ["de"], sources: ["npm"] });
  assert.equal(res.isError, true);
  assert.equal(
    text(res),
    "Eingabefehler: Name 2 („--“): Der Name darf nicht mit einem Bindestrich beginnen oder enden.",
  );
  assert.equal(requested.length, before, "keine Abfrage für die gültigen Namen");

  const dotted = await call("markenfrei_check_names", { names: ["frischname", "frisch2", "a.b.c"], tlds: ["de"], sources: ["npm"] });
  assert.match(text(dotted), /^Eingabefehler: Name 3 \(„a\.b\.c“\): Bitte nur den Namen ohne Punkte/);
  assert.equal(requested.length, before);
});

test("markenfrei_check_names: gleiche Namen nach der Normalisierung werden einmal geprüft", async () => {
  const before = requested.length;
  const res = await call("markenfrei_check_names", {
    names: ["Dopplung", "dopplung", "dopplung.de", "Dopplung"],
    tlds: ["de"],
    sources: ["npm"],
  });
  assert.notEqual(res.isError, true, text(res));
  const out = CheckNamesOutputSchema.parse(res.structuredContent);
  assert.deepEqual(
    out.ranking.map((e) => e.name),
    ["dopplung"],
  );
  assert.equal(out.reports.length, 1);
  assert.equal(out.reports[0].input, "Dopplung");
  assert.equal(requested.length - before, 2, "je eine Abfrage für .de und npm");
  assert.match(text(res), /^Rangliste \(1 Name,/);
  assert.match(text(res), /Zusammengefasst: „Dopplung“, „dopplung“, „dopplung\.de“ → dopplung/);
});

test("prepareShortlist: Reihenfolge, erste Schreibweise, Fehler mit Position", () => {
  assert.deepEqual(prepareShortlist(["Bb", "aa", "bb.com", "Bb"]), {
    ok: true,
    inputs: ["Bb", "aa"],
    merged: [{ name: "bb", inputs: ["Bb", "bb.com"] }],
  });
  const long = `${"x".repeat(50)}.a.b`;
  const bad = prepareShortlist(["gut", "gut2", long]);
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? "" : bad.error, /^Name 3 \(„x{39}…“\): Bitte nur den Namen ohne Punkte/);
});

test("formatRanking begründet Gelb mit ähnlich und schwachem Treffer und verlinkt Treffer", () => {
  const base = { namespace: "known_names" as const, target: "gelbname" };
  const report = {
    name: "gelbname",
    verdict: "yellow",
    results: [
      { ...base, sourceId: "known_brands", label: "Bekannte Marken", status: "similar", url: "https://example.org/brands", note: "klingt wie Gelbnahme" },
      { ...base, sourceId: "wikipedia", label: "Wikipedia", status: "taken", weak: true, url: "https://de.wikipedia.org/wiki/Gelbname" },
      { ...base, sourceId: "gleif", label: "GLEIF", status: "unknown", url: "https://search.gleif.org/" },
      { ...base, sourceId: "wikidata", label: "Wikidata", status: "not_found", url: "https://www.wikidata.org/" },
      { ...base, namespace: "packages", sourceId: "npm", label: "npm", status: "invalid", url: "https://www.npmjs.com/package/gelbname" },
    ],
    manualLinks: [],
  } as unknown as NameReport;
  const lines = formatRanking(rankReports([report]), [report]).split("\n");
  assert.equal(
    lines[1],
    "1. gelbname: GELB · nicht zulässig: npm · ähnlich: Bekannte Marken · schwacher Treffer: Wikipedia · Lücken: GLEIF",
  );
  assert.equal(lines[2], "   Bekannte Marken ähnlich: https://example.org/brands");
  assert.equal(lines[3], "   Wikipedia schwacher Treffer: https://de.wikipedia.org/wiki/Gelbname");
  assert.equal(lines[4], "   npm nicht zulässig: https://www.npmjs.com/package/gelbname");
  assert.ok(!lines.some((l) => l.includes("gleif.org") || l.includes("wikidata.org")), "Lücken und nicht gefunden ohne Link");
});

test("markenfrei_trademark_prep: ohne Netz, mit vorgegebenen Klassen", async () => {
  const before = requested.length;
  const res = await call("markenfrei_trademark_prep", { name: "WachWerk", classes: [42, 9] });
  assert.notEqual(res.isError, true, text(res));
  assert.equal(requested.length, before, "keine Netzabfrage");
  const out = TrademarkPrepOutputSchema.parse(res.structuredContent);
  assert.equal(out.name, "wachwerk");
  assert.equal(out.status, "not_checked");
  assert.deepEqual(
    out.classes.map((c) => c.number),
    [9, 42],
  );
  assert.match(out.dpmaExpertQuery, /KL=09 ODER KL=42/);
  assert.match(text(res), /Marke nicht geprüft/);
  assert.match(text(res), /DPMA-Expertensuchstring: /);
});

test("markenfrei_suggest_names: ungeprüfte Kandidaten, Anzahl begrenzt", async () => {
  const res = await call("markenfrei_suggest_names", { keywords: ["schicht", "planung"], count: 5 });
  assert.notEqual(res.isError, true, text(res));
  const out = SuggestNamesOutputSchema.parse(res.structuredContent);
  assert.equal(out.checked, false);
  assert.ok(out.candidates.length > 0 && out.candidates.length <= 5, `Anzahl ${out.candidates.length}`);
  for (const c of out.candidates) assert.match(c.name, /^[a-z]{4,12}$/);
  assert.match(text(res), /ungeprüft, mit markenfrei_check_names prüfen/i);

  // Standardanzahl 10
  const def = await call("markenfrei_suggest_names", { keywords: ["schicht", "planung", "wache"] });
  assert.ok(SuggestNamesOutputSchema.parse(def.structuredContent).candidates.length <= 10);
});

test("Eingabefehler der Engine ergeben isError mit deutscher Meldung", async () => {
  const dotted = await call("markenfrei_check_name", { name: "a.b.c" });
  assert.equal(dotted.isError, true);
  assert.match(text(dotted), /^Eingabefehler: Bitte nur den Namen ohne Punkte/);
  assert.equal(dotted.structuredContent, undefined);

  const hyphen = await call("markenfrei_check_names", { names: ["ok", "-x-"] });
  assert.equal(hyphen.isError, true);
  assert.match(text(hyphen), /Bindestrich/);

  const prep = await call("markenfrei_trademark_prep", { name: "-x-" });
  assert.equal(prep.isError, true);
  assert.match(text(prep), /^Eingabefehler:/);
});

test("unerwartete Fehler ergeben einen festen Text ohne die Meldung der Ausnahme", async () => {
  const broken = createMarkenfreiMcpServer({
    now: () => {
      throw new Error("geheim: /srv/markenfrei/.env nicht lesbar");
    },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const other = new Client({ name: "test", version: "0" });
  await Promise.all([broken.connect(serverTransport), other.connect(clientTransport)]);
  try {
    for (const [name, args] of [
      ["markenfrei_check_name", { name: "wachwerk", tlds: ["de"], sources: ["npm"] }],
      ["markenfrei_check_names", { names: ["wachwerk"], tlds: ["de"], sources: ["npm"] }],
    ] as const) {
      const res = (await other.callTool({ name, arguments: args })) as CallToolResult;
      assert.equal(res.isError, true, name);
      assert.equal(text(res), INTERNAL_ERROR_TEXT);
      assert.match(text(res), /^Interner Fehler\./);
      assert.ok(!/geheim|\.env/.test(JSON.stringify(res)), `${name}: Ausnahmetext sichtbar`);
      assert.equal(res.structuredContent, undefined);
    }
  } finally {
    await other.close();
  }
});

test("Schemafehler (Endung, Anzahl, Länge) ergeben isError statt Absturz", async () => {
  const tld = await call("markenfrei_check_name", { name: "foo", tlds: ["constructor"] });
  assert.equal(tld.isError, true);
  assert.match(text(tld), /\/api\/sources/);
  const shape = await call("markenfrei_check_name", { name: "foo", tlds: [".de"] });
  assert.equal(shape.isError, true, "Form ungültig (Punkt)");

  const many = await call("markenfrei_check_names", { names: Array.from({ length: 11 }, (_, i) => `name${i}`) });
  assert.equal(many.isError, true);
  assert.match(text(many), /Höchstens 10 Namen/);

  const short = await call("markenfrei_check_name", { name: "a" });
  assert.equal(short.isError, true);
  assert.match(text(short), /mindestens 2 Zeichen/);

  const kw = await call("markenfrei_suggest_names", { keywords: [] });
  assert.equal(kw.isError, true);
  assert.match(text(kw), /mindestens ein Stichwort/);
});

test("profile: das Werkzeug prüft die aufgelöste Auswahl, ausdrückliche tlds ersetzen nur die Endungen", async () => {
  const expected = resolveSources(selectSources({ profile: "npm" }, true)).map((s) => s.id);
  assert.ok(!expected.some((id) => id.startsWith("rdap:")), "npm ohne Domains");
  const res = await call("markenfrei_check_names", { names: ["profilname", "profilzwei"], profile: "npm" });
  assert.notEqual(res.isError, true, text(res));
  const out = CheckNamesOutputSchema.parse(res.structuredContent);
  for (const r of out.reports) assert.deepEqual(r.results.map((x) => x.sourceId), expected);

  const single = await call("markenfrei_check_name", { name: "profilname", profile: "npm", tlds: ["de"] });
  assert.notEqual(single.isError, true, text(single));
  assert.deepEqual(NameReportSchema.parse(single.structuredContent).results.map((r) => r.sourceId), ["rdap:de", ...expected]);
});

test("profile: unbekanntes Profil ist ein Eingabefehler mit der Liste der Profile, ohne Netzabfrage", async () => {
  const before = requested.length;
  const res = await call("markenfrei_check_names", { names: ["profilname"], profile: "gibtsnicht" });
  assert.equal(res.isError, true);
  assert.match(text(res), /Unbekanntes Profil\. Erlaubt: allgemein, web-app, /);
  assert.equal(requested.length, before);
});

test("Registrierungs-Link: im Text und in structuredContent nur bei eingestelltem Dienst", async () => {
  const args = { names: ["vergeben", "wachwerk"], tlds: ["de"], sources: ["npm"] };
  const plain = await call("markenfrei_check_names", args);
  assert.ok(!text(plain).includes(REGISTER_LINE_PREFIX), "ohne Einstellung kein Link");
  for (const r of CheckNamesOutputSchema.parse(plain.structuredContent).reports) {
    assert.ok(r.results.every((x) => x.register === undefined));
  }

  const server = createMarkenfreiMcpServer({
    register: { name: "Beispiel-Domains", urlTemplate: "https://example.org/bestellen?domain={domain}" },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const other = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverTransport), other.connect(clientTransport)]);
  try {
    const res = (await other.callTool({ name: "markenfrei_check_names", arguments: args })) as CallToolResult;
    assert.notEqual(res.isError, true, text(res));
    const out = CheckNamesOutputSchema.parse(res.structuredContent);
    const byName = new Map(out.reports.map((r) => [r.name, r]));
    const de = byName.get("wachwerk")?.results.find((r) => r.sourceId === "rdap:de");
    assert.equal(de?.status, "not_found");
    assert.deepEqual(de?.register, {
      label: "Registrieren über Beispiel-Domains",
      url: "https://example.org/bestellen?domain=wachwerk.de",
      notice:
        "Angebot des Betreibers dieser Seite; er kann dafür eine Vergütung erhalten. „Nicht gefunden“ ist keine Zusage, dass die Domain bestellbar ist.",
    });
    assert.ok(byName.get("vergeben")?.results.every((r) => r.register === undefined), "vergeben ohne Link");
    assert.ok(byName.get("wachwerk")?.results.find((r) => r.sourceId === "npm")?.register === undefined, "nur Domains");

    const lines = text(res).split("\n");
    assert.ok(lines.includes(`   ${REGISTER_LINE_PREFIX}: wachwerk.de → https://example.org/bestellen?domain=wachwerk.de`), text(res));
    assert.ok(lines.includes(MCP_REGISTER_HINT), text(res));
    assert.ok(!lines.some((l) => l.includes("vergeben.de →")));

    const single = (await other.callTool({ name: "markenfrei_check_name", arguments: { name: "wachwerk", tlds: ["de"], sources: ["npm"] } })) as CallToolResult;
    assert.equal(NameReportSchema.parse(single.structuredContent).results[0].register?.url, "https://example.org/bestellen?domain=wachwerk.de");
    assert.ok(text(single).split("\n").includes(`${REGISTER_LINE_PREFIX}: wachwerk.de → https://example.org/bestellen?domain=wachwerk.de`));
  } finally {
    await other.close();
  }
});
