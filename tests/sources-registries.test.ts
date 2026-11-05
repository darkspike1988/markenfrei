import { test } from "node:test";
import assert from "node:assert/strict";
import { STATIC_SOURCES, resolveSources } from "@/lib/engine/check";
import { HOST_BUDGETS, createHttpClient, resetHostBudgets, takeBudget } from "@/lib/engine/http";
import { REGISTRY_SOURCES } from "@/lib/engine/sources/registries";
import type { CheckContext, HttpClient, HttpRequest, HttpResponse, Source } from "@/lib/engine/types";

type Reply = { status: number; json?: unknown; error?: HttpResponse["error"] };

function ctxWith(routes: Record<string, Reply> | ((url: string) => Reply)) {
  const calls: { url: string; req: HttpRequest }[] = [];
  const http: HttpClient = {
    async request(url, req = {}) {
      calls.push({ url, req });
      const r = typeof routes === "function" ? routes(url) : routes[url];
      if (!r) throw new Error(`unerwartete URL im Test: ${url}`);
      return { status: r.status, headers: new Headers(), json: r.json, error: r.error };
    },
  };
  const ctx: CheckContext = { http, contact: "" };
  return { ctx, calls };
}

const src = (id: string): Source => {
  const s = REGISTRY_SOURCES.find((x) => x.id === id);
  assert.ok(s, `Quelle ${id} fehlt`);
  return s;
};

const IDS = ["aur", "repology", "docker", "conda", "clojars"];

/** Ausfälle, die nie "frei" bedeuten dürfen */
const FAILURES: Reply[] = [
  { status: 429 },
  { status: 503 },
  { status: 500 },
  { status: 0, error: "timeout" },
  { status: 0, error: "network" },
  { status: 0, error: "budget" },
];

test("alle Quellen sind optional, im Namensraum packages und in STATIC_SOURCES", () => {
  assert.deepEqual(REGISTRY_SOURCES.map((s) => s.id), IDS);
  for (const s of REGISTRY_SOURCES) {
    assert.equal(s.defaultEnabled, false, s.id);
    assert.equal(s.namespace, "packages", s.id);
    assert.ok(s.description.length > 20, s.id);
    assert.match(s.endpoint, /^https:\/\//, s.id);
    assert.ok(STATIC_SOURCES.includes(s), `${s.id} fehlt in STATIC_SOURCES`);
  }
  assert.equal(new Set(STATIC_SOURCES.map((s) => s.id)).size, STATIC_SOURCES.length, "IDs sind eindeutig");
  // sources akzeptiert die neuen IDs (Web-API und MCP lesen dieselbe Liste)
  assert.deepEqual(resolveSources({ sources: IDS, namespaces: ["packages"] }).map((s) => s.id), IDS);
});

test("check wirft nie, auch wenn der Client wirft", async () => {
  const ctx: CheckContext = {
    contact: "",
    http: {
      request: async () => {
        throw new Error("kaputt");
      },
    },
  };
  for (const s of REGISTRY_SOURCES) {
    const r = await s.check("wachwerk", ctx);
    assert.equal(r.status, "unknown", s.id);
    assert.ok(r.note && r.evidence, s.id);
  }
});

test("Namen außerhalb von a-z, 0-9 und Bindestrich => invalid ohne Abfrage", async () => {
  for (const s of REGISTRY_SOURCES) {
    const { ctx, calls } = ctxWith(() => {
      throw new Error("keine Abfrage erwartet");
    });
    const r = await s.check("Wach_Werk", ctx);
    assert.equal(r.status, "invalid", s.id);
    assert.equal(calls.length, 0, s.id);
  }
});

// ---------------------------------------------------------------------------
// AUR

const AUR = (n: string) => `https://aur.archlinux.org/rpc/v5/info?arg[]=${n}`;

test("AUR: resultcount > 0 => taken, 0 => not_found", async () => {
  const { ctx, calls } = ctxWith({ [AUR("yay")]: { status: 200, json: { type: "multiinfo", resultcount: 1, results: [{ Name: "yay" }] } } });
  const taken = await src("aur").check("yay", ctx);
  assert.equal(taken.status, "taken");
  assert.equal(taken.url, "https://aur.archlinux.org/packages/yay");
  assert.equal(taken.evidence, "HTTP 200, resultcount 1");
  assert.equal(calls[0].url, AUR("yay"));
  assert.equal(calls[0].req.method, "GET");

  const free = await src("aur").check("wachwerk", ctxWith({ [AUR("wachwerk")]: { status: 200, json: { type: "multiinfo", resultcount: 0, results: [] } } }).ctx);
  assert.equal(free.status, "not_found");
  assert.equal(free.evidence, "HTTP 200, resultcount 0");
  assert.doesNotMatch(free.note ?? "", /registrierbar|verfügbar|\bfrei\b/i);
});

test("AUR: Fehlerantwort mit resultcount 0 (Rate-Limit) und alles Unerwartete ist nie frei", async () => {
  const limited = { status: 200, json: { type: "error", error: "Rate limit reached", resultcount: 0, results: [] } };
  assert.equal((await src("aur").check("wachwerk", ctxWith({ [AUR("wachwerk")]: limited }).ctx)).status, "unknown");
  for (const reply of [
    ...FAILURES,
    { status: 200, json: { type: "multiinfo", resultcount: "0" } },
    { status: 200, json: { resultcount: 0 } },
    { status: 200, json: [] },
    { status: 200, json: null },
    { status: 200, error: "parse" as const },
    { status: 404 },
  ]) {
    assert.equal((await src("aur").check("wachwerk", ctxWith({ [AUR("wachwerk")]: reply }).ctx)).status, "unknown", JSON.stringify(reply));
  }
});

// ---------------------------------------------------------------------------
// Repology

const REPO = (n: string) => `https://repology.org/api/v1/project/${n}`;
const REPOLOGY_UA = "Markenfrei/2.0 (+https://github.com/darkspike1988/markenfrei)";

test("Repology: nicht leere Liste => taken mit Anzahl und drei Beispielen, eigener User-Agent, kleine Leseobergrenze", async () => {
  const list = [
    { repo: "debian_13", srcname: "nginx" },
    { repo: "debian_13", srcname: "nginx-light" },
    { repo: "arch", srcname: "nginx" },
    { repo: "nix_unstable", srcname: "nginx" },
    { repo: "homebrew", srcname: "nginx" },
  ];
  const { ctx, calls } = ctxWith({ [REPO("nginx")]: { status: 200, json: list } });
  const r = await src("repology").check("nginx", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://repology.org/project/nginx/versions");
  assert.match(r.note ?? "", /4 Paketquellen, z\. B\. debian_13, arch, nix_unstable/);
  assert.match(r.note ?? "", /Projektname, nicht jeder Paketname/);
  assert.equal(r.evidence, "HTTP 200, 4 Paketquellen");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].req.read, "json");
  assert.equal(calls[0].req.headers?.["User-Agent"], REPOLOGY_UA);
  assert.ok((calls[0].req.maxBytes ?? Infinity) <= 64 * 1024, "keine großen Antworten laden");
});

