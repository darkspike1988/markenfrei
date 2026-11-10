import type { CheckContext, HttpResponse, Namespace, Source, SourceResult, Status } from "@/lib/engine/types";
import { foldToAscii } from "@/lib/name";
import { koelnerPhonetik } from "@/lib/phonetics";

/**
 * Store- und Social-Quellen (docs/v2-spec.md, Abschnitt Quellen).
 * Jede Quelle liefert genau ein SourceResult und wirft nie.
 * "not_found" heißt nur: die Quelle kennt den Namen nicht. Es heißt nie "registrierbar".
 */

type Base = Pick<SourceResult, "sourceId" | "namespace" | "label" | "target">;

function make(base: Base, status: Status, extra: Partial<SourceResult> = {}): SourceResult {
  return { ...base, status, ...extra };
}

/** Kurzer technischer Beleg, z. B. "HTTP 503" oder "timeout". */
function evidenceOf(res: HttpResponse): string {
  if (res.error) return res.status ? `HTTP ${res.status}, ${res.error}` : res.error;
  return `HTTP ${res.status}`;
}

/** Ergebnis "unknown" für jede Antwort, die keine eindeutige Aussage erlaubt. */
function unknownFrom(base: Base, res: HttpResponse, url?: string): SourceResult {
  let note = "Keine verwertbare Antwort, bitte manuell prüfen";
  if (res.error === "timeout" || res.error === "deadline") note = "Zeitüberschreitung, bitte manuell prüfen";
  else if (res.error === "budget") note = "Abfragelimit des Dienstes erreicht (Apple nennt etwa 20 Anfragen pro Minute), später oder manuell prüfen";
  else if (res.error === "budget_long") note = "Abfragelimit des Dienstes für längere Zeit erreicht, später erneut oder manuell prüfen";
  else if (res.error === "network") note = "Dienst nicht erreichbar, bitte manuell prüfen";
  else if (res.status === 429) note = "Zu viele Anfragen, bitte später oder manuell prüfen";
  else if (res.status >= 500) note = "Dienst gestört, bitte manuell prüfen";
  else if (res.error === "parse" || res.error === "too_large") note = "Unerwartetes Antwortformat, bitte manuell prüfen";
  return make(base, "unknown", { url, note, evidence: evidenceOf(res) });
}

