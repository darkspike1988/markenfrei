import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DOMAIN_TLDS,
  DOMAIN_TLDS,
  DOH_ONLY_TLDS,
  FEATURED_TLDS,
  NOT_INDIVIDUALLY_CHECKED_NOTE,
  domainLabelError,
  domainSources,
  isDomainTld,
  loadRdapBootstrap,
  resetRdapBootstrapCache,
  setRdapSnapshotForTests,
} from "@/lib/engine/sources/domains";
import snapshotJson from "@/lib/engine/sources/rdap-tlds.json";
import type { CheckContext, HttpClient, HttpRequest, HttpResponse } from "@/lib/engine/types";

type Reply = Partial<HttpResponse> & { status: number };
type Route = Reply | ((url: string, req: HttpRequest) => Reply);

const BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_JSON = {
  version: "1.0",
  publication: "2026-10-28T22:00:04Z",
  services: [
    [["com"], ["https://rdap.verisign.com/com/v1/"]],
    [["dev", "app"], ["http://pubapi.registry.google/rdap/", "https://pubapi.registry.google/rdap/"]],
    [["nl"], ["https://rdap.sidn.nl"]],
  ],
};

function fakeHttp(routes: Record<string, Route>) {
  const calls: { url: string; req: HttpRequest }[] = [];
  const http: HttpClient = {
    async request(url, req = {}) {
      calls.push({ url, req });
      const route = routes[url];
      if (!route) return { status: 0, headers: new Headers(), error: "network" };
      const r = typeof route === "function" ? route(url, req) : route;
      return { headers: new Headers(), ...r };
    },
  };
  return { http, calls };
}

function ctxOf(http: HttpClient): CheckContext {
  return { http, contact: "" };
}

const bootstrapOk: Route = { status: 200, json: BOOTSTRAP_JSON };

function source(tld: string) {
  const [s] = domainSources([tld]);
  assert.ok(s, `Quelle für ${tld}`);
  return s;
}

const dnsGoogle = (d: string) => `https://dns.google/resolve?name=${d}&type=NS`;
const dnsCf = (d: string) => `https://1.1.1.1/dns-query?name=${d}&type=NS`;

beforeEach(() => resetRdapBootstrapCache());

// --- Exporte ---

test("DOMAIN_TLDS und Standardauswahl", () => {
  for (const t of ["de", "com", "net", "org", "dev", "app", "io", "ai", "ch", "li", "fr", "uk", "nl", "cloud", "online", "site", "store", "blog", "design", "space", "biz", "pro", "ca", "tv", "berlin"]) {
    assert.ok(DOMAIN_TLDS.includes(t), t);
  }
  assert.deepEqual([...DEFAULT_DOMAIN_TLDS], ["de", "com", "dev", "app", "io"]);
  for (const t of DOH_ONLY_TLDS) assert.ok(DOMAIN_TLDS.includes(t));
  assert.equal(FEATURED_TLDS.length, 33, "die bisherigen 33 Endungen bleiben die kuratierten");
  assert.deepEqual([...DOMAIN_TLDS.slice(0, FEATURED_TLDS.length)], [...FEATURED_TLDS], "kuratierte zuerst");
  assert.equal(new Set(DOMAIN_TLDS).size, DOMAIN_TLDS.length, "keine Dubletten");
  assert.ok(DOMAIN_TLDS.length > 1000, `Schnappschuss ist angekommen (${DOMAIN_TLDS.length})`);
  assert.ok(isDomainTld("shop") && !isDomainTld("constructor") && !isDomainTld("DE") && !isDomainTld(""));
});

// --- Schnappschuss ---

type Snapshot = { quelle: string; veroeffentlicht: string; endungen: Record<string, string> };
const snapshot = snapshotJson as Snapshot;

test("Schnappschuss: nur https, keine xn--, sortiert, enthält com und net", () => {
  const tlds = Object.keys(snapshot.endungen);
  assert.ok(tlds.length > 1000);
  assert.deepEqual(tlds, [...tlds].sort(), "sortiert");
  assert.ok(tlds.includes("com") && tlds.includes("net"));
  for (const [t, url] of Object.entries(snapshot.endungen)) {
    assert.match(t, /^[a-z0-9]+$/, t);
    assert.ok(!t.startsWith("xn--"), t);
    assert.match(url, /^https:\/\/[^\s]+\/$/, `${t}: ${url}`);
  }
  assert.equal(snapshot.quelle, BOOTSTRAP);
});

