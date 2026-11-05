import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  PACKAGE_SOURCES,
  cranSpellings,
  githubBlockedUntilMs,
  mailtoContact,
  pep503,
  resetGithubRateLimit,
} from "@/lib/engine/sources/packages";
import type { CheckContext, HttpClient, HttpRequest, HttpResponse, Source } from "@/lib/engine/types";

type Reply = { status: number; headers?: Record<string, string>; json?: unknown; error?: HttpResponse["error"] };

function fakeHttp(routes: Record<string, Reply> | ((url: string) => Reply)) {
  const calls: { url: string; req: HttpRequest }[] = [];
  const http: HttpClient = {
    async request(url, req = {}) {
      calls.push({ url, req });
      const r = typeof routes === "function" ? routes(url) : routes[url];
      if (!r) throw new Error(`unerwartete URL im Test: ${url}`);
      return { status: r.status, headers: new Headers(r.headers ?? {}), json: r.json, error: r.error };
    },
  };
  return { http, calls };
}

function ctxWith(routes: Record<string, Reply> | ((url: string) => Reply), contact = "") {
  const f = fakeHttp(routes);
  const ctx: CheckContext = { http: f.http, contact };
  return { ctx, calls: f.calls };
}

function src(id: string): Source {
  const s = PACKAGE_SOURCES.find((x) => x.id === id);
  assert.ok(s, `Quelle ${id} fehlt`);
  return s;
}

beforeEach(() => resetGithubRateLimit());

test("Liste enthält alle Quellen mit Beschreibung und Endpunkt", () => {
  assert.deepEqual(
    PACKAGE_SOURCES.map((s) => s.id),
    ["npm", "pypi", "github", "crates", "homebrew", "nuget", "rubygems", "maven", "packagist", "pub", "jsr", "hex", "cran", "openvsx", "huggingface", "hackage", "terraform", "devto"],
  );
  assert.deepEqual(
    PACKAGE_SOURCES.filter((s) => s.defaultEnabled).map((s) => s.id),
    ["npm", "pypi", "github", "crates", "homebrew"],
  );
  for (const s of PACKAGE_SOURCES) {
    assert.equal(s.namespace, "packages");
    assert.ok(s.description.length > 10, s.id);
    assert.match(s.endpoint, /^https:\/\//, s.id);
  }
});

// Einfache Quellen: 200 => taken, 404 => not_found, 429 => unknown
type Simple = {
  id: string;
  name: string;
  api: string;
  human: string;
  target?: string;
  /** Weitere Antworten, die nach einem 404 abgefragt werden (Folgeabfragen) */
  notFoundRoutes?: Record<string, Reply>;
  notFoundEvidence?: string;
};
const simple: Simple[] = [
  { id: "npm", name: "wachwerk", api: "https://registry.npmjs.org/wachwerk", human: "https://www.npmjs.com/package/wachwerk" },
  { id: "pypi", name: "wachwerk", api: "https://pypi.org/pypi/wachwerk/json", human: "https://pypi.org/project/wachwerk/" },
  { id: "github", name: "wachwerk", api: "https://api.github.com/users/wachwerk", human: "https://github.com/wachwerk" },
  { id: "crates", name: "wachwerk", api: "https://crates.io/api/v1/crates/wachwerk", human: "https://crates.io/crates/wachwerk" },
  { id: "nuget", name: "wachwerk", api: "https://api.nuget.org/v3-flatcontainer/wachwerk/index.json", human: "https://www.nuget.org/packages/wachwerk" },
  {
    id: "rubygems",
    name: "wachwerk",
    api: "https://rubygems.org/api/v1/gems/wachwerk.json",
    human: "https://rubygems.org/gems/wachwerk",
    notFoundRoutes: { "https://rubygems.org/api/v1/search.json?query=wachwerk": { status: 200, json: [] } },
    notFoundEvidence: "HTTP 404, Suche HTTP 200",
  },
  { id: "pub", name: "wachwerk", api: "https://pub.dev/api/packages/wachwerk/score", human: "https://pub.dev/packages/wachwerk" },
  { id: "jsr", name: "wachwerk", api: "https://api.jsr.io/scopes/wachwerk", human: "https://jsr.io/@wachwerk", target: "@wachwerk" },
  { id: "hex", name: "wachwerk", api: "https://hex.pm/api/packages/wachwerk", human: "https://hex.pm/packages/wachwerk" },
  {
    id: "cran",
    name: "wachwerk",
    api: "https://crandb.r-pkg.org/wachwerk",
    human: "https://cran.r-project.org/package=wachwerk",
    notFoundRoutes: {
      "https://crandb.r-pkg.org/Wachwerk": { status: 404 },
      "https://crandb.r-pkg.org/WACHWERK": { status: 404 },
    },
    notFoundEvidence: "wachwerk HTTP 404, Wachwerk HTTP 404, WACHWERK HTTP 404",
  },
  { id: "openvsx", name: "wachwerk", api: "https://open-vsx.org/api/wachwerk", human: "https://open-vsx.org/namespace/wachwerk" },
];

for (const c of simple) {
  test(`${c.id}: 200 => taken, gebaute URL, Body wird nicht gelesen`, async () => {
    const { ctx, calls } = ctxWith({ [c.api]: { status: 200 } });
    const r = await src(c.id).check(c.name, ctx);
    assert.equal(r.status, "taken");
    assert.equal(r.sourceId, c.id);
    assert.equal(r.namespace, "packages");
    assert.equal(r.target, c.target ?? c.name);
    assert.equal(r.url, c.human);
    assert.equal(r.evidence, "HTTP 200");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, c.api);
    assert.equal(calls[0].req.read ?? "none", "none");
  });

  test(`${c.id}: 404 => not_found mit Hinweis`, async () => {
    const { ctx } = ctxWith({ [c.api]: { status: 404 }, ...c.notFoundRoutes });
    const r = await src(c.id).check(c.name, ctx);
    assert.equal(r.status, "not_found");
    assert.ok(r.note && r.note.length > 0);
    assert.doesNotMatch(r.note ?? "", /registrierbar|verfügbar|frei/i);
    assert.equal(r.evidence, c.notFoundEvidence ?? "HTTP 404");
  });

  test(`${c.id}: 429, 503 und Timeout => unknown`, async () => {
    for (const reply of [{ status: 429 }, { status: 503 }, { status: 0, error: "timeout" as const }]) {
      resetGithubRateLimit();
      const { ctx } = ctxWith({ [c.api]: reply });
      const r = await src(c.id).check(c.name, ctx);
      assert.equal(r.status, "unknown", `${c.id} ${JSON.stringify(reply)}`);
      assert.ok(r.note);
      assert.ok(r.evidence);
    }
  });
}