/** Fängt unerwartete Fehler einer Prüfung ab, damit eine Quelle nie wirft. */
function safe(
  meta: { id: string; namespace: Namespace; label: string },
  run: (name: string, ctx: CheckContext, base: Base) => Promise<SourceResult>,
): Source["check"] {
  return async (name, ctx) => {
    const base: Base = { sourceId: meta.id, namespace: meta.namespace, label: meta.label, target: name };
    try {
      return await run(name, ctx, base);
    } catch (err) {
      const evidence = err instanceof Error ? err.name : "Fehler";
      return make(base, "unknown", { note: "Interner Fehler bei der Abfrage, bitte manuell prüfen", evidence });
    }
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Vergleichsform für Titel und Namen: Kleinbuchstaben, ASCII, nur a-z0-9. */
export function compactName(input: string): string {
  return foldToAscii(input).replace(/[^a-z0-9]/g, "");
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Apple App Store (iTunes Search API)
// ---------------------------------------------------------------------------

/** Treffer je Suche; 25 passen mit Puffer in maxBytes (600 KB). Eine volle Seite ist nie "nicht gefunden". */
const APPSTORE_LIMIT = 25;

/**
 * Haupttitel vor ":", "–", "—", "|" oder "-" in kompakter Form. Weil ein Bindestrich auch Teil
 * des Namens sein kann ("my-app"), gibt es zwei Kandidaten: einmal bis zum ersten Bindestrich,
 * einmal nur bis zu einem Bindestrich mit Leerzeichen davor und danach (" - ").
 */
export function mainTitleCandidates(trackName: string): string[] {
  const strict = trackName.split(/[:\-–—|]/)[0] ?? "";
  const loose = trackName.split(/[:–—|]|\s-\s/)[0] ?? "";
  const out = new Set([compactName(strict), compactName(loose)]);
  out.delete("");
  return [...out];
}

/**
 * Wortpräfixe des Titels (erste 1 bis 3 Wörter) in kompakter Form. Viele Apps tragen einen Titel
 * ohne Trennzeichen, bei dem nach dem Namen nur beschreibende Wörter folgen
 * („Spotify Musik und Podcasts“, „WhatsApp Messenger“). Ein solcher Treffer ist kein exakter
 * Titel, darf aber nie zu not_found führen.
 */
export function titleWordPrefixes(trackName: string): string[] {
  const words = trackName.split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let k = 1; k <= Math.min(3, words.length); k++) out.add(compactName(words.slice(0, k).join(" ")));
  out.delete("");
  return [...out];
}

export type AppStoreCountry = {
  /** Quellen-ID */
  id: string;
  label: string;
  /** Ländercode der Storefront (iTunes-Parameter country und Pfad auf apps.apple.com) */
  code: string;
  /** Name des Landes in der Beschreibung ("Deutschland") */
  land: string;
  /** Wie der Store im Hinweis heißt ("deutscher Store") */
  store: string;
  defaultEnabled: boolean;
  /** Zusatz zur Beschreibung (Hinweis auf das gemeinsame Abfragelimit bei den Zusatzländern) */
  extraDescription?: string;
};

const APPSTORE_DE: AppStoreCountry = {
  id: "appstore",
  label: "App Store",
  code: "de",
  land: "Deutschland",
  store: "deutscher Store",
  defaultEnabled: true,
};

/** Alle Storefronts teilen sich den Host itunes.apple.com und damit ein Abfragebudget (HOST_BUDGETS). */
const APPSTORE_SHARED_LIMIT = "Teilt sich das Abfragelimit von Apple mit dem deutschen App Store.";

async function checkAppStore(
  country: AppStoreCountry,
  endpoint: string,
  name: string,
  ctx: CheckContext,
  base: Base,
): Promise<SourceResult> {
  const searchUrl = `https://apps.apple.com/${country.code}/iphone/search?term=${enc(name)}`;
  const api = endpoint.replace("{name}", enc(name));
  const res = await ctx.http.request(api, { read: "json", maxBytes: 600_000, retry: true });
  if (res.error || res.status !== 200) return unknownFrom(base, res, searchUrl);
  const results = isObject(res.json) ? res.json.results : undefined;
  if (!Array.isArray(results)) {
    return make(base, "unknown", { url: searchUrl, note: "Unerwartetes Antwortformat, bitte manuell prüfen", evidence: "HTTP 200, ohne results" });
  }

  const target = compactName(name);
  const targetKp = koelnerPhonetik(name);
  // Vorrang: exakter Haupttitel (taken) vor Titelanfang als ganzes Wort vor Klanggleichheit (beide similar).
  let prefix: { title: string; url: string; seller: string } | undefined;
  let sound: { title: string; url: string } | undefined;
  for (const app of results) {
    if (!isObject(app)) continue;
    const title = typeof app.trackName === "string" ? app.trackName : "";
    const url = typeof app.trackViewUrl === "string" && app.trackViewUrl ? app.trackViewUrl : searchUrl;
    const seller = typeof app.sellerName === "string" ? app.sellerName : "";
    const candidates = mainTitleCandidates(title);
    if (candidates.includes(target)) {
      return make(base, "taken", {
        url,
        note: `App „${title}“${seller ? ` von ${seller}` : ""}`,
        evidence: `HTTP 200, exakter Titel unter ${results.length} Treffern`,
      });
    }
    const prefixes = titleWordPrefixes(title);
    if (!prefix && prefixes.includes(target)) prefix = { title, url, seller };
    if (
      !sound &&
      targetKp.length >= 3 &&
      [...candidates, ...prefixes].some((c) => koelnerPhonetik(c) === targetKp)
    ) {
      sound = { title, url };
    }
  }
  if (prefix) {
    return make(base, "similar", {
      url: prefix.url,
      note: `App-Titel „${prefix.title}“${prefix.seller ? ` von ${prefix.seller}` : ""} beginnt mit dem Namen, bitte prüfen`,
      evidence: `HTTP 200, Titelanfang an Wortgrenze unter ${results.length} Treffern`,
    });
  }
  if (sound) {
    return make(base, "similar", {
      url: sound.url,
      note: `Klanggleicher Titel „${sound.title}“, bitte prüfen`,
      evidence: `HTTP 200, Kölner Phonetik ${targetKp}`,
    });
  }
  // Die iTunes-Suche nennt keine Gesamtzahl; eine volle Seite heißt: es kann weitere Treffer geben
  if (results.length >= APPSTORE_LIMIT) {
    return make(base, "similar", {
      url: searchUrl,
      note: `Nicht alle Treffer geprüft (Suche liefert höchstens ${APPSTORE_LIMIT}), ein App-Titel mit diesem Namen ist nicht ausgeschlossen`,
      evidence: `HTTP 200, ${results.length} Treffer ohne exakten Titel, Seite voll`,
    });
  }
  return make(base, "not_found", {
    url: searchUrl,
    note: `Kein App-Titel mit diesem Namen in der Suche (${country.store}, ${results.length} Treffer). Andere Länder nicht geprüft`,
    evidence: `HTTP 200, ${results.length} Treffer ohne exakten Titel`,
  });
}

/** Apple App Store für ein Land. Nur die Storefront unterscheidet sich, die Regeln sind für alle gleich. */
export function appStoreSource(country: AppStoreCountry): Source {
  const { id, label, code } = country;
  const endpoint = `https://itunes.apple.com/search?term={name}&country=${code}&entity=software&limit=${APPSTORE_LIMIT}`;
  return {
    id,
    namespace: "stores",
    label,
    defaultEnabled: country.defaultEnabled,
    description:
      `Apple App Store (${country.land}), Suche über die iTunes Search API. Vergeben nur bei exakt gleichem Haupttitel. Titel, die mit dem Namen als ganzem Wort beginnen, oder klanggleiche Titel (Kölner Phonetik) ergeben ähnlich, ebenso eine volle Trefferseite ohne exakten Titel (nicht alle Treffer geprüft).` +
      (country.extraDescription ? ` ${country.extraDescription}` : ""),
    endpoint,
    check: safe({ id, namespace: "stores", label }, (name, ctx, base) => checkAppStore(country, endpoint, name, ctx, base)),
  };
}

const appstore = appStoreSource(APPSTORE_DE);

/** Zusatzländer: nicht in der Standardauswahl, auf Wunsch zuschaltbar. */
const appstoreAt = appStoreSource({
  id: "appstore_at",
  label: "App Store (Österreich)",
  code: "at",
  land: "Österreich",
  store: "österreichischer Store",
  defaultEnabled: false,
  extraDescription: APPSTORE_SHARED_LIMIT,
});
const appstoreCh = appStoreSource({
  id: "appstore_ch",
  label: "App Store (Schweiz)",
  code: "ch",
  land: "Schweiz",
  store: "Schweizer Store",
  defaultEnabled: false,
  extraDescription: APPSTORE_SHARED_LIMIT,
});
const appstoreUs = appStoreSource({
  id: "appstore_us",
  label: "App Store (USA)",
  code: "us",
  land: "USA",
  store: "US-Store",
  defaultEnabled: false,
  extraDescription: APPSTORE_SHARED_LIMIT,
});

// ---------------------------------------------------------------------------
// Google Play (Bundle-IDs per HEAD, Logik aus rea.ts)
// ---------------------------------------------------------------------------

const JAVA_KEYWORDS = new Set(
  (
    "abstract assert boolean break byte case catch char class const continue default do double else enum " +
    "extends final finally float for goto if implements import instanceof int interface long native new " +
    "package private protected public return short static strictfp super switch synchronized this throw " +
    "throws transient try void volatile while true false null"
  ).split(" "),
);

/** Paket-Segment für Android: Bindestriche fallen weg (wie in rea.ts), Start mit Buchstabe, kein Java-Schlüsselwort. */
export function playSegment(name: string): string | null {
  const seg = name.replace(/[^a-z0-9]/g, "");
  if (!/^[a-z][a-z0-9]*$/.test(seg) || JAVA_KEYWORDS.has(seg)) return null;
  return seg;
}

export function playBundleIds(name: string): string[] {
  const seg = playSegment(name);
  return seg ? [`com.${seg}.app`, `de.${seg}.app`] : [];
}

type PlayProbe = { id: string; url: string; res: HttpResponse };

async function probePlay(ctx: CheckContext, id: string): Promise<PlayProbe> {
  const url = `https://play.google.com/store/apps/details?id=${enc(id)}`;
  let method: "HEAD" | "GET" = "HEAD";
  let res: HttpResponse = { status: 0, headers: new Headers(), error: "network" };
  // Höchstens zwei Versuche: HEAD nicht unterstützt (405/501) => GET ohne Körper,
  // Netzfehler oder 5xx => ein weiterer Versuch. 429 wird nicht wiederholt.
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await ctx.http.request(url, { method, read: "none", timeoutMs: 4000 });
    if (res.status === 200 || res.status === 404) return { id, url, res };
    if (res.status === 405 || res.status === 501) {
      method = "GET";
      continue;
    }
    const transient = res.error === "network" || res.error === "timeout" || res.status >= 500;
    if (!transient) break;
  }
  return { id, url, res };
}

const googleplay: Source = {
  id: "googleplay",
  namespace: "stores",
  label: "Google Play",
  defaultEnabled: true,
  description:
    "Google Play, Abfrage der App-Seiten für die Bundle-IDs com.{name}.app und de.{name}.app per HEAD. Andere Bundle-IDs und App-Titel werden nicht geprüft.",
  endpoint: "https://play.google.com/store/apps/details?id=com.{name}.app (und de.{name}.app)",
  check: safe({ id: "googleplay", namespace: "stores", label: "Google Play" }, async (name, ctx, base) => {
    const searchUrl = `https://play.google.com/store/search?q=${enc(name)}&c=apps`;
    const ids = playBundleIds(name);
    if (ids.length === 0) {
      return make(base, "invalid", {
        url: searchUrl,
        note: "Als Android-Paketname unzulässig (muss mit einem Buchstaben beginnen, kein Java-Schlüsselwort)",
      });
    }
    const t = { ...base, target: ids.join(", ") };
    const probes = await Promise.all(ids.map((id) => probePlay(ctx, id)));
    const hit = probes.find((p) => p.res.status === 200);
    if (hit) {
      return make(t, "taken", { url: hit.url, note: `App mit der Bundle-ID ${hit.id} vorhanden`, evidence: `HTTP 200 für ${hit.id}` });
    }
    if (probes.every((p) => p.res.status === 404)) {
      return make(t, "not_found", {
        url: searchUrl,
        note: "Keine App unter diesen Bundle-IDs. App-Titel und andere Bundle-IDs nicht geprüft",
        evidence: probes.map((p) => `HTTP 404 für ${p.id}`).join(", "),
      });
    }
    const bad = probes.find((p) => p.res.status !== 404) ?? probes[0];
    const u = unknownFrom(t, bad.res, searchUrl);
    return { ...u, evidence: probes.map((p) => `${evidenceOf(p.res)} für ${p.id}`).join(", ") };
  }),
};

// ---------------------------------------------------------------------------
// F-Droid (Volltextsuche, nur exakter App-Name zählt)
// ---------------------------------------------------------------------------

/**
 * Treffer je Antwort. Die API nennt weder Gesamtzahl noch Seitengröße und kennt keinen Seitenparameter;
 * beobachtet (10. November 2026): bei häufigen Suchwörtern immer genau 10 Treffer. Eine volle Seite ist
 * deshalb nie "nicht gefunden".
 */
const FDROID_PAGE_SIZE = 10;

const fdroid: Source = {
  id: "fdroid",
  namespace: "stores",
  label: "F-Droid",
  defaultEnabled: false,
  description:
    "F-Droid, offizielle Such-API. Die Suche ist unscharf, vergeben nur bei exakt gleichem App-Namen; eine volle Trefferseite ohne exakten Namen ergibt ähnlich (nicht alle Treffer geprüft).",
  endpoint: "https://search.f-droid.org/api/search_apps?q={name}",
  check: safe({ id: "fdroid", namespace: "stores", label: "F-Droid" }, async (name, ctx, base) => {
    const searchUrl = `https://search.f-droid.org/?q=${enc(name)}&lang=de`;
    const res = await ctx.http.request(`https://search.f-droid.org/api/search_apps?q=${enc(name)}`, {
      read: "json",
      maxBytes: 256_000,
    });
    if (res.error || res.status !== 200) return unknownFrom(base, res, searchUrl);
    const apps = isObject(res.json) ? res.json.apps : undefined;
    if (!Array.isArray(apps)) {
      return make(base, "unknown", { url: searchUrl, note: "Unerwartetes Antwortformat, bitte manuell prüfen", evidence: "HTTP 200, ohne apps" });
    }
    const target = compactName(name);
    for (const app of apps) {
      if (!isObject(app) || typeof app.name !== "string") continue;
      if (compactName(app.name) === target) {
        const url = typeof app.url === "string" && app.url.startsWith("https://") ? app.url : searchUrl;
        return make(base, "taken", { url, note: `App „${app.name}“`, evidence: `HTTP 200, exakter Name unter ${apps.length} Treffern` });
      }
    }
    if (apps.length >= FDROID_PAGE_SIZE) {
      return make(base, "similar", {
        url: searchUrl,
        note: `Nicht alle Treffer geprüft (nur die ersten ${apps.length}), eine App mit genau diesem Namen ist nicht ausgeschlossen`,
        evidence: `HTTP 200, ${apps.length} Treffer ohne exakten Namen, Seite voll`,
      });
    }
    return make(base, "not_found", {
      url: searchUrl,
      note: apps.length
        ? `Keine App mit genau diesem Namen (${apps.length} unscharfe Treffer)`
        : "Keine App mit diesem Namen gefunden",
      evidence: `HTTP 200, ${apps.length} Treffer ohne exakten Namen`,
    });
  }),
};

// ---------------------------------------------------------------------------
// Firefox Add-ons (AMO API v5)
// ---------------------------------------------------------------------------

/** Name eines Add-ons: mit lang=de ein Objekt { de: "…" } (oder Fallback-Sprache), selten ein String. */
function addonNames(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (isObject(v)) return Object.values(v).filter((x): x is string => typeof x === "string");
  return [];
}

/** Treffer je Seite; eine volle Seite oder count darüber ist nie "nicht gefunden". */
const FIREFOX_PAGE_SIZE = 10;

const firefox: Source = {
  id: "firefox",
  namespace: "stores",
  label: "Firefox Add-ons",
  defaultEnabled: false,
  description:
    "Firefox Add-ons (addons.mozilla.org), offizielle Such-API. Die Suche ist unscharf, vergeben nur bei exakt gleichem Namen; meldet die Suche mehr Treffer als geprüft, ergibt das ähnlich.",
  endpoint: `https://addons.mozilla.org/api/v5/addons/search/?q={name}&page_size=${FIREFOX_PAGE_SIZE}&lang=de`,
  check: safe({ id: "firefox", namespace: "stores", label: "Firefox Add-ons" }, async (name, ctx, base) => {
    const searchUrl = `https://addons.mozilla.org/de/firefox/search/?q=${enc(name)}`;
    const api = `https://addons.mozilla.org/api/v5/addons/search/?q=${enc(name)}&page_size=${FIREFOX_PAGE_SIZE}&lang=de`;
    const res = await ctx.http.request(api, { read: "json", maxBytes: 400_000 });
    if (res.error || res.status !== 200) return unknownFrom(base, res, searchUrl);
    const results = isObject(res.json) ? res.json.results : undefined;
    if (!Array.isArray(results)) {
      return make(base, "unknown", { url: searchUrl, note: "Unerwartetes Antwortformat, bitte manuell prüfen", evidence: "HTTP 200, ohne results" });
    }
    const target = compactName(name);
    for (const addon of results) {
      if (!isObject(addon)) continue;
      const match = addonNames(addon.name).find((n) => compactName(n) === target);
      if (match) {
        const url = typeof addon.url === "string" && addon.url.startsWith("https://") ? addon.url : searchUrl;
        return make(base, "taken", { url, note: `Add-on „${match}“`, evidence: `HTTP 200, exakter Name unter ${results.length} Treffern` });
      }
    }
    // count ist die Gesamtzahl der Treffer; fehlt sie, zeigt eine volle Seite, dass es weitere geben kann
    const count = isObject(res.json) && typeof res.json.count === "number" ? res.json.count : undefined;
    const moreThanSeen = count !== undefined && count > results.length;
    if (moreThanSeen || results.length >= FIREFOX_PAGE_SIZE) {
      const seen = moreThanSeen ? `${results.length} von ${count}` : `nur die ersten ${results.length}`;
      return make(base, "similar", {
        url: searchUrl,
        note: `Nicht alle Treffer geprüft (${seen}), ein Add-on mit genau diesem Namen ist nicht ausgeschlossen`,
        evidence: `HTTP 200, count ${count ?? "fehlt"}, ${results.length} geprüft ohne exakten Namen`,
      });
    }
    return make(base, "not_found", {
      url: searchUrl,
      note: results.length
        ? `Kein Add-on mit genau diesem Namen (${results.length} unscharfe Treffer)`
        : "Kein Add-on mit diesem Namen gefunden",
      evidence: `HTTP 200, ${results.length} Treffer ohne exakten Namen`,
    });
  }),
};

export const STORE_SOURCES: Source[] = [appstore, appstoreAt, appstoreCh, appstoreUs, googleplay, fdroid, firefox];

// ---------------------------------------------------------------------------
// Bluesky ({name}.bsky.social)
// ---------------------------------------------------------------------------

/** bsky.social vergibt Handles mit 3 bis 18 Zeichen vor ".bsky.social", ohne Bindestrich am Rand. */
export function isBskySocialHandle(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name) && name.length >= 3 && name.length <= 18;
}