test("DOMAIN_TLDS enthält de, io, ch, li sowie at und eu, obwohl sie im Schnappschuss fehlen", () => {
  for (const t of ["de", "io", "ch", "li", "at", "eu"]) {
    assert.ok(!(t in snapshot.endungen), `${t} fehlt im Schnappschuss`);
    assert.ok(DOMAIN_TLDS.includes(t), `${t} in DOMAIN_TLDS`);
  }
  // alle kuratierten Endungen mit RDAP haben Server (Schnappschuss oder feste Overrides)
  for (const t of FEATURED_TLDS) {
    if (DOH_ONLY_TLDS.includes(t) || ["de", "io", "ch", "li"].includes(t)) continue;
    assert.ok(t in snapshot.endungen, `${t} im Schnappschuss`);
  }
});

test("domainSources: id, label, namespace, defaultEnabled, Filter und Dubletten", () => {
  const list = domainSources(["de", ".COM", "de", "nl", "zz", "zzzzz", "constructor"]);
  assert.deepEqual(
    list.map((s) => [s.id, s.label, s.namespace, s.defaultEnabled]),
    [
      ["rdap:de", ".de", "domains", true],
      ["rdap:com", ".com", "domains", true],
      ["rdap:nl", ".nl", "domains", false],
    ],
  );
  assert.equal(list[0].endpoint, "https://rdap.denic.de/domain/{name}.de");
});

// --- Bootstrap ---

test("Bootstrap: Basis-URLs mit domain/, https bevorzugt, Overrides ergänzt", async () => {
  const { http } = fakeHttp({ [BOOTSTRAP]: bootstrapOk });
  const map = await loadRdapBootstrap(http);
  assert.equal(map.get("com"), "https://rdap.verisign.com/com/v1/domain/");
  assert.equal(map.get("dev"), "https://pubapi.registry.google/rdap/domain/");
  assert.equal(map.get("nl"), "https://rdap.sidn.nl/domain/");
  assert.equal(map.get("de"), "https://rdap.denic.de/domain/");
  assert.equal(map.get("io"), "https://rdap.identitydigital.services/rdap/domain/");
  assert.equal(map.get("ch"), "https://rdap.nic.ch/domain/");
  assert.equal(map.get("li"), "https://rdap.nic.ch/domain/");
});

test("Bootstrap: Prozess-Cache 24 h, danach neu geladen", async () => {
  let t = 1_000_000;
  const now = () => t;
  const { http, calls } = fakeHttp({ [BOOTSTRAP]: bootstrapOk });
  await loadRdapBootstrap(http, now);
  t += 23 * 3600_000;
  await loadRdapBootstrap(http, now);
  assert.equal(calls.length, 1);
  t += 2 * 3600_000;
  await loadRdapBootstrap(http, now);
  assert.equal(calls.length, 2);
});

test("Bootstrap: gleichzeitige Aufrufe laden nur einmal", async () => {
  const { http, calls } = fakeHttp({ [BOOTSTRAP]: bootstrapOk });
  await Promise.all([loadRdapBootstrap(http), loadRdapBootstrap(http), loadRdapBootstrap(http)]);
  assert.equal(calls.length, 1);
});

test("Bootstrap-Ausfall: Schnappschuss als Rückfall, feste Server bleiben", async () => {
  const { http } = fakeHttp({
    [BOOTSTRAP]: { status: 503 },
    "https://rdap.verisign.com/com/v1/domain/google.com": { status: 200 },
  });
  const map = await loadRdapBootstrap(http);
  assert.equal(map.size, Object.keys(snapshot.endungen).length + 4, "Schnappschuss plus de, io, ch, li");
  for (const t of ["de", "io", "ch", "li"]) assert.ok(map.has(t), t);
  assert.equal(map.get("academy"), `${snapshot.endungen.academy}domain/`);
  assert.match(map.get("com") ?? "", /^https:\/\/.+\/domain\/$/);
  // eine Prüfung läuft gegen den Server aus dem Schnappschuss, nicht gegen „kein Server“
  const r = await source("academy").check("google", ctxOf(http));
  assert.doesNotMatch(r.evidence ?? "", /kein Server/);
  const com = await source("com").check("google", ctxOf(http));
  assert.ok(com.evidence?.startsWith("RDAP"), com.evidence);
});