test("check wirft nie, auch wenn der Client wirft", async () => {
  const ctx: CheckContext = {
    contact: "mailto:a@b.de",
    http: {
      request: async () => {
        throw new Error("kaputt");
      },
    },
  };
  for (const s of PACKAGE_SOURCES) {
    const r = await s.check("wachwerk", ctx);
    assert.equal(r.status, "unknown", s.id);
  }
});

test("npm: Accept-Header für das kurze Format", async () => {
  const { ctx, calls } = ctxWith({ "https://registry.npmjs.org/wachwerk": { status: 404 } });
  const r = await src("npm").check("wachwerk", ctx);
  assert.equal(calls[0].req.headers?.Accept, "application/vnd.npm.install-v1+json");
  assert.match(r.note ?? "", /npm kann ähnliche Namen trotzdem ablehnen/);
});

test("pypi: PEP-503-Normalisierung und Syntax", async () => {
  assert.equal(pep503("Foo__Bar.baz"), "foo-bar-baz");
  const { ctx, calls } = ctxWith({ "https://pypi.org/pypi/foo-bar/json": { status: 200 } });
  const r = await src("pypi").check("foo--bar", ctx);
  assert.equal(calls[0].url, "https://pypi.org/pypi/foo-bar/json");
  assert.equal(r.target, "foo-bar");
  assert.equal(r.status, "taken");

  const inv = ctxWith({});
  const bad = await src("pypi").check("-foo", inv.ctx);
  assert.equal(bad.status, "invalid");
  assert.equal(inv.calls.length, 0);
});

test("github: Syntaxregeln => invalid ohne Abfrage", async () => {
  for (const name of ["-abc", "abc-", "ab--cd", "a".repeat(40)]) {
    const { ctx, calls } = ctxWith({});
    const r = await src("github").check(name, ctx);
    assert.equal(r.status, "invalid", name);
    assert.equal(calls.length, 0);
  }
});