const bluesky: Source = {
  id: "bluesky",
  namespace: "social",
  label: "Bluesky",
  defaultEnabled: false,
  description: "Bluesky, Auflösung des Handles {name}.bsky.social über die öffentliche AppView-API. Eigene Domains als Handle werden nicht geprüft.",
  endpoint: "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle={name}.bsky.social",
  check: safe({ id: "bluesky", namespace: "social", label: "Bluesky" }, async (name, ctx, base) => {
    const handle = `${name}.bsky.social`;
    const t = { ...base, target: handle };
    const profileUrl = `https://bsky.app/profile/${handle}`;
    if (!isBskySocialHandle(name)) {
      // Ein solches Profil kann es nicht geben, daher die Suche statt eines leeren Profils verlinken.
      return make(t, "invalid", { url: `https://bsky.app/search?q=${enc(name)}`, note: "Auf bsky.social sind 3 bis 18 Zeichen ohne Bindestrich am Rand erlaubt" });
    }
    const api = `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${enc(handle)}`;
    const res = await ctx.http.request(api, { read: "json", maxBytes: 4096 });
    const body = isObject(res.json) ? res.json : undefined;
    if (!res.error && res.status === 200 && typeof body?.did === "string" && body.did.startsWith("did:")) {
      return make(t, "taken", { url: profileUrl, note: "Handle ist vergeben", evidence: `HTTP 200, ${body.did}` });
    }
    if (!res.error && res.status === 400 && typeof body?.message === "string" && /unable to resolve handle/i.test(body.message)) {
      return make(t, "not_found", {
        url: profileUrl,
        note: "Handle nicht aufgelöst. Reservierte oder gesperrte Handles nicht geprüft",
        evidence: "HTTP 400, Unable to resolve handle",
      });
    }
    return unknownFrom(t, res, profileUrl);
  }),
};