test("Bootstrap-Ausfall: nicht kuratierte Endung wird gegen den Server des Schnappschusses abgefragt", async () => {
  const { http, calls } = fakeHttp({ [BOOTSTRAP]: { status: 503 } });
  await source("academy").check("wachwerk", ctxOf(http));
  const rdap = calls.find((c) => c.url.endsWith("/domain/wachwerk.academy"));
  assert.ok(rdap, "RDAP-Abfrage an den Schnappschuss-Server");
  assert.equal(rdap.url, `${snapshot.endungen.academy}domain/wachwerk.academy`);
});

test("Bootstrap-Antwort hat Vorrang vor dem Schnappschuss", async () => {
  setRdapSnapshotForTests({ com: "https://alt.example/", academy: "https://academy.example/rdap/" });
  try {
    const { http } = fakeHttp({ [BOOTSTRAP]: bootstrapOk });
    const map = await loadRdapBootstrap(http);
    assert.equal(map.get("com"), "https://rdap.verisign.com/com/v1/domain/");
    assert.equal(map.get("academy"), "https://academy.example/rdap/domain/", "übrige Endungen aus dem Schnappschuss");
    assert.equal(map.get("de"), "https://rdap.denic.de/domain/");
  } finally {
    setRdapSnapshotForTests(undefined);
  }
});

test("Bootstrap-Ausfall ohne Server-Eintrag: .com dann unknown (DNS ohne NS)", async () => {
  setRdapSnapshotForTests({});
  try {
    const { http } = fakeHttp({
      [BOOTSTRAP]: { status: 503 },
      [dnsGoogle("wachwerk.com")]: { status: 200, json: { Status: 3 } },
    });
    const map = await loadRdapBootstrap(http);
    assert.deepEqual([...map.keys()].sort(), ["ch", "de", "io", "li"]);
    const r = await source("com").check("wachwerk", ctxOf(http));
    assert.equal(r.status, "unknown");
    assert.match(r.evidence ?? "", /Bootstrap/);
  } finally {
    setRdapSnapshotForTests(undefined);
  }
});

test("Bootstrap mit unerwartetem Format zählt als Ausfall", async () => {
  const { http } = fakeHttp({ [BOOTSTRAP]: { status: 200, json: { services: "x" } } });
  const map = await loadRdapBootstrap(http);
  assert.equal(map.get("com"), `${snapshot.endungen.com}domain/`, "Rückfall: Server aus dem Schnappschuss");
  assert.equal(map.has("de"), true);
});

// --- RDAP-Status ---

test(".de taken: HTTP 200 von rdap.denic.de, URL und Header", async () => {
  const { http, calls } = fakeHttp({
    [BOOTSTRAP]: bootstrapOk,
    "https://rdap.denic.de/domain/google.de": { status: 200 },
  });
  const r = await source("de").check("google", ctxOf(http));
  assert.equal(r.status, "taken");
  assert.equal(r.sourceId, "rdap:de");
  assert.equal(r.target, "google.de");
  assert.equal(r.evidence, "RDAP HTTP 200");
  assert.equal(r.url, "https://webwhois.denic.de/?lang=de&query=google.de");
  const rdap = calls.find((c) => c.url.startsWith("https://rdap.denic.de/"));
  assert.ok(rdap);
  assert.equal(rdap.req.read, "none");
  assert.equal(rdap.req.headers?.Accept, "application/rdap+json");
});

test(".com not_found: HTTP 404, Hinweis nicht registrierbar, ICANN-Link", async () => {
  const { http, calls } = fakeHttp({
    [BOOTSTRAP]: bootstrapOk,
    "https://rdap.verisign.com/com/v1/domain/zzqxkvjwabc.com": { status: 404 },
  });
  const r = await source("com").check("zzqxkvjwabc", ctxOf(http));
  assert.equal(r.status, "not_found");
  assert.equal(r.evidence, "RDAP HTTP 404");
  assert.match(r.note ?? "", /nicht sicher registrierbar/);
  assert.equal(r.url, "https://lookup.icann.org/en/lookup?name=zzqxkvjwabc.com");
  assert.ok(!calls.some((c) => c.url.includes("type=NS")), "bei 404 kein DNS");
});