test("Repology: eine Paketquelle im Singular, Einträge ohne repo zählen als Einträge", async () => {
  const one = await src("repology").check("wachwerk", ctxWith({ [REPO("wachwerk")]: { status: 200, json: [{ repo: "arch" }, { repo: "arch" }] } }).ctx);
  assert.equal(one.status, "taken");
  assert.match(one.note ?? "", /1 Paketquelle, z\. B\. arch/);
  const odd = await src("repology").check("wachwerk", ctxWith({ [REPO("wachwerk")]: { status: 200, json: [{}, 1] } }).ctx);
  assert.equal(odd.status, "taken");
  assert.equal(odd.evidence, "HTTP 200, 2 Einträge");
});

test("Repology: leere Liste => not_found, große Antwort (zu groß zum Lesen) => taken", async () => {
  const free = await src("repology").check("wachwerk", ctxWith({ [REPO("wachwerk")]: { status: 200, json: [] } }).ctx);
  assert.equal(free.status, "not_found");
  assert.match(free.note ?? "", /Projektname, nicht jeder Paketname/);
  assert.equal(free.evidence, "HTTP 200, Liste leer");

  const big = await src("repology").check("firefox", ctxWith({ [REPO("firefox")]: { status: 200, error: "too_large" } }).ctx);
  assert.equal(big.status, "taken");
  assert.match(big.evidence ?? "", /Antwort > 64 KB/);
});

test("Repology: Ausfälle und fremde Antwortformen sind unknown, auch 404 und zu große Fehlerantworten", async () => {
  for (const reply of [
    ...FAILURES,
    { status: 200, json: { error: "x" } },
    { status: 200, json: null },
    { status: 200, error: "parse" as const },
    { status: 404 },
    { status: 403 },
    { status: 503, error: "too_large" as const },
  ]) {
    const r = await src("repology").check("wachwerk", ctxWith({ [REPO("wachwerk")]: reply }).ctx);
    assert.equal(r.status, "unknown", JSON.stringify(reply));
    assert.ok(r.note && r.evidence);
  }
});