// ---------------------------------------------------------------------------
// Mastodon (nur mastodon.social, WebFinger)
// ---------------------------------------------------------------------------

/** Mastodon-Benutzernamen: nur a-z, 0-9 und Unterstrich, höchstens 30 Zeichen. */
export function isMastodonUsername(name: string): boolean {
  return /^[a-z0-9_]{1,30}$/.test(name);
}

const mastodon: Source = {
  id: "mastodon",
  namespace: "social",
  label: "Mastodon",
  defaultEnabled: false,
  description: "Mastodon, WebFinger-Abfrage auf mastodon.social. Andere Instanzen werden nicht geprüft.",
  endpoint: "https://mastodon.social/.well-known/webfinger?resource=acct:{name}@mastodon.social",
  check: safe({ id: "mastodon", namespace: "social", label: "Mastodon" }, async (name, ctx, base) => {
    const t = { ...base, target: `@${name}@mastodon.social` };
    const profileUrl = `https://mastodon.social/@${name}`;
    if (!isMastodonUsername(name)) {
      return make(t, "invalid", { url: `https://mastodon.social/search?q=${enc(name)}`, note: "Mastodon erlaubt nur Buchstaben, Ziffern und Unterstrich (nur mastodon.social)" });
    }
    const api = `https://mastodon.social/.well-known/webfinger?resource=acct:${name}@mastodon.social`;
    const res = await ctx.http.request(api, { read: "none" });
    if (!res.error && res.status === 200) {
      return make(t, "taken", { url: profileUrl, note: "Konto vorhanden (nur mastodon.social)", evidence: "HTTP 200" });
    }
    if (!res.error && res.status === 410) {
      return make(t, "taken", { url: profileUrl, note: "Konto gelöscht oder gesperrt, Name bleibt belegt (nur mastodon.social)", evidence: "HTTP 410" });
    }
    if (!res.error && res.status === 404) {
      return make(t, "not_found", { url: profileUrl, note: "Kein Konto gefunden (nur mastodon.social, andere Instanzen nicht geprüft)", evidence: "HTTP 404" });
    }
    const u = unknownFrom(t, res, profileUrl);
    return { ...u, note: `${u.note} (nur mastodon.social)` };
  }),
};