test("github: Token aus GITHUB_TOKEN als Bearer", async () => {
  const old = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "t0k";
  try {
    const { ctx, calls } = ctxWith({ "https://api.github.com/users/wachwerk": { status: 200 } });
    await src("github").check("wachwerk", ctx);
    assert.equal(calls[0].req.headers?.Authorization, "Bearer t0k");
  } finally {
    if (old === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = old;
  }
});

test("github: ohne Token kein Authorization-Header", async () => {
  const old = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    const { ctx, calls } = ctxWith({ "https://api.github.com/users/wachwerk": { status: 404 } });
    await src("github").check("wachwerk", ctx);
    assert.equal(calls[0].req.headers?.Authorization, undefined);
  } finally {
    if (old !== undefined) process.env.GITHUB_TOKEN = old;
  }
});

test("github: 403 mit x-ratelimit-remaining 0 sperrt bis reset", async () => {
  const reset = Math.floor(Date.now() / 1000) + 3600;
  const first = ctxWith({
    "https://api.github.com/users/wachwerk": {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
    },
  });
  const r1 = await src("github").check("wachwerk", first.ctx);
  assert.equal(r1.status, "unknown");
  assert.match(r1.note ?? "", /Rate-Limit/);
  assert.match(r1.evidence ?? "", /^Rate-Limit, gesperrt bis /, "kein HTTP-Statuscode im Beleg: die Sperre dauert bis zu eine Stunde, eine kurze Wiederholung bringt nichts");
  assert.ok(!/HTTP (403|429)/.test(r1.evidence ?? ""));

  const second = ctxWith({});
  const r2 = await src("github").check("anderername", second.ctx);
  assert.equal(r2.status, "unknown");
  assert.equal(second.calls.length, 0, "keine Anfrage während der Sperre");
  assert.match(r2.evidence ?? "", new RegExp(new Date(reset * 1000).toISOString()));

  resetGithubRateLimit();
  const third = ctxWith({ "https://api.github.com/users/wachwerk": { status: 200 } });
  assert.equal((await src("github").check("wachwerk", third.ctx)).status, "taken");
});

test("github: 403 ohne Rate-Limit-Header sperrt nicht", async () => {
  const first = ctxWith({ "https://api.github.com/users/wachwerk": { status: 403 } });
  assert.equal((await src("github").check("wachwerk", first.ctx)).status, "unknown");
  const second = ctxWith({ "https://api.github.com/users/wachwerk": { status: 404 } });
  assert.equal((await src("github").check("wachwerk", second.ctx)).status, "not_found");
  assert.equal(second.calls.length, 1);
});

test("crates: muss mit Buchstabe beginnen", async () => {
  const { ctx, calls } = ctxWith({});
  assert.equal((await src("crates").check("1abc", ctx)).status, "invalid");
  assert.equal(calls.length, 0);
});

const F = "https://formulae.brew.sh/api/formula/wachwerk.json";
const C = "https://formulae.brew.sh/api/cask/wachwerk.json";