test("Repology: der eigene User-Agent kommt über den echten Client an, andere Hosts behalten den Standard", async () => {
  const seen: { url: string; ua: string | null }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    seen.push({ url, ua: new Headers(init?.headers).get("User-Agent") });
    return new Response("[]", { status: 200 });
  }) as unknown as typeof fetch;
  resetHostBudgets();
  const http = createHttpClient({ deadlineAt: Date.now() + 10_000, userAgent: "Markenfrei/2.0 (+https://markenfrei.app)", fetchImpl });
  assert.equal((await src("repology").check("wachwerk", { http, contact: "" })).status, "not_found");
  await src("clojars").check("wachwerk", { http, contact: "" });
  assert.equal(seen[0].ua, REPOLOGY_UA);
  assert.equal(seen[1].ua, "Markenfrei/2.0 (+https://markenfrei.app)");
});

// ---------------------------------------------------------------------------
// ecosyste.ms: Register ohne Groß-/Kleinschreibung (eine Abfrage)

const ECO = (registry: string, n: string) => `https://packages.ecosyste.ms/api/v1/registries/${registry}/packages/${n}`;

type Simple = { id: string; registry: string; name: string; human: string; note: RegExp };
const simple: Simple[] = [
  { id: "docker", registry: "hub.docker.com", name: "nginx", human: "https://hub.docker.com/_/nginx", note: /offizielle/i },
  { id: "conda", registry: "conda-forge.org", name: "numpy", human: "https://anaconda.org/conda-forge/numpy", note: /conda-forge/ },
  { id: "clojars", registry: "clojars.org", name: "ring", human: "https://clojars.org/ring", note: /Paket/ },
];

for (const c of simple) {
  test(`${c.id}: 200 => taken, eine Abfrage ohne Körper`, async () => {
    const { ctx, calls } = ctxWith({ [ECO(c.registry, c.name)]: { status: 200 } });
    const r = await src(c.id).check(c.name, ctx);
    assert.equal(r.status, "taken");
    assert.equal(r.sourceId, c.id);
    assert.equal(r.namespace, "packages");
    assert.equal(r.url, c.human);
    assert.equal(r.evidence, "HTTP 200");
    assert.match(r.note ?? "", c.note);
    assert.match(r.note ?? "", /ecosyste\.ms-Index/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, ECO(c.registry, c.name));
    assert.equal(calls[0].req.method, "GET");
    assert.equal(calls[0].req.read ?? "none", "none");
  });

  test(`${c.id}: 404 => not_found, Hinweis nennt den Index und verspricht nichts`, async () => {
    const { ctx, calls } = ctxWith({ [ECO(c.registry, "wachwerk")]: { status: 404 } });
    const r = await src(c.id).check("wachwerk", ctx);
    assert.equal(r.status, "not_found");
    assert.match(r.note ?? "", /Index von ecosyste\.ms, nicht live aus dem Register/);
    assert.match(r.note ?? "", /sehr neue Pakete können fehlen/);
    assert.doesNotMatch(r.note ?? "", /registrierbar|verfügbar|\bfrei\b/i);
    assert.equal(r.evidence, "HTTP 404");
    assert.equal(calls.length, 1, "keine weiteren Schreibweisen");
  });

  test(`${c.id}: 429, 5xx, Zeitüberschreitung, Netzfehler, Budget und fremde Status => unknown`, async () => {
    for (const reply of [...FAILURES, { status: 403 }, { status: 400 }]) {
      const r = await src(c.id).check("wachwerk", ctxWith({ [ECO(c.registry, "wachwerk")]: reply }).ctx);
      assert.equal(r.status, "unknown", `${c.id} ${JSON.stringify(reply)}`);
      assert.ok(r.note && r.evidence);
    }
  });
}

// ---------------------------------------------------------------------------
// Abfragebudgets

test("Abfragebudgets: dokumentierte Grenzen und kein erfundenes Budget für Hosts ohne Angabe", () => {
  const repology = HOST_BUDGETS["repology.org"];
  assert.ok(repology.max / (repology.windowMs / 1000) <= 1, "Repology: höchstens 1 pro Sekunde");
  const eco = HOST_BUDGETS["packages.ecosyste.ms"];
  assert.ok(eco.max <= 5000 && eco.windowMs === 3_600_000, "ecosyste.ms: unter 5000 pro Stunde");
  const aur = HOST_BUDGETS["aur.archlinux.org"];
  assert.ok(aur.max <= 4000 && aur.windowMs === 86_400_000, "AUR: höchstens 4000 pro Tag");
});

test("Repology-Budget: die zweite Abfrage im selben Moment muss eine Sekunde warten (deterministisch über takeBudget)", () => {
  resetHostBudgets();
  const budget = HOST_BUDGETS["repology.org"];
  assert.equal(takeBudget("repology.test", budget, 0), 0);
  assert.equal(takeBudget("repology.test", budget, 100), 900);
  assert.equal(takeBudget("repology.test", budget, 1000), 0);
});
