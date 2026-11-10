import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { checkName, checkNames, clearResultCache, resolveSources, STATIC_SOURCES } from "@/lib/engine/check";
import type { NameReport } from "@/lib/engine/check";
import { CheckNamesOutputSchema, MCP_REGISTER_HINT, REGISTER_LINE_PREFIX, selectSources } from "@/lib/engine/format";
import { resetHostBudgets } from "@/lib/engine/http";
import { NameReportSchema } from "@/lib/engine/report-schema";
import { rankReports, type Verdict } from "@/lib/engine/verdict";
import { parseCliArgs, run, type CliDeps } from "@/cli/run";

beforeEach(() => {
  clearResultCache();
  resetHostBudgets();
});

function sink() {
  const chunks: string[] = [];
  return { write: (s: string) => void chunks.push(s), text: () => chunks.join("") };
}

type Engine = Pick<CliDeps, "checkName" | "checkNames">;

/** Echte Engine; nur das Netz ist ersetzt. */
function realDeps(fetchImpl: typeof fetch, env: Record<string, string | undefined> = {}) {
  const out = sink();
  const err = sink();
  const deps: CliDeps = { checkName, checkNames, stdout: out, stderr: err, env, fetchImpl };
  return { deps, out, err };
}

/** Engine-Attrappe, die Ampeln nach Name vergibt und zählt, wie oft sie gerufen wurde. */
function fakeEngine(verdicts: Record<string, Verdict>): Engine & { calls: number } {
  const state = { calls: 0 };
  const report = (name: string): NameReport => {
    const verdict = verdicts[name] ?? "green";
    return {
      schemaVersion: 2,
      input: name,
      name,
      checkedAt: "2026-01-01T00:00:00.000Z",
      verdict,
      verdictLabel: verdict === "red" ? "Vergeben" : verdict === "yellow" ? "Prüfen" : "Keine Treffer",
      counts: { taken: 0, not_found: 0, similar: 0, invalid: 0, unknown: 0 },
      incomplete: [],
      results: [],
      trademark: { note: "", links: [], dpmaExpertQuery: "", variants: [], classes: [], checklist: [] },
      manualLinks: [],
    } as unknown as NameReport;
  };
  return {
    get calls() {
      return state.calls;
    },
    checkName: async (input) => (state.calls++, report(String(input))),
    checkNames: async (inputs) => {
      state.calls++;
      const reports = (inputs as string[]).map(report);
      return { ranking: rankReports(reports), reports };
    },
  };
}

function fakeDeps(engine: Engine) {
  const out = sink();
  const err = sink();
  const deps: CliDeps = { ...engine, stdout: out, stderr: err, env: {} };
  return { deps, out, err };
}

const notFound = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;

test("parseArgs: check mit einem und mehreren Namen, --json, Kommalisten für --namespaces/--tlds/--sources", () => {
  const one = parseCliArgs(["check", "wachwerk"]);
  assert.deepEqual(one, { kind: "check", names: ["wachwerk"], json: false });

  const many = parseCliArgs([
    "check",
    "wachwerk",
    "nordlicht",
    "--json",
    "--namespaces",
    "domains,packages",
    "--tlds",
    "de, com",
    "--sources=npm,pypi",
  ]);
  assert.deepEqual(many, {
    kind: "check",
    names: ["wachwerk", "nordlicht"],
    json: true,
    namespaces: ["domains", "packages"],
    tlds: ["de", "com"],
    sources: ["npm", "pypi"],
  });

  assert.deepEqual(parseCliArgs(["--help"]), { kind: "help" });
  assert.deepEqual(parseCliArgs(["--version"]), { kind: "version" });
  assert.deepEqual(parseCliArgs(["check", "wachwerk", "--profile", " npm "]), {
    kind: "check",
    names: ["wachwerk"],
    json: false,
    profile: "npm",
  });
});