// ---------------------------------------------------------------------------
// Hacker News (Firebase-API, Nutzer)
// ---------------------------------------------------------------------------

/** HN-Benutzernamen: 2 bis 15 Zeichen aus Buchstaben, Ziffern, Bindestrich und Unterstrich. */
export function isHnUsername(name: string): boolean {
  return /^[a-z0-9_-]{2,15}$/.test(name);
}

/** Knapp: "null" hat 4 Bytes, ein kleines Nutzerobjekt wird noch geparst, größere sind sofort too_large (= taken). */
const HN_MAX_BYTES = 1024;

const hackernews: Source = {
  id: "hackernews",
  namespace: "social",
  label: "Hacker News",
  defaultEnabled: false,
  description: "Hacker News, Nutzerabfrage über die offizielle Firebase-API. Groß- und Kleinschreibung zählt.",
  endpoint: "https://hacker-news.firebaseio.com/v0/user/{name}.json",
  check: safe({ id: "hackernews", namespace: "social", label: "Hacker News" }, async (name, ctx, base) => {
    const profileUrl = `https://news.ycombinator.com/user?id=${enc(name)}`;
    if (!isHnUsername(name)) {
      return make(base, "invalid", { url: profileUrl, note: "Hacker News erlaubt 2 bis 15 Zeichen" });
    }
    const res = await ctx.http.request(`https://hacker-news.firebaseio.com/v0/user/${enc(name)}.json`, {
      read: "json",
      maxBytes: HN_MAX_BYTES,
    });
    // Eine 200-Antwort über maxBytes kann nur ein Nutzerobjekt sein ("null" hat 4 Bytes).
    if (res.status === 200 && res.error === "too_large") {
      return make(base, "taken", { url: profileUrl, note: "Nutzer vorhanden", evidence: `HTTP 200, Nutzerobjekt über ${HN_MAX_BYTES / 1024} KB` });
    }
    if (!res.error && res.status === 200) {
      if (isObject(res.json) && typeof res.json.id === "string") {
        return make(base, "taken", { url: profileUrl, note: "Nutzer vorhanden", evidence: `HTTP 200, id ${res.json.id}` });
      }
      if (res.json === null) {
        return make(base, "not_found", {
          url: profileUrl,
          note:
            "Kein Nutzer mit diesem Namen. Nur Kleinschreibung geprüft, Konten in anderer Schreibweise nicht erkannt. Nutzer ohne Beiträge erscheinen auch als null",
          evidence: "HTTP 200, null",
        });
      }
    }
    return unknownFrom(base, res, profileUrl);
  }),
};