test(".ch nutzt Override rdap.nic.ch", async () => {
  const { http } = fakeHttp({
    [BOOTSTRAP]: bootstrapOk,
    "https://rdap.nic.ch/domain/switch.ch": { status: 200 },
  });
  const r = await source("ch").check("switch", ctxOf(http));
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://www.nic.ch/de/whois/");
});

// --- nicht kuratierte Endungen (Fail-safe) ---

const ACADEMY =`${snapshot.endungen.academy}domain/`;

test("nicht kuratierte Endung: 404 → unknown mit Hinweis ‚nicht einzeln geprüft‘, nie not_found", async () => {
  const { http, calls } = fakeHttp({ [BOOTSTRAP]: bootstrapOk, [`${ACADEMY}wachwerk.academy`]: { status: 404 } });
  const r = await source("academy").check("wachwerk", ctxOf(http));
  assert.equal(r.status, "unknown");
  assert.equal(r.evidence, "RDAP HTTP 404");
  assert.equal(r.note, NOT_INDIVIDUALLY_CHECKED_NOTE);
  assert.match(r.note ?? "", /nicht einzeln geprüft; beim Registrar bestätigen/);
  assert.ok(!calls.some((c) => c.url.includes("type=NS")), "bei 404 kein DNS, wie bei den kuratierten");
});

test("nicht kuratierte Endung: 200 → taken wie überall", async () => {
  const { http } = fakeHttp({ [BOOTSTRAP]: bootstrapOk, [`${ACADEMY}google.academy`]: { status: 200 } });
  const r = await source("academy").check("google", ctxOf(http));
  assert.equal(r.status, "taken");
  assert.equal(r.evidence, "RDAP HTTP 200");
});

test("nicht kuratierte Endung: 400/501 → unknown, nie frei", async () => {
  for (const status of [400, 501]) {
    const { http } = fakeHttp({
      [BOOTSTRAP]: bootstrapOk,
      [`${ACADEMY}wachwerk.academy`]: { status },
      [dnsGoogle("wachwerk.academy")]: { status: 200, json: { Status: 3 } },
    });
    const r = await source("academy").check("wachwerk", ctxOf(http));
    assert.equal(r.status, "unknown", String(status));
    assert.equal(r.evidence, `RDAP HTTP ${status}; DNS: NXDOMAIN`);
  }
});

test("kuratierte Endungen behalten ihr 404 → not_found", async () => {
  const { http } = fakeHttp({
    [BOOTSTRAP]: bootstrapOk,
    "https://rdap.denic.de/domain/zzqxkvjwabc.de": { status: 404 },
    "https://rdap.sidn.nl/domain/zzqxkvjwabc.nl": { status: 404 },
  });
  for (const t of ["de", "nl"]) {
    assert.equal((await source(t).check("zzqxkvjwabc", ctxOf(http))).status, "not_found", t);
  }
});

test("Endung ohne Server in Bootstrap und Schnappschuss: unknown, nie not_found", async () => {
  setRdapSnapshotForTests({});
  try {
    const { http, calls } = fakeHttp({
      [BOOTSTRAP]: { status: 200, json: { services: [[["com"], ["https://rdap.verisign.com/com/v1/"]]] } },
      [dnsGoogle("wachwerk.academy")]: { status: 200, json: { Status: 3 } },
    });
    const r = await source("academy").check("wachwerk", ctxOf(http));
    assert.equal(r.status, "unknown");
    assert.match(r.evidence ?? "", /kein Server/);
    assert.ok(!calls.some((c) => c.url.includes("/domain/")), "kein RDAP ohne Server");
  } finally {
    setRdapSnapshotForTests(undefined);
  }
});

test("429 ohne DNS-Eintrag: unknown, nie frei", async () => {
  const { http } = fakeHttp({
    [BOOTSTRAP]: bootstrapOk,
    "https://pubapi.registry.google/rdap/domain/wachwerk.dev": { status: 429 },
    [dnsGoogle("wachwerk.dev")]: { status: 200, json: { Status: 3 } },
  });
  const r = await source("dev").check("wachwerk", ctxOf(http));
  assert.equal(r.status, "unknown");
  assert.equal(r.evidence, "RDAP HTTP 429; DNS: NXDOMAIN");
  assert.match(r.note ?? "", /nicht als frei werten/);
});