test("--profile: Auswahl wie bei API und MCP, unbekanntes Profil Exit 64 ohne Netzabfrage", async () => {
  const seen: string[] = [];
  const spy = (async (url: string) => (seen.push(url), new Response(null, { status: 404 }))) as unknown as typeof fetch;
  const { deps, out } = realDeps(spy);
  assert.notEqual(await run(["check", "wachwerk", "--profile", "rust", "--json"], deps), 64);
  const report = NameReportSchema.parse(JSON.parse(out.text()));
  const expected = resolveSources(selectSources({ profile: "rust" }, true)).map((s) => s.id);
  assert.deepEqual(report.results.map((r) => r.sourceId), expected);

  clearResultCache();
  resetHostBudgets();
  const withTlds = realDeps(spy);
  assert.notEqual(await run(["check", "wachwerk", "--profile", "rust", "--tlds", "de", "--json"], withTlds.deps), 64);
  assert.deepEqual(NameReportSchema.parse(JSON.parse(withTlds.out.text())).results.map((r) => r.sourceId), ["rdap:de", ...expected]);

  seen.length = 0;
  const bad = realDeps(spy);
  assert.equal(await run(["check", "wachwerk", "--profile", "gibtsnicht"], bad.deps), 64);
  assert.match(bad.err.text(), /Unbekanntes Profil „gibtsnicht“\. Erlaubt: allgemein, /);
  assert.equal(seen.length, 0);

  const help = fakeDeps(fakeEngine({}));
  assert.equal(await run(["--help"], help.deps), 0);
  assert.match(help.out.text(), /--profile id/);
});

