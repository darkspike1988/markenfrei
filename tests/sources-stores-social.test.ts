import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mainTitleCandidates,
  manualSocialLinks,
  titleWordPrefixes,
  playBundleIds,
  SOCIAL_SOURCES,
  STORE_SOURCES,
} from "@/lib/engine/sources/stores-social";
import type { CheckContext, HttpRequest, HttpResponse, Source } from "@/lib/engine/types";

type Reply = Partial<HttpResponse> | ((req: HttpRequest) => Partial<HttpResponse>);

/** Fake-HttpClient: liefert je URL eine feste Antwort, unbekannte URLs ergeben einen Netzfehler. */
function fakeCtx(routes: Record<string, Reply>) {
  const calls: { url: string; req: HttpRequest }[] = [];
  const ctx: CheckContext = {
    contact: "",
    http: {
      async request(url, req = {}) {
        calls.push({ url, req });
        const r = routes[url];
        if (!r) return { status: 0, headers: new Headers(), error: "network" };
        const v = typeof r === "function" ? r(req) : r;
        return { status: 200, headers: new Headers(), ...v };
      },
    },
  };
  return { ctx, calls };
}

const byId = (id: string): Source => {
  const s = [...STORE_SOURCES, ...SOCIAL_SOURCES].find((x) => x.id === id);
  assert.ok(s, `Quelle ${id} fehlt`);
  return s;
};

test("Exporte: IDs, Namensräume und Standardauswahl", () => {
  assert.deepEqual(STORE_SOURCES.map((s) => s.id), ["appstore", "googleplay", "fdroid", "firefox"]);
  assert.deepEqual(SOCIAL_SOURCES.map((s) => s.id), ["bluesky", "mastodon", "hackernews"]);
  assert.ok(STORE_SOURCES.every((s) => s.namespace === "stores"));
  assert.ok(SOCIAL_SOURCES.every((s) => s.namespace === "social" && !s.defaultEnabled));
  assert.deepEqual(STORE_SOURCES.filter((s) => s.defaultEnabled).map((s) => s.id), ["appstore", "googleplay"]);
});

// --- App Store -------------------------------------------------------------

const ITUNES = (n: string) => `https://itunes.apple.com/search?term=${n}&country=de&entity=software&limit=25`;