test("homebrew: Formula 200 => taken mit Formula-Link", async () => {
  const { ctx, calls } = ctxWith({ [F]: { status: 200 }, [C]: { status: 404 } });
  const r = await src("homebrew").check("wachwerk", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://formulae.brew.sh/formula/wachwerk");
  assert.deepEqual(calls.map((c) => c.url).sort(), [C, F]);
});

test("homebrew: nur Cask 200 => taken mit Cask-Link", async () => {
  const { ctx } = ctxWith({ [F]: { status: 404 }, [C]: { status: 200 } });
  const r = await src("homebrew").check("wachwerk", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://formulae.brew.sh/cask/wachwerk");
  assert.match(r.note ?? "", /Cask/);
});

test("homebrew: Cask 200 gewinnt auch, wenn Formula ausfällt", async () => {
  const { ctx } = ctxWith({ [F]: { status: 0, error: "timeout" }, [C]: { status: 200 } });
  assert.equal((await src("homebrew").check("wachwerk", ctx)).status, "taken");
});

test("homebrew: beide 404 => not_found, Link auf Suchseite, Aliase im Hinweis", async () => {
  const { ctx } = ctxWith({ [F]: { status: 404 }, [C]: { status: 404 } });
  const r = await src("homebrew").check("wachwerk", ctx);
  assert.equal(r.status, "not_found");
  assert.equal(r.evidence, "Formula HTTP 404, Cask HTTP 404");
  assert.equal(r.url, "https://formulae.brew.sh/");
  assert.match(r.note ?? "", /Aliase und umbenannte Formulae nicht geprüft/);
});

test("homebrew: 404 und 503 => unknown", async () => {
  const { ctx } = ctxWith({ [F]: { status: 404 }, [C]: { status: 503 } });
  const r = await src("homebrew").check("wachwerk", ctx);
  assert.equal(r.status, "unknown");
  assert.equal(r.evidence, "Formula HTTP 404, Cask HTTP 503");
});

test("nuget, rubygems, openvsx, jsr: Syntaxregeln", async () => {
  const cases: [string, string][] = [
    ["nuget", "-abc"],
    ["nuget", "ab--cd"],
    ["rubygems", "123"],
    ["openvsx", "-abc"],
    ["jsr", "a".repeat(21)],
    ["jsr", "-abc"],
  ];
  for (const [id, name] of cases) {
    const { ctx, calls } = ctxWith({});
    const r = await src(id).check(name, ctx);
    assert.equal(r.status, "invalid", `${id} ${name}`);
    assert.equal(calls.length, 0);
  }
});

test("pub, hex, cran: Bindestrich unzulässig, Variante im Hinweis", async () => {
  const expectations: [string, string][] = [
    ["pub", "foo_bar"],
    ["hex", "foo_bar"],
    ["cran", "foo.bar"],
  ];
  for (const [id, variant] of expectations) {
    const { ctx, calls } = ctxWith({});
    const r = await src(id).check("foo-bar", ctx);
    assert.equal(r.status, "invalid", id);
    assert.ok(r.note?.includes(variant), `${id}: ${r.note}`);
    assert.equal(calls.length, 0);
  }
  const d = ctxWith({});
  assert.equal((await src("pub").check("class", d.ctx)).status, "invalid");
  assert.equal((await src("pub").check("1abc", d.ctx)).status, "invalid");
  assert.equal((await src("hex").check("1abc", d.ctx)).status, "invalid");
  assert.equal((await src("cran").check("1abc", d.ctx)).status, "invalid");
  assert.equal(d.calls.length, 0);
});

test("jsr: 400 von der API => unknown", async () => {
  const { ctx } = ctxWith({ "https://api.jsr.io/scopes/wachwerk": { status: 400 } });
  assert.equal((await src("jsr").check("wachwerk", ctx)).status, "unknown");
});

const M = 'https://search.maven.org/solrsearch/select?q=a%3A%22wachwerk%22&rows=1&wt=json';

test("maven: numFound > 0 => similar mit Hinweis", async () => {
  const { ctx, calls } = ctxWith({
    [M]: { status: 200, json: { response: { numFound: 30, docs: [{ id: "com.example:wachwerk" }] } } },
  });
  const r = await src("maven").check("wachwerk", ctx);
  assert.equal(r.status, "similar");
  assert.match(r.note ?? "", /nicht global eindeutig/);
  assert.equal(r.evidence, "HTTP 200, numFound 30, z. B. com.example:wachwerk");
  assert.equal(r.url, "https://central.sonatype.com/search?q=wachwerk");
  assert.equal(calls[0].url, M);
  assert.equal(calls[0].req.read, "json");
  assert.ok((calls[0].req.maxBytes ?? Infinity) <= 64 * 1024);
});

test("maven: numFound 0 => not_found", async () => {
  const { ctx } = ctxWith({ [M]: { status: 200, json: { response: { numFound: 0, docs: [] } } } });
  assert.equal((await src("maven").check("wachwerk", ctx)).status, "not_found");
});

test("maven: unerwartetes Format, 429, parse => unknown", async () => {
  for (const reply of [
    { status: 200, json: { foo: 1 } },
    { status: 200, json: null },
    { status: 429 },
    { status: 200, error: "parse" as const },
  ]) {
    const { ctx } = ctxWith({ [M]: reply });
    assert.equal((await src("maven").check("wachwerk", ctx)).status, "unknown", JSON.stringify(reply));
  }
});

const P = "https://packagist.org/packages/list.json?vendor=wachwerk";

test("packagist: ohne Kontakt deaktiviert, keine Anfrage", async () => {
  const { ctx, calls } = ctxWith({});
  const r = await src("packagist").check("wachwerk", ctx);
  assert.equal(r.status, "unknown");
  assert.equal(r.note, "deaktiviert: Kontakt fehlt");
  assert.equal(calls.length, 0);
});

test("packagist: Kontakt ohne E-Mail => deaktiviert", async () => {
  const { ctx, calls } = ctxWith({}, "https://example.org");
  const r = await src("packagist").check("wachwerk", ctx);
  assert.equal(r.status, "unknown");
  assert.match(r.note ?? "", /^deaktiviert/);
  assert.equal(calls.length, 0);
});

test("packagist: mit Kontakt mailto im User-Agent, nicht-leere Liste => taken", async () => {
  const { ctx, calls } = ctxWith(
    { [P]: { status: 200, json: { packageNames: ["wachwerk/a", "wachwerk/b"] } } },
    "ops@example.org",
  );
  const r = await src("packagist").check("wachwerk", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://packagist.org/packages/wachwerk/");
  assert.equal(calls[0].url, P);
  assert.match(calls[0].req.headers?.["User-Agent"] ?? "", /mailto:ops@example\.org/);
  assert.match(r.evidence ?? "", /2 Pakete, z\. B\. wachwerk\/a/);
});

test("packagist: leere Liste => not_found, falsches Format => unknown", async () => {
  const a = ctxWith({ [P]: { status: 200, json: { packageNames: [] } } }, "mailto:ops@example.org");
  assert.equal((await src("packagist").check("wachwerk", a.ctx)).status, "not_found");
  const b = ctxWith({ [P]: { status: 200, json: { other: 1 } } }, "mailto:ops@example.org");
  assert.equal((await src("packagist").check("wachwerk", b.ctx)).status, "unknown");
  const c = ctxWith({ [P]: { status: 429 } }, "mailto:ops@example.org");
  assert.equal((await src("packagist").check("wachwerk", c.ctx)).status, "unknown");
  const d = ctxWith({}, "mailto:ops@example.org");
  assert.equal((await src("packagist").check("-ab", d.ctx)).status, "invalid");
  assert.equal(d.calls.length, 0);
});

test("mailtoContact", () => {
  assert.equal(mailtoContact(""), null);
  assert.equal(mailtoContact("ops@example.org"), "mailto:ops@example.org");
  assert.equal(mailtoContact("mailto:ops@example.org"), "mailto:ops@example.org");
  assert.equal(mailtoContact("https://example.org"), null);
});

// --- Befunde aus dem Review -------------------------------------------------

test("github: reset in der Vergangenheit => Ausweichsperre von 60 s, keine Uhrzeit in der Vergangenheit", async () => {
  const past = Math.floor(Date.now() / 1000) - 600;
  const before = Date.now();
  const { ctx } = ctxWith({
    "https://api.github.com/users/wachwerk": {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(past) },
    },
  });
  const r = await src("github").check("wachwerk", ctx);
  assert.equal(r.status, "unknown");
  const until = githubBlockedUntilMs();
  assert.ok(until >= before + 60_000, `Sperre endet zu früh: ${new Date(until).toISOString()}`);
  assert.ok(until <= Date.now() + 61_000);

  const second = ctxWith({});
  assert.equal((await src("github").check("wachwerk", second.ctx)).status, "unknown");
  assert.equal(second.calls.length, 0, "Sperre greift wirklich");
});

test("pub: Built-in-Identifier sind gültige Paketnamen, echte reservierte Wörter nicht", async () => {
  for (const name of ["get", "async", "await", "show", "type", "on", "late", "sealed", "dynamic", "import"]) {
    const api = `https://pub.dev/api/packages/${name}/score`;
    const { ctx, calls } = ctxWith({ [api]: { status: 200 } });
    const r = await src("pub").check(name, ctx);
    assert.equal(r.status, "taken", name);
    assert.equal(calls.length, 1, name);
  }
  for (const name of ["class", "while", "null", "true", "switch"]) {
    const { ctx, calls } = ctxWith({});
    const r = await src("pub").check(name, ctx);
    assert.equal(r.status, "invalid", name);
    assert.equal(r.note, "reserviertes Dart-Wort");
    assert.equal(calls.length, 0);
  }
});

test("cranSpellings: klein, Groß-Anfang, ganz groß ohne Doppelte", () => {
  assert.deepEqual(cranSpellings("matrix"), ["matrix", "Matrix", "MATRIX"]);
  assert.deepEqual(cranSpellings("r6"), ["r6", "R6"]);
});

test("cran: matrix 404, Matrix 200 => taken mit Link auf Matrix", async () => {
  const { ctx, calls } = ctxWith({
    "https://crandb.r-pkg.org/matrix": { status: 404 },
    "https://crandb.r-pkg.org/Matrix": { status: 200 },
    "https://crandb.r-pkg.org/MATRIX": { status: 404 },
  });
  const r = await src("cran").check("matrix", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://cran.r-project.org/package=Matrix");
  assert.match(r.note ?? "", /„Matrix“/);
  assert.equal(r.evidence, "matrix HTTP 404, Matrix HTTP 200, MATRIX HTTP 404");
  assert.equal(calls[0].url, "https://crandb.r-pkg.org/matrix");
  assert.ok(calls.every((c) => (c.req.read ?? "none") === "none"));
});

test("cran: mass 404, MASS 200 => taken", async () => {
  const { ctx } = ctxWith({
    "https://crandb.r-pkg.org/mass": { status: 404 },
    "https://crandb.r-pkg.org/Mass": { status: 404 },
    "https://crandb.r-pkg.org/MASS": { status: 200 },
  });
  const r = await src("cran").check("mass", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://cran.r-project.org/package=MASS");
});

test("cran: exakte Schreibweise 200 => taken ohne Folgeabfragen", async () => {
  const { ctx, calls } = ctxWith({ "https://crandb.r-pkg.org/ggplot2": { status: 200 } });
  const r = await src("cran").check("ggplot2", ctx);
  assert.equal(r.status, "taken");
  assert.equal(calls.length, 1);
});

test("cran: alles 404 => not_found nennt geprüfte Schreibweisen und die CRAN-Regel", async () => {
  const { ctx } = ctxWith((url) => (url.startsWith("https://crandb.r-pkg.org/") ? { status: 404 } : { status: 500 }));
  const r = await src("cran").check("zzqxkvjwabc", ctx);
  assert.equal(r.status, "not_found");
  assert.match(r.note ?? "", /nur Schreibweisen zzqxkvjwabc\/Zzqxkvjwabc\/ZZQXKVJWABC geprüft/);
  assert.match(r.note ?? "", /CRAN lehnt Namen ab, die sich nur in Groß- und Kleinschreibung unterscheiden/);
  assert.doesNotMatch(r.note ?? "", /unterscheidet Groß- und Kleinschreibung/);
});

test("cran: 404 und Variante 503 => unknown statt not_found", async () => {
  const { ctx } = ctxWith({
    "https://crandb.r-pkg.org/matrix": { status: 404 },
    "https://crandb.r-pkg.org/Matrix": { status: 503 },
    "https://crandb.r-pkg.org/MATRIX": { status: 404 },
  });
  const r = await src("cran").check("matrix", ctx);
  assert.equal(r.status, "unknown");
  assert.equal(r.evidence, "matrix HTTP 404, Matrix HTTP 503, MATRIX HTTP 404");
});

const RG = "https://rubygems.org/api/v1/gems/redcloth.json";
const RGS = "https://rubygems.org/api/v1/search.json?query=redcloth";

test("rubygems: redcloth 404, Suche findet RedCloth => taken", async () => {
  const { ctx, calls } = ctxWith({
    [RG]: { status: 404 },
    [RGS]: { status: 200, json: [{ name: "RedCloth" }, { name: "redcloth-extras" }] },
  });
  const r = await src("rubygems").check("redcloth", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://rubygems.org/gems/RedCloth");
  assert.match(r.note ?? "", /„RedCloth“/);
  assert.deepEqual(calls.map((c) => c.url), [RG, RGS]);
  assert.equal(calls[1].req.read, "json");
  assert.ok((calls[1].req.maxBytes ?? Infinity) <= 256 * 1024);
});

test("rubygems: Suche nur mit Präfix-Treffern => not_found", async () => {
  const { ctx } = ctxWith({ [RG]: { status: 404 }, [RGS]: { status: 200, json: [{ name: "redcloth-extras" }] } });
  const r = await src("rubygems").check("redcloth", ctx);
  assert.equal(r.status, "not_found");
  assert.match(r.note ?? "", /auch nicht in anderer Schreibweise/);
});

test("rubygems: Suche nicht verwertbar => unknown, nie not_found", async () => {
  for (const reply of [
    { status: 429 },
    { status: 200, error: "too_large" as const },
    { status: 200, json: { error: "x" } },
    { status: 0, error: "timeout" as const },
  ]) {
    const { ctx } = ctxWith({ [RG]: { status: 404 }, [RGS]: reply });
    const r = await src("rubygems").check("redcloth", ctx);
    assert.equal(r.status, "unknown", JSON.stringify(reply));
    assert.match(r.note ?? "", /Schreibweisen konnten nicht geprüft werden/);
    assert.match(r.evidence ?? "", /^HTTP 404, Suche /);
  }
});

test("rubygems: exakter Treffer 200 => taken ohne Suche", async () => {
  const { ctx, calls } = ctxWith({ "https://rubygems.org/api/v1/gems/rails.json": { status: 200 } });
  assert.equal((await src("rubygems").check("rails", ctx)).status, "taken");
  assert.equal(calls.length, 1);
});