test("503 mit NS-Einträgen: taken, per DNS bestätigt", async () => {
  const { http } = fakeHttp({
    [BOOTSTRAP]: bootstrapOk,
    "https://rdap.verisign.com/com/v1/domain/google.com": { status: 503 },
    [dnsGoogle("google.com")]: {
      status: 200,
      json: { Status: 0, Answer: [{ name: "google.com.", type: 2, data: "ns1.google.com." }] },
    },
  });
  const r = await source("com").check("google", ctxOf(http));
  assert.equal(r.status, "taken");
  assert.match(r.note ?? "", /per DNS bestätigt/i);
  assert.equal(r.evidence, "RDAP HTTP 503; DNS: NS vorhanden");
});

test("Timeout bei RDAP und erster DoH-Anbieter aus: zweiter Anbieter bestätigt", async () => {
  const { http } = fakeHttp({
    [BOOTSTRAP]: bootstrapOk,
    "https://rdap.verisign.com/com/v1/domain/google.com": { status: 0, error: "timeout" },
    [dnsGoogle("google.com")]: { status: 0, error: "network" },
    [dnsCf("google.com")]: {
      status: 200,
      json: { Status: 0, Answer: [{ name: "google.com", type: 2, data: "ns1.google.com." }] },
    },
  });
  const r = await source("com").check("google", ctxOf(http));
  assert.equal(r.status, "taken");
  assert.match(r.evidence ?? "", /^RDAP: timeout; /);
});

test("DNS-Antwort ohne NS (z. B. nur CNAME) bestätigt nichts", async () => {
  const { http } = fakeHttp({
    [BOOTSTRAP]: bootstrapOk,
    "https://rdap.verisign.com/com/v1/domain/foo.com": { status: 500 },
    [dnsGoogle("foo.com")]: {
      status: 200,
      json: { Status: 0, Answer: [{ name: "foo.com.", type: 5, data: "bar.com." }] },
    },
  });
  const r = await source("com").check("foo", ctxOf(http));
  assert.equal(r.status, "unknown");
});

test("HTTP-Client wirft: unknown statt Ausnahme", async () => {
  const http: HttpClient = {
    async request() {
      throw new Error("boom");
    },
  };
  const r = await source("de").check("wachwerk", ctxOf(http));
  assert.equal(r.status, "unknown");
});

// --- DoH-only ---

test(".at nur DNS: NS vorhanden => taken", async () => {
  const { http, calls } = fakeHttp({
    [dnsGoogle("google.at")]: {
      status: 200,
      json: { Status: 0, Answer: [{ name: "google.at.", type: 2, data: "ns1.google.com." }] },
    },
  });
  const r = await source("at").check("google", ctxOf(http));
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://www.nic.at/de");
  assert.ok(!calls.some((c) => c.url === BOOTSTRAP), "kein Bootstrap für DNS-Endungen");
});

test(".eu nur DNS: NXDOMAIN => unknown, nie not_found", async () => {
  const { http } = fakeHttp({
    [dnsGoogle("zzqxkvjwabc.eu")]: { status: 200, json: { Status: 3 } },
  });
  const r = await source("eu").check("zzqxkvjwabc", ctxOf(http));
  assert.equal(r.status, "unknown");
  assert.equal(r.evidence, "DNS: NXDOMAIN");
  assert.equal(r.url, "https://whois.eurid.eu/de/search/?domain=zzqxkvjwabc.eu");
});

// --- Syntax ---

test("invalid ohne Netzwerkabfrage", async () => {
  for (const bad of ["ab--cd", "xn--abc", "-abc", "abc-", "a".repeat(64), "a_b"]) {
    const { http, calls } = fakeHttp({});
    const r = await source("de").check(bad, ctxOf(http));
    assert.equal(r.status, "invalid", bad);
    assert.equal(calls.length, 0, bad);
  }
});

test("domainLabelError erlaubt Bindestrich an anderen Stellen und Ziffern", () => {
  assert.equal(domainLabelError("my-app"), undefined);
  assert.equal(domainLabelError("a-b--c"), undefined);
  assert.equal(domainLabelError("123"), undefined);
  assert.equal(domainLabelError("a".repeat(63)), undefined);
  assert.ok(domainLabelError("ab--c"));
});
