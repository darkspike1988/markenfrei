import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKAGE_SOURCES, hackageExactMatch } from "@/lib/engine/sources/packages";
import type { CheckContext, HttpClient, HttpResponse, Source } from "@/lib/engine/types";

type Reply = { status: number; json?: unknown; error?: HttpResponse["error"] };

function ctxWith(routes: Record<string, Reply>) {
  const calls: string[] = [];
  const http: HttpClient = {
    async request(url) {
      calls.push(url);
      const r = routes[url];
      if (!r) throw new Error(`unerwartete URL im Test: ${url}`);
      return { status: r.status, headers: new Headers(), json: r.json, error: r.error };
    },
  };
  const ctx: CheckContext = { http, contact: "" };
  return { ctx, calls };
}

const src = (id: string): Source => {
  const s = PACKAGE_SOURCES.find((x) => x.id === id);
  assert.ok(s, id);
  return s;
};

const HF_ORG = (n: string) => `https://huggingface.co/api/organizations/${n}/overview`;
const HF_USER = (n: string) => `https://huggingface.co/api/users/${n}/overview`;

test("alle vier sind optionale Quellen im Namensraum packages", () => {
  for (const id of ["huggingface", "hackage", "terraform", "devto"]) {
    const s = src(id);
    assert.equal(s.defaultEnabled, false, id);
    assert.equal(s.namespace, "packages");
    assert.ok(s.description.length > 20 && /^https:\/\//.test(s.endpoint), id);
  }
});

test("Hugging Face: nur als Organisation vergeben (google) ist taken, nicht frei", async () => {
  const { ctx } = ctxWith({ [HF_ORG("google")]: { status: 200 }, [HF_USER("google")]: { status: 404 } });
  const r = await src("huggingface").check("google", ctx);
  assert.equal(r.status, "taken");
  assert.match(r.note ?? "", /Organisation/);
  assert.equal(r.url, "https://huggingface.co/google");
});

test("Hugging Face: nur als Nutzer vergeben, beide frei, und Ausfall ist unknown", async () => {
  const user = await src("huggingface").check("julien-c", ctxWith({ [HF_ORG("julien-c")]: { status: 404 }, [HF_USER("julien-c")]: { status: 200 } }).ctx);
  assert.equal(user.status, "taken");
  assert.match(user.note ?? "", /Nutzer/);

  const free = await src("huggingface").check("zzqxkvjwabc", ctxWith({ [HF_ORG("zzqxkvjwabc")]: { status: 404 }, [HF_USER("zzqxkvjwabc")]: { status: 404 } }).ctx);
  assert.equal(free.status, "not_found");

  // Eine Antwort 404, die andere 429: nie frei
  const half = await src("huggingface").check("abc", ctxWith({ [HF_ORG("abc")]: { status: 404 }, [HF_USER("abc")]: { status: 429 } }).ctx);
  assert.equal(half.status, "unknown");
  const err = await src("huggingface").check("abc", ctxWith({ [HF_ORG("abc")]: { status: 0, error: "timeout" }, [HF_USER("abc")]: { status: 404 } }).ctx);
  assert.equal(err.status, "unknown");
});

test("Hugging Face: ein Treffer genügt, auch wenn die andere Abfrage fehlschlägt", async () => {
  const r = await src("huggingface").check("google", ctxWith({ [HF_ORG("google")]: { status: 200 }, [HF_USER("google")]: { status: 503 } }).ctx);
  assert.equal(r.status, "taken");
});

test("dev.to: Nutzer und Organisation werden beide geprüft", async () => {
  const U = (n: string) => `https://dev.to/api/users/by_username?url=${n}`;
  const O = (n: string) => `https://dev.to/api/organizations/${n}`;
  assert.equal((await src("devto").check("ben", ctxWith({ [U("ben")]: { status: 200 }, [O("ben")]: { status: 404 } }).ctx)).status, "taken");
  const org = await src("devto").check("devteam", ctxWith({ [U("devteam")]: { status: 404 }, [O("devteam")]: { status: 200 } }).ctx);
  assert.equal(org.status, "taken");
  assert.match(org.note ?? "", /Organisation/);
  const free = await src("devto").check("zzqxkvjwabc", ctxWith({ [U("zzqxkvjwabc")]: { status: 404 }, [O("zzqxkvjwabc")]: { status: 404 } }).ctx);
  assert.equal(free.status, "not_found");
  assert.match(free.note ?? "", /gesperrte oder ungültige/);
  assert.equal((await src("devto").check("x1", ctxWith({ [U("x1")]: { status: 404 }, [O("x1")]: { status: 500 } }).ctx)).status, "unknown");
});

test("Terraform: Namespace mit Modulen oder mit Providern, sonst nicht gefunden", async () => {
  const M = (n: string) => `https://registry.terraform.io/v1/modules/${n}`;
  const P = (n: string) => `https://registry.terraform.io/v1/providers/${n}`;
  const mod = await src("terraform").check("datadog", ctxWith({ [M("datadog")]: { status: 200 }, [P("datadog")]: { status: 404 } }).ctx);
  assert.equal(mod.status, "taken");
  const prov = await src("terraform").check("onlyprov", ctxWith({ [M("onlyprov")]: { status: 404 }, [P("onlyprov")]: { status: 200 } }).ctx);
  assert.equal(prov.status, "taken");
  assert.match(prov.note ?? "", /Providern/);
  const free = await src("terraform").check("zzqxkvjwabc", ctxWith({ [M("zzqxkvjwabc")]: { status: 404 }, [P("zzqxkvjwabc")]: { status: 404 } }).ctx);
  assert.equal(free.status, "not_found");
  assert.match(free.note ?? "", /leere Namespaces/);
  assert.equal((await src("terraform").check("abc", ctxWith({ [M("abc")]: { status: 429 }, [P("abc")]: { status: 404 } }).ctx)).status, "unknown");
});

const HK = (n: string) => `https://hackage.haskell.org/package/${n}`;
const HS = (n: string) => `https://hackage.haskell.org/packages/search?terms=${n}`;

test("Hackage: exakter Name ist taken, ohne die Suche abzufragen", async () => {
  const { ctx, calls } = ctxWith({ [HK("aeson")]: { status: 200 } });
  const r = await src("hackage").check("aeson", ctx);
  assert.equal(r.status, "taken");
  assert.deepEqual(calls, [HK("aeson")]);
});

test("Hackage: quickcheck ergibt 404, die Suche findet QuickCheck, also taken mit Schreibweise", async () => {
  const { ctx } = ctxWith({ [HK("quickcheck")]: { status: 404 }, [HS("quickcheck")]: { status: 200, json: [{ name: "QuickCheck" }, { name: "tasty-quickcheck" }] } });
  const r = await src("hackage").check("quickcheck", ctx);
  assert.equal(r.status, "taken");
  assert.match(r.note ?? "", /QuickCheck/);
  assert.equal(r.url, HK("QuickCheck"));
});

test("Hackage: 404 und kein exakter Treffer ist not_found; ähnliche Namen zählen nicht", async () => {
  const { ctx } = ctxWith({ [HK("zzqxkvjwabc")]: { status: 404 }, [HS("zzqxkvjwabc")]: { status: 200, json: [] } });
  assert.equal((await src("hackage").check("zzqxkvjwabc", ctx)).status, "not_found");
  const similar = ctxWith({ [HK("quick")]: { status: 404 }, [HS("quick")]: { status: 200, json: [{ name: "quickcheck-x" }, { name: "quicker" }] } });
  assert.equal((await src("hackage").check("quick", similar.ctx)).status, "not_found");
});

test("Hackage: Ausfall der Suche nach 404 ist unknown, nie frei", async () => {
  for (const search of [{ status: 429 }, { status: 503 }, { status: 0, error: "timeout" as const }, { status: 200, json: { kaputt: true } }]) {
    const { ctx } = ctxWith({ [HK("abc")]: { status: 404 }, [HS("abc")]: search });
    assert.equal((await src("hackage").check("abc", ctx)).status, "unknown", JSON.stringify(search));
  }
  const direct = ctxWith({ [HK("abc")]: { status: 503 } });
  assert.equal((await src("hackage").check("abc", direct.ctx)).status, "unknown");
});

test("hackageExactMatch vergleicht ohne Rücksicht auf die Schreibweise und übersteht Müll", () => {
  assert.equal(hackageExactMatch([{ name: "HsYAML" }], "hsyaml"), "HsYAML");
  assert.equal(hackageExactMatch([{ name: "text-x" }], "text"), undefined);
  for (const bad of [null, undefined, {}, "x", [1, null, {}, { name: 5 }]]) assert.equal(hackageExactMatch(bad, "x"), undefined);
});

test("Hugging Face: HF_TOKEN geht nur als Authorization-Header an huggingface.co, ohne Token kein Header", async () => {
  const seen: { url: string; headers?: Record<string, string> }[] = [];
  const http: HttpClient = {
    async request(url, req) {
      seen.push({ url, headers: req?.headers });
      return { status: 404, headers: new Headers() };
    },
  };
  const ctx: CheckContext = { http, contact: "" };
  const old = process.env.HF_TOKEN;
  try {
    process.env.HF_TOKEN = "  hf_testtoken  ";
    await src("huggingface").check("zzqxkvjwabc", ctx);
    assert.equal(seen.length, 2);
    for (const c of seen) {
      assert.match(c.url, /^https:\/\/huggingface\.co\//);
      assert.equal(c.headers?.Authorization, "Bearer hf_testtoken", "Leerraum wird entfernt");
    }
    seen.length = 0;
    delete process.env.HF_TOKEN;
    await src("huggingface").check("zzqxkvjwabc", ctx);
    assert.ok(seen.every((c) => c.headers === undefined || !("Authorization" in c.headers)));
  } finally {
    if (old === undefined) delete process.env.HF_TOKEN;
    else process.env.HF_TOKEN = old;
  }
});

test("Hugging Face: der Token landet nie im Ergebnis", async () => {
  const old = process.env.HF_TOKEN;
  process.env.HF_TOKEN = "hf_geheim123";
  try {
    const http: HttpClient = { async request() { return { status: 200, headers: new Headers() }; } };
    const r = await src("huggingface").check("google", { http, contact: "" });
    assert.ok(!JSON.stringify(r).includes("hf_geheim123"));
  } finally {
    if (old === undefined) delete process.env.HF_TOKEN;
    else process.env.HF_TOKEN = old;
  }
});