test("appstore: exakter Haupttitel => taken mit Link zur App", async () => {
  const { ctx, calls } = fakeCtx({
    [ITUNES("wachwerk")]: {
      json: {
        resultCount: 2,
        results: [
          { trackName: "Wachwerkzeug Pro", trackViewUrl: "https://apps.apple.com/de/app/x/id1" },
          { trackName: "Wachwerk: Sicherheit für Zuhause", sellerName: "Wachwerk GmbH", trackViewUrl: "https://apps.apple.com/de/app/wachwerk/id2" },
        ],
      },
    },
  });
  const r = await byId("appstore").check("wachwerk", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://apps.apple.com/de/app/wachwerk/id2");
  assert.match(r.note ?? "", /Wachwerk GmbH/);
  assert.equal(calls[0].url, ITUNES("wachwerk"));
  assert.equal(calls[0].req.read, "json");
  assert.ok((calls[0].req.maxBytes ?? 0) > 0);
});

test("appstore: Name mit Bindestrich passt auf Titel mit Bindestrich", async () => {
  const { ctx } = fakeCtx({
    [ITUNES("my-app")]: { json: { results: [{ trackName: "My-App – Notizen", trackViewUrl: "https://apps.apple.com/de/app/my-app/id3" }] } },
  });
  const r = await byId("appstore").check("my-app", ctx);
  assert.equal(r.status, "taken");
});

test("appstore: klanggleicher Titel => similar", async () => {
  const { ctx } = fakeCtx({
    [ITUNES("klarna")]: { json: { results: [{ trackName: "Clarna - Bezahlen", trackViewUrl: "https://apps.apple.com/de/app/clarna/id4" }] } },
  });
  const r = await byId("appstore").check("klarna", ctx);
  assert.equal(r.status, "similar");
  assert.equal(r.url, "https://apps.apple.com/de/app/clarna/id4");
});

test("appstore: nur unscharfe Treffer => not_found mit Suchlink", async () => {
  const { ctx } = fakeCtx({
    [ITUNES("zzqxkvjwabc")]: { json: { resultCount: 0, results: [] } },
  });
  const r = await byId("appstore").check("zzqxkvjwabc", ctx);
  assert.equal(r.status, "not_found");
  assert.equal(r.url, "https://apps.apple.com/de/iphone/search?term=zzqxkvjwabc");
  assert.doesNotMatch(r.note ?? "", /registrierbar|frei/i);
});

test("appstore: volle Trefferseite ohne exakten Titel => similar (nicht alle geprüft), nie not_found", async () => {
  const results = Array.from({ length: 25 }, (_, i) => ({ trackName: `Zufallsspiel ${i}`, trackViewUrl: `https://apps.apple.com/de/app/x/id${i}` }));
  const { ctx } = fakeCtx({ [ITUNES("qzwexr")]: { json: { resultCount: 25, results } } });
  const r = await byId("appstore").check("qzwexr", ctx);
  assert.equal(r.status, "similar");
  assert.match(r.note ?? "", /Nicht alle Treffer geprüft/);
  assert.equal(r.url, "https://apps.apple.com/de/iphone/search?term=qzwexr");
  // Eine nicht volle Seite bleibt not_found
  const few = fakeCtx({ [ITUNES("qzwexr")]: { json: { resultCount: 24, results: results.slice(0, 24) } } });
  assert.equal((await byId("appstore").check("qzwexr", few.ctx)).status, "not_found");
});

test("appstore: 429, 503, Timeout und falsches Format => unknown", async () => {
  for (const reply of [{ status: 429 }, { status: 503 }, { status: 0, error: "timeout" as const }, { json: { foo: 1 } }]) {
    const { ctx } = fakeCtx({ [ITUNES("abc")]: reply });
    const r = await byId("appstore").check("abc", ctx);
    assert.equal(r.status, "unknown", JSON.stringify(reply));
    assert.ok(r.note && r.evidence);
  }
  const { ctx } = fakeCtx({ [ITUNES("abc")]: { status: 503 } });
  assert.equal((await byId("appstore").check("abc", ctx)).evidence, "HTTP 503");
});

test("mainTitleCandidates trennt vor Doppelpunkt und Gedankenstrich", () => {
  assert.deepEqual(mainTitleCandidates("Wachwerk: Sicherheit"), ["wachwerk"]);
  assert.deepEqual(mainTitleCandidates("Foo-Bar – Baz"), ["foo", "foobar"]);
  assert.deepEqual(mainTitleCandidates("Ölwerk"), ["oelwerk"]);
});

test("titleWordPrefixes bildet die ersten 1 bis 3 Wörter", () => {
  assert.deepEqual(titleWordPrefixes("Spotify Musik und Podcasts"), ["spotify", "spotifymusik", "spotifymusikund"]);
  assert.deepEqual(titleWordPrefixes("  WhatsApp   Messenger "), ["whatsapp", "whatsappmessenger"]);
  assert.deepEqual(titleWordPrefixes(""), []);
});

test("appstore: Titel ohne Trennzeichen, der mit dem Namen beginnt => similar, nie not_found", async () => {
  // Reale Antwortform (Live-Probe "spotify"): Haupttitel ohne ":" oder "-".
  const { ctx } = fakeCtx({
    [ITUNES("spotify")]: {
      json: {
        results: [
          { trackName: "Spotify Musik und Podcasts", sellerName: "Spotify", trackViewUrl: "https://apps.apple.com/de/app/spotify/id324684580" },
          { trackName: "YouTube", trackViewUrl: "https://apps.apple.com/de/app/youtube/id544007664" },
          { trackName: "WhatsApp Messenger", trackViewUrl: "https://apps.apple.com/de/app/whatsapp/id310633997" },
        ],
      },
    },
  });
  const r = await byId("appstore").check("spotify", ctx);
  assert.notEqual(r.status, "not_found");
  assert.equal(r.status, "similar");
  assert.equal(r.url, "https://apps.apple.com/de/app/spotify/id324684580");
  assert.match(r.note ?? "", /Spotify Musik und Podcasts/);

  const two = fakeCtx({ [ITUNES("whatsapp")]: { json: { results: [{ trackName: "WhatsApp Messenger" }] } } });
  assert.equal((await byId("appstore").check("whatsapp", two.ctx)).status, "similar");
});

test("appstore: exakter Titel hat Vorrang vor einem früheren Wortpräfix-Treffer", async () => {
  const { ctx } = fakeCtx({
    [ITUNES("spotify")]: {
      json: {
        results: [
          { trackName: "Spotify Musik und Podcasts", trackViewUrl: "https://apps.apple.com/de/app/a/id1" },
          { trackName: "Spotify: Für Künstler", trackViewUrl: "https://apps.apple.com/de/app/b/id2" },
        ],
      },
    },
  });
  const r = await byId("appstore").check("spotify", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://apps.apple.com/de/app/b/id2");
});

test("appstore: Name nur mitten im Titel => kein Wortpräfix-Treffer", async () => {
  const { ctx } = fakeCtx({ [ITUNES("musik")]: { json: { results: [{ trackName: "Spotify Musik und Podcasts" }] } } });
  assert.equal((await byId("appstore").check("musik", ctx)).status, "not_found");
});

// --- Google Play -----------------------------------------------------------

const PLAY = (id: string) => `https://play.google.com/store/apps/details?id=${id}`;

test("googleplay: baut beide Bundle-IDs und fragt per HEAD ohne Körper", async () => {
  assert.deepEqual(playBundleIds("wach-werk"), ["com.wachwerk.app", "de.wachwerk.app"]);
  const { ctx, calls } = fakeCtx({ [PLAY("com.wachwerk.app")]: { status: 404 }, [PLAY("de.wachwerk.app")]: { status: 200 } });
  const r = await byId("googleplay").check("wachwerk", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, PLAY("de.wachwerk.app"));
  assert.deepEqual(calls.map((c) => c.url).sort(), [PLAY("com.wachwerk.app"), PLAY("de.wachwerk.app")]);
  assert.ok(calls.every((c) => c.req.method === "HEAD" && c.req.read === "none"));
});

test("googleplay: beide 404 => not_found", async () => {
  const { ctx } = fakeCtx({ [PLAY("com.zzqxkvjwabc.app")]: { status: 404 }, [PLAY("de.zzqxkvjwabc.app")]: { status: 404 } });
  const r = await byId("googleplay").check("zzqxkvjwabc", ctx);
  assert.equal(r.status, "not_found");
  assert.equal(r.url, "https://play.google.com/store/search?q=zzqxkvjwabc&c=apps");
});

test("googleplay: 429 bei einer ID => unknown, ohne Wiederholung", async () => {
  const { ctx, calls } = fakeCtx({ [PLAY("com.abc.app")]: { status: 404 }, [PLAY("de.abc.app")]: { status: 429 } });
  const r = await byId("googleplay").check("abc", ctx);
  assert.equal(r.status, "unknown");
  assert.match(r.evidence ?? "", /HTTP 429/);
  assert.equal(calls.length, 2);
});

test("googleplay: 405 auf HEAD => GET, 503 => ein zweiter Versuch", async () => {
  let n = 0;
  const { ctx, calls } = fakeCtx({
    [PLAY("com.abc.app")]: (req) => ({ status: req.method === "HEAD" ? 405 : 200 }),
    [PLAY("de.abc.app")]: () => ({ status: n++ === 0 ? 503 : 404 }),
  });
  const r = await byId("googleplay").check("abc", ctx);
  assert.equal(r.status, "taken");
  assert.equal(calls.length, 4);
  assert.ok(calls.some((c) => c.req.method === "GET" && c.req.read === "none"));
});

test("googleplay: Timeout bzw. Netzfehler auf beiden IDs => unknown nach zweitem Versuch", async () => {
  for (const error of ["timeout", "network"] as const) {
    const { ctx, calls } = fakeCtx({
      [PLAY("com.abc.app")]: { status: 0, error },
      [PLAY("de.abc.app")]: { status: 0, error },
    });
    const r = await byId("googleplay").check("abc", ctx);
    assert.equal(r.status, "unknown", error);
    assert.equal(calls.length, 4, error);
    assert.match(r.evidence ?? "", new RegExp(`${error} für com\\.abc\\.app`));
    assert.match(r.evidence ?? "", new RegExp(`${error} für de\\.abc\\.app`));
  }
});

test("googleplay: Ziffer am Anfang oder Java-Schlüsselwort => invalid ohne Anfrage", async () => {
  for (const name of ["9werk", "new", "class"]) {
    const { ctx, calls } = fakeCtx({});
    const r = await byId("googleplay").check(name, ctx);
    assert.equal(r.status, "invalid", name);
    assert.equal(calls.length, 0);
  }
});

// --- F-Droid ---------------------------------------------------------------

const FDROID = (n: string) => `https://search.f-droid.org/api/search_apps?q=${n}`;

test("fdroid: exakter Name => taken mit Paketseite", async () => {
  const { ctx, calls } = fakeCtx({
    [FDROID("newpipe")]: {
      json: { apps: [{ name: "NewPipe", url: "https://f-droid.org/en/packages/org.schabi.newpipe" }, { name: "PipePipe", url: "https://f-droid.org/x" }] },
    },
  });
  const r = await byId("fdroid").check("newpipe", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://f-droid.org/en/packages/org.schabi.newpipe");
  assert.equal(calls[0].url, FDROID("newpipe"));
});

test("fdroid: nur unscharfe Treffer oder leer => not_found", async () => {
  const fuzzy = fakeCtx({ [FDROID("pipe")]: { json: { apps: [{ name: "NewPipe", url: "https://f-droid.org/x" }] } } });
  const a = await byId("fdroid").check("pipe", fuzzy.ctx);
  assert.equal(a.status, "not_found");
  assert.match(a.note ?? "", /1 unscharfe/);
  const empty = fakeCtx({ [FDROID("zzqxkvjwabc")]: { json: { apps: [] } } });
  const b = await byId("fdroid").check("zzqxkvjwabc", empty.ctx);
  assert.equal(b.status, "not_found");
  assert.equal(b.url, "https://search.f-droid.org/?q=zzqxkvjwabc&lang=de");
});

test("fdroid: volle Trefferseite (10) ohne exakten Namen => similar, nie not_found", async () => {
  const apps = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Werkzeug ${i}`, url: `https://f-droid.org/en/packages/w${i}` }));
  const full = fakeCtx({ [FDROID("qzwexr")]: { json: { apps: apps(10) } } });
  const r = await byId("fdroid").check("qzwexr", full.ctx);
  assert.equal(r.status, "similar");
  assert.match(r.note ?? "", /Nicht alle Treffer geprüft/);
  assert.equal(r.url, "https://search.f-droid.org/?q=qzwexr&lang=de");
  const few = fakeCtx({ [FDROID("qzwexr")]: { json: { apps: apps(9) } } });
  assert.equal((await byId("fdroid").check("qzwexr", few.ctx)).status, "not_found");
});

test("fdroid: 500 oder Parse-Fehler => unknown", async () => {
  for (const reply of [{ status: 500 }, { error: "parse" as const }, { json: [] }]) {
    const { ctx } = fakeCtx({ [FDROID("abc")]: reply });
    assert.equal((await byId("fdroid").check("abc", ctx)).status, "unknown");
  }
});

test("fdroid: 429 und Timeout => unknown mit Beleg und Suchlink", async () => {
  const a = fakeCtx({ [FDROID("abc")]: { status: 429 } });
  const r429 = await byId("fdroid").check("abc", a.ctx);
  assert.equal(r429.status, "unknown");
  assert.equal(r429.evidence, "HTTP 429");
  assert.match(r429.note ?? "", /Zu viele Anfragen/);
  const b = fakeCtx({ [FDROID("abc")]: { status: 0, error: "timeout" } });
  const rto = await byId("fdroid").check("abc", b.ctx);
  assert.equal(rto.status, "unknown");
  assert.equal(rto.evidence, "timeout");
  assert.equal(rto.url, "https://search.f-droid.org/?q=abc&lang=de");
});

// --- Firefox Add-ons -------------------------------------------------------

const AMO = (n: string) => `https://addons.mozilla.org/api/v5/addons/search/?q=${n}&page_size=10&lang=de`;

test("firefox: exakter Name im Sprachobjekt => taken", async () => {
  const { ctx, calls } = fakeCtx({
    [AMO("ublock-origin")]: {
      json: {
        count: 2,
        results: [
          { name: { de: "uBlock Origin Lite" }, url: "https://addons.mozilla.org/de/firefox/addon/ublock-origin-lite/" },
          { name: { "en-US": "uBlock Origin" }, url: "https://addons.mozilla.org/de/firefox/addon/ublock-origin/" },
        ],
      },
    },
  });
  const r = await byId("firefox").check("ublock-origin", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://addons.mozilla.org/de/firefox/addon/ublock-origin/");
  assert.equal(calls[0].url, AMO("ublock-origin"));
});

test("firefox: keine exakte Übereinstimmung => not_found, 429 => unknown", async () => {
  const a = fakeCtx({ [AMO("zzqxkvjwabc")]: { json: { count: 0, results: [] } } });
  const r = await byId("firefox").check("zzqxkvjwabc", a.ctx);
  assert.equal(r.status, "not_found");
  assert.equal(r.url, "https://addons.mozilla.org/de/firefox/search/?q=zzqxkvjwabc");
  const b = fakeCtx({ [AMO("abc")]: { status: 429 } });
  const u = await byId("firefox").check("abc", b.ctx);
  assert.equal(u.status, "unknown");
  assert.equal(u.evidence, "HTTP 429");
});

test("firefox: count über den gelieferten Treffern oder volle Seite => similar, nie not_found", async () => {
  const addons = (n: number) => Array.from({ length: n }, (_, i) => ({ name: { de: `Werkzeug ${i}` }, url: `https://addons.mozilla.org/de/firefox/addon/w${i}/` }));
  const more = fakeCtx({ [AMO("qzwexr")]: { json: { count: 37, results: addons(3) } } });
  const a = await byId("firefox").check("qzwexr", more.ctx);
  assert.equal(a.status, "similar");
  assert.match(a.note ?? "", /Nicht alle Treffer geprüft \(3 von 37\)/);
  const full = fakeCtx({ [AMO("qzwexr")]: { json: { results: addons(10) } } });
  assert.equal((await byId("firefox").check("qzwexr", full.ctx)).status, "similar", "volle Seite ohne count");
  const all = fakeCtx({ [AMO("qzwexr")]: { json: { count: 3, results: addons(3) } } });
  assert.equal((await byId("firefox").check("qzwexr", all.ctx)).status, "not_found", "alle Treffer geprüft");
});

test("firefox: Timeout, 503 und falsches Format => unknown", async () => {
  for (const reply of [{ status: 0, error: "timeout" as const }, { status: 503 }, { json: { results: "x" } }]) {
    const { ctx } = fakeCtx({ [AMO("abc")]: reply });
    const r = await byId("firefox").check("abc", ctx);
    assert.equal(r.status, "unknown", JSON.stringify(reply));
    assert.equal(r.url, "https://addons.mozilla.org/de/firefox/search/?q=abc");
  }
});

// --- Bluesky ---------------------------------------------------------------

const BSKY = (n: string) => `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${n}.bsky.social`;

test("bluesky: 200 mit did => taken, Link zum Profil", async () => {
  const { ctx, calls } = fakeCtx({ [BSKY("john")]: { json: { did: "did:plc:4usllmhbbh57ba66t2sevlrl" } } });
  const r = await byId("bluesky").check("john", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.target, "john.bsky.social");
  assert.equal(r.url, "https://bsky.app/profile/john.bsky.social");
  assert.equal(calls[0].url, BSKY("john"));
});

test("bluesky: 400 Unable to resolve handle => not_found", async () => {
  const { ctx } = fakeCtx({
    [BSKY("zzqxkvjwabc")]: { status: 400, json: { error: "InvalidRequest", message: "Unable to resolve handle" } },
  });
  const r = await byId("bluesky").check("zzqxkvjwabc", ctx);
  assert.equal(r.status, "not_found");
});

test("bluesky: andere 400, 429 oder 200 ohne did => unknown", async () => {
  for (const reply of [
    { status: 400, json: { error: "InvalidRequest", message: "Error: handle must be a valid handle" } },
    { status: 429, json: { error: "RateLimitExceeded" } },
    { json: { foo: 1 } },
  ]) {
    const { ctx } = fakeCtx({ [BSKY("abc")]: reply });
    assert.equal((await byId("bluesky").check("abc", ctx)).status, "unknown", JSON.stringify(reply));
  }
});

test("bluesky: zu kurz, zu lang oder Bindestrich am Rand => invalid ohne Anfrage", async () => {
  for (const name of ["ab", "a".repeat(19), "-abc", "abc-"]) {
    const { ctx, calls } = fakeCtx({});
    const r = await byId("bluesky").check(name, ctx);
    assert.equal(r.status, "invalid", name);
    // Kein Link auf ein Profil, das es syntaktisch nicht geben kann, sondern auf die Suche.
    assert.equal(r.url, `https://bsky.app/search?q=${encodeURIComponent(name)}`);
    assert.equal(calls.length, 0);
  }
});

// --- Mastodon --------------------------------------------------------------

const MASTO = (n: string) => `https://mastodon.social/.well-known/webfinger?resource=acct:${n}@mastodon.social`;

test("mastodon: 200 => taken, 404 => not_found, beide mit Hinweis auf mastodon.social", async () => {
  const { ctx, calls } = fakeCtx({ [MASTO("gargron")]: { status: 200 }, [MASTO("zzqxkvjwabc")]: { status: 404 } });
  const a = await byId("mastodon").check("gargron", ctx);
  assert.equal(a.status, "taken");
  assert.equal(a.url, "https://mastodon.social/@gargron");
  assert.match(a.note ?? "", /nur mastodon\.social/);
  const b = await byId("mastodon").check("zzqxkvjwabc", ctx);
  assert.equal(b.status, "not_found");
  assert.match(b.note ?? "", /nur mastodon\.social/);
  assert.equal(calls[0].url, MASTO("gargron"));
  assert.equal(calls[0].req.read, "none");
});

test("mastodon: 503 => unknown, Bindestrich => invalid", async () => {
  const { ctx } = fakeCtx({ [MASTO("abc")]: { status: 503 } });
  const u = await byId("mastodon").check("abc", ctx);
  assert.equal(u.status, "unknown");
  assert.equal(u.evidence, "HTTP 503");
  const inv = fakeCtx({});
  const r = await byId("mastodon").check("my-app", inv.ctx);
  assert.equal(r.status, "invalid");
  assert.equal(r.url, "https://mastodon.social/search?q=my-app");
  assert.equal(inv.calls.length, 0);
});

// --- Hacker News -----------------------------------------------------------

const HN = (n: string) => `https://hacker-news.firebaseio.com/v0/user/${n}.json`;

test("hackernews: Objekt mit id => taken, null => not_found mit Hinweis", async () => {
  const { ctx, calls } = fakeCtx({
    [HN("pg")]: { json: { id: "pg", karma: 1, created: 1 } },
    [HN("zzqxkvjwabc")]: { json: null },
  });
  const a = await byId("hackernews").check("pg", ctx);
  assert.equal(a.status, "taken");
  assert.equal(a.url, "https://news.ycombinator.com/user?id=pg");
  const b = await byId("hackernews").check("zzqxkvjwabc", ctx);
  assert.equal(b.status, "not_found");
  assert.match(b.note ?? "", /Nutzer ohne Beiträge erscheinen auch als null/);
  assert.match(b.note ?? "", /Nur Kleinschreibung geprüft/);
  assert.equal(calls[0].url, HN("pg"));
  assert.equal(calls[0].req.read, "json");
  assert.ok((calls[0].req.maxBytes ?? Infinity) <= 1024, "maxBytes knapp");
});

test("hackernews: 200 über maxBytes => taken, Fehler => unknown, zu lang => invalid", async () => {
  const big = fakeCtx({ [HN("pg")]: { error: "too_large" } });
  assert.equal((await byId("hackernews").check("pg", big.ctx)).status, "taken");
  for (const reply of [{ status: 429 }, { status: 0, error: "network" as const }, { json: "x" }]) {
    const { ctx } = fakeCtx({ [HN("abc")]: reply });
    assert.equal((await byId("hackernews").check("abc", ctx)).status, "unknown", JSON.stringify(reply));
  }
  const inv = fakeCtx({});
  assert.equal((await byId("hackernews").check("a".repeat(16), inv.ctx)).status, "invalid");
  assert.equal(inv.calls.length, 0);
});

// --- Robustheit und manuelle Links -----------------------------------------

test("keine Quelle wirft, auch wenn der HTTP-Client wirft", async () => {
  const ctx: CheckContext = {
    contact: "",
    http: {
      async request() {
        throw new Error("boom");
      },
    },
  };
  for (const s of [...STORE_SOURCES, ...SOCIAL_SOURCES]) {
    const r = await s.check("wachwerk", ctx);
    assert.equal(r.status, "unknown", s.id);
    assert.equal(r.sourceId, s.id);
  }
});

test("manualSocialLinks liefert fünf Links ohne Abfrage", () => {
  const links = manualSocialLinks("wachwerk");
  assert.deepEqual(links.map((l) => l.label), ["Instagram", "TikTok", "X", "YouTube", "Chrome Web Store"]);
  assert.equal(links[0].url, "https://www.instagram.com/wachwerk/");
  assert.equal(links[1].url, "https://www.tiktok.com/@wachwerk");
  assert.equal(links[2].url, "https://x.com/wachwerk");
  assert.equal(links[3].url, "https://www.youtube.com/@wachwerk");
  assert.equal(links[4].url, "https://chromewebstore.google.com/search/wachwerk");
});

test("manualSocialLinks: bei Bindestrich keine Handles mit Bindestrich für Instagram, TikTok und X", () => {
  const links = manualSocialLinks("my-app");
  const urls = links.map((l) => l.url);
  for (const host of ["instagram.com", "tiktok.com", "x.com"]) {
    const own = urls.filter((u) => u.includes(host));
    assert.equal(own.length, 2, host);
    assert.ok(own.every((u) => !u.includes("my-app")), host);
  }
  assert.ok(urls.includes("https://www.instagram.com/myapp/"));
  assert.ok(urls.includes("https://www.instagram.com/my_app/"));
  assert.ok(urls.includes("https://www.tiktok.com/@my_app"));
  assert.ok(urls.includes("https://x.com/myapp"));
  assert.ok(links.some((l) => l.label === "X (my_app)"));
  // YouTube-Handles erlauben Bindestriche, der Chrome Web Store ist eine Suche.
  assert.ok(urls.includes("https://www.youtube.com/@my-app"));
  assert.ok(urls.includes("https://chromewebstore.google.com/search/my-app"));
});