test("Registrierungs-Link nur aus deps.env, mit eigener Schlusszeile ohne MCP-Anweisung", async () => {
  const env = {
    MARKENFREI_CONTACT: "mail@example.org",
    MARKENFREI_REGISTER_URL: "https://example.org/bestellen?domain={domain}",
    MARKENFREI_REGISTER_NAME: "Beispiel-Domains",
  };
  const { deps, out } = realDeps(notFound, env);
  assert.equal(await run(["check", "wachwerk", "--tlds", "de", "--sources", "pypi"], deps), 0);
  const lines = out.text().split("\n");
  assert.ok(lines.includes(`${REGISTER_LINE_PREFIX}: wachwerk.de → https://example.org/bestellen?domain=wachwerk.de`), out.text());
  assert.ok(lines.includes("„Nicht gefunden“ ist keine Zusage, dass die Domain bestellbar ist."), out.text());
  assert.ok(!out.text().includes(MCP_REGISTER_HINT));

  // Ohne deps.env kein Link, auch wenn process.env ihn setzt
  const saved = { url: process.env.MARKENFREI_REGISTER_URL, name: process.env.MARKENFREI_REGISTER_NAME };
  process.env.MARKENFREI_REGISTER_URL = env.MARKENFREI_REGISTER_URL;
  process.env.MARKENFREI_REGISTER_NAME = env.MARKENFREI_REGISTER_NAME;
  try {
    const plain = realDeps(notFound, { MARKENFREI_CONTACT: "mail@example.org" });
    assert.equal(await run(["check", "wachwerk", "--tlds", "de", "--sources", "pypi", "--json"], plain.deps), 0);
    assert.ok(NameReportSchema.parse(JSON.parse(plain.out.text())).results.every((r) => r.register === undefined));
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

test("ohne Unterbefehl oder Namen: Hilfe auf stderr, Exit 64", async () => {
  for (const argv of [[], ["check"], ["prüfe", "wachwerk"], ["check", "x", "--gibtsnicht"], ["check", "x", "--tlds"]]) {
    const engine = fakeEngine({});
    const { deps, out, err } = fakeDeps(engine);
    assert.equal(await run(argv, deps), 64, JSON.stringify(argv));
    assert.equal(out.text(), "", "stdout bleibt leer");
    assert.match(err.text(), /Aufruf: markenfrei check/);
    assert.equal(engine.calls, 0);
  }
});

test("--help und --version: Exit 0, Ausgabe auf stdout", async () => {
  const help = fakeDeps(fakeEngine({}));
  assert.equal(await run(["--help"], help.deps), 0);
  assert.match(help.out.text(), /Aufruf: markenfrei check/);
  assert.match(help.out.text(), /nicht in Schleifen/);
  for (const s of STATIC_SOURCES) assert.ok(help.out.text().includes(s.id), `Hilfe nennt ${s.id}`);

  const ver = fakeDeps(fakeEngine({}));
  assert.equal(await run(["--version"], ver.deps), 0);
  assert.match(ver.out.text(), /^\d+\.\d+\.\d+\n$/);
});

test("unbekannte Quelle oder Endung: Meldung der Engine, Exit 64, keine Netzabfrage", async () => {
  let fetched = 0;
  const countingFetch = (async () => (fetched++, new Response(null, { status: 404 }))) as unknown as typeof fetch;
  for (const [argv, re] of [
    [["check", "wachwerk", "--sources", "gibtsnicht"], /Unbekannte Quelle/],
    [["check", "wachwerk", "--tlds", "gibtsnicht"], /Endung/],
    [["check", "wachwerk", "--namespaces", "gibtsnicht"], /Namensr/],
    [["check", "wachwerk", "nordlicht", "--sources", "gibtsnicht"], /Unbekannte Quelle/],
  ] as const) {
    const { deps, out, err } = realDeps(countingFetch);
    assert.equal(await run([...argv], deps), 64, argv.join(" "));
    assert.match(err.text(), re);
    assert.equal(out.text(), "");
  }
  assert.equal(fetched, 0);
});

test("ungültiger Name und zu viele Namen: Exit 64, keine Netzabfrage", async () => {
  let fetched = 0;
  const countingFetch = (async () => (fetched++, new Response(null, { status: 404 }))) as unknown as typeof fetch;
  const bad = realDeps(countingFetch);
  assert.equal(await run(["check", "wachwerk", "!!"], bad.deps), 64);
  assert.match(bad.err.text(), /Name 2/);

  const many = realDeps(countingFetch);
  const names = Array.from({ length: 11 }, (_, i) => `name${String.fromCharCode(97 + i)}x`);
  assert.equal(await run(["check", ...names], many.deps), 64);
  assert.match(many.err.text(), /Höchstens 10 Namen/);
  assert.equal(fetched, 0);
});

test("Exit-Code: grün 0, gelb 1, rot 2; mehrere Namen nehmen den schlechtesten", async () => {
  const engine = fakeEngine({ gruen: "green", gelb: "yellow", rot: "red" });
  const code = async (...names: string[]) => run(["check", ...names], fakeDeps(engine).deps);
  assert.equal(await code("gruen"), 0);
  assert.equal(await code("gelb"), 1);
  assert.equal(await code("rot"), 2);
  assert.equal(await code("gruen", "gelb"), 1);
  assert.equal(await code("gruen", "gelb", "rot"), 2);
  assert.equal(await code("rot", "gruen"), 2);
  assert.equal(await code("gruen", "gruen2"), 0);
});

test("innerer Fehler der Engine: Exit 70 mit Meldung auf stderr", async () => {
  const { deps, err } = fakeDeps({
    checkName: async () => {
      throw new Error("kaputt");
    },
    checkNames: async () => {
      throw new Error("kaputt");
    },
  });
  assert.equal(await run(["check", "wachwerk"], deps), 70);
  assert.match(err.text(), /Interner Fehler: kaputt/);
});

test("Textausgabe: Bericht ohne MCP-Verweis, mit Markenhinweis", async () => {
  const { deps, out } = realDeps(notFound);
  const code = await run(["check", "wachwerk", "--namespaces", "packages"], deps);
  assert.equal(code, 0);
  assert.match(out.text(), /^wachwerk: GRÜN/);
  assert.match(out.text(), /Marke: nicht geprüft/);
  assert.ok(!out.text().includes("markenfrei_"), "kein MCP-Werkzeugname in der CLI-Ausgabe");

  const many = realDeps(notFound);
  assert.equal(await run(["check", "wachwerk", "nordlicht", "--namespaces", "packages"], many.deps), 0);
  assert.match(many.out.text(), /^Rangliste \(2 Namen/);
  assert.ok(!many.out.text().includes("markenfrei_"));
  assert.match(many.out.text(), /Marke: nicht geprüft/);
});

test("--json gibt einen NameReport aus, der NameReportSchema erfüllt", async () => {
  const { deps, out } = realDeps(notFound);
  const code = await run(["check", "wachwerk", "--namespaces", "packages", "--json"], deps);
  assert.equal(code, 0);
  const parsed = JSON.parse(out.text());
  const res = NameReportSchema.safeParse(parsed);
  assert.ok(res.success, res.success ? "" : JSON.stringify(res.error.issues));
  assert.equal(parsed.name, "wachwerk");
});

test("--json mit mehreren Namen erfüllt CheckNamesOutputSchema", async () => {
  const { deps, out } = realDeps(notFound);
  const code = await run(["check", "wachwerk", "nordlicht", "--namespaces", "packages", "--json"], deps);
  assert.equal(code, 0);
  const parsed = JSON.parse(out.text());
  const res = CheckNamesOutputSchema.safeParse(parsed);
  assert.ok(res.success, res.success ? "" : JSON.stringify(res.error.issues));
  assert.equal(parsed.reports.length, 2);
  assert.equal(parsed.ranking.length, 2);
  assert.ok(!("trademark" in parsed.reports[0]), "Shortlist-Berichte ohne Markenvorbereitung");
});

test("ohne Netz (fetchImpl wirft): alle Quellen unbekannt, gelb, Exit 1, kein Absturz", async () => {
  const offline = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  const { deps, out, err } = realDeps(offline);
  const code = await run(["check", "wachwerk", "--namespaces", "packages"], deps);
  assert.equal(code, 1);
  assert.match(out.text(), /GELB/);
  assert.match(out.text(), /Lücken: .*nicht als frei werten/);
  assert.ok(!/Interner Fehler/.test(err.text()));

  clearResultCache();
  resetHostBudgets();
  const json = realDeps(offline);
  assert.equal(await run(["check", "wachwerk", "--namespaces", "packages", "--json"], json.deps), 1);
  const report = JSON.parse(json.out.text());
  assert.equal(report.verdict, "yellow");
  assert.ok(report.incomplete.length > 0);
});

test("User-Agent enthält MARKENFREI_CONTACT, wenn gesetzt", async () => {
  const seen: string[] = [];
  const spy = (async (_url: string, init?: RequestInit) => {
    seen.push(new Headers(init?.headers).get("user-agent") ?? "");
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;

  const withContact = realDeps(spy, { MARKENFREI_CONTACT: "mail@example.org" });
  await run(["check", "wachwerk", "--namespaces", "packages"], withContact.deps);
  assert.ok(seen.length > 0);
  assert.deepEqual([...new Set(seen)], ["Markenfrei/2.0 (+https://markenfrei.app; mail@example.org)"]);
  assert.ok(!/MARKENFREI_CONTACT/.test(withContact.err.text()), "kein Hinweis, wenn der Kontakt gesetzt ist");

  // Ohne Kontakt: kein Kontakt im Header (auch nicht aus process.env) und ein Hinweis auf stderr.
  seen.length = 0;
  clearResultCache();
  resetHostBudgets();
  const previous = process.env.MARKENFREI_CONTACT;
  process.env.MARKENFREI_CONTACT = "aus-prozess@example.org";
  try {
    const without = realDeps(spy, {});
    await run(["check", "wachwerk", "--namespaces", "packages"], without.deps);
    assert.ok(seen.length > 0);
    assert.deepEqual([...new Set(seen)], ["Markenfrei/2.0 (+https://markenfrei.app)"]);
    assert.match(without.err.text(), /MARKENFREI_CONTACT/);
  } finally {
    if (previous === undefined) delete process.env.MARKENFREI_CONTACT;
    else process.env.MARKENFREI_CONTACT = previous;
  }
});

const cliDir = join(__dirname, "..", "src", "cli");
const cliFiles = () => readdirSync(cliDir).filter((f) => f.endsWith(".ts"));

test("die CLI enthält keine eigene Quellenliste", () => {
  assert.ok(cliFiles().length >= 2);
  for (const f of cliFiles()) {
    const src = readFileSync(join(cliDir, f), "utf8");
    for (const s of STATIC_SOURCES) {
      assert.ok(!src.includes(`"${s.id}"`) && !src.includes(`'${s.id}'`), `${f} enthält die Quelle ${s.id} als Literal`);
    }
  }
});

test("die CLI lädt das MCP-SDK nicht", () => {
  for (const f of cliFiles()) {
    const src = readFileSync(join(cliDir, f), "utf8");
    assert.ok(!/@modelcontextprotocol/.test(src), `${f} importiert das MCP-SDK`);
    assert.ok(!/@\/mcp\//.test(src) && !/\.\.\/mcp\//.test(src), `${f} importiert aus src/mcp`);
  }
});