export const SOCIAL_SOURCES: Source[] = [bluesky, mastodon, hackernews];

// ---------------------------------------------------------------------------
// Nur Links zur manuellen Prüfung (keine Abfrage)
// ---------------------------------------------------------------------------

/**
 * Links zur manuellen Prüfung. Instagram, TikTok und X erlauben keinen Bindestrich im Handle.
 * Ein Profil-Link mit Bindestrich zeigte immer eine leere Seite und wirkte wie „frei“. Bei
 * Bindestrich werden daher die beiden zulässigen Schreibweisen ohne Bindestrich und mit
 * Unterstrich verlinkt. YouTube-Handles erlauben Bindestriche.
 */
export function manualSocialLinks(name: string): { label: string; url: string }[] {
  const handles = name.includes("-") ? [name.replace(/-/g, ""), name.replace(/-/g, "_")] : [name];
  const variants = (label: string, url: (h: string) => string) =>
    handles.map((h) => ({ label: handles.length > 1 ? `${label} (${h})` : label, url: url(enc(h)) }));
  const n = enc(name);
  return [
    ...variants("Instagram", (h) => `https://www.instagram.com/${h}/`),
    ...variants("TikTok", (h) => `https://www.tiktok.com/@${h}`),
    ...variants("X", (h) => `https://x.com/${h}`),
    { label: "YouTube", url: `https://www.youtube.com/@${n}` },
    { label: "Chrome Web Store", url: `https://chromewebstore.google.com/search/${n}` },
  ];
}
