import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { clearAllCaches } from "@/lib/cache";
import { clearResultCache } from "@/lib/engine/check";
import { NameReportSchema } from "@/lib/engine/report-schema";
import {
  CheckNamesOutputSchema,
  createMarkenfreiMcpServer,
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
  assert.ok(props.tlds.items?.enum?.includes("de"));
  assert.equal(props.tlds.maxItems, 8);
  assert.deepEqual(props.namespaces.items?.enum, ["domains", "packages", "stores", "social", "known_names"]);
  assert.ok(props.sources.items?.enum?.includes("npm"));
  assert.ok(!props.sources.items?.enum?.some((id) => id.startsWith("rdap:")), "Domains laufen über tlds");
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

test("Schemafehler (Endung, Anzahl, Länge) ergeben isError statt Absturz", async () => {
  const tld = await call("markenfrei_check_name", { name: "foo", tlds: ["constructor"] });
  assert.equal(tld.isError, true);

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
