/**
 * Reichweitenmessung ohne personenbezogene Daten (nur im Browser aufrufen).
 *
 * Sendet an den eigenen Server (`/_gc/count`, ein selbst betriebenes GoatCounter), nie an Dritte.
 * Es gibt keine Cookies und keinen Browser-Speicher. Übertragen werden ausschließlich:
 * der Pfad ohne Query und ohne Fragment, die Herkunftsseite als reine Origin (nur wenn sie extern
 * ist), die Bildschirmbreite, der Seitentitel und feste Ereignisnamen.
 * Eingegebene Namen, Auswahlen und Suchanfragen verlassen den Browser hier nie: Der eigene
 * GoatCounter-Skript wird bewusst nicht geladen, weil er `location.search` mitsenden würde.
 * Do Not Track und Global Privacy Control werden beachtet.
 */

export const ANALYTICS_ENDPOINT = "/_gc/count";

/** Feste Ereignisse. Der Teil nach dem Schrägstrich stammt aus Code, nie aus Eingaben. */
export type AnalyticsEvent =
  | "pruefung"
  | "ergebnis/green"
  | "ergebnis/yellow"
  | "ergebnis/red"
  | "anpassen"
  | "export/json"
  | "export/csv"
  | "export/markdown"
  | "export/link"
  | "varianten/tippfehler"
  | "varianten/muster"
  | `quelle/${string}`
  | `endung/${string}`;

type NavigatorWithGpc = Navigator & { globalPrivacyControl?: boolean };

export function analyticsEnabled(nav?: NavigatorWithGpc): boolean {
  if (!nav) return false;
  if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return false;
  return true;
}

/** Nur die Origin einer externen Herkunftsseite, sonst leer. */
export function externalReferrerOrigin(referrer: string, ownHost: string): string {
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    const strip = (h: string) => h.replace(/^www\./, "");
    return strip(url.hostname) === strip(ownHost) ? "" : url.origin;
  } catch {
    return "";
  }
}

/** Pfad ohne Query und Fragment, höchstens 200 Zeichen. */
export function cleanPath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  return path.slice(0, 200);
}

function send(params: Record<string, string>): void {
  if (!analyticsEnabled(typeof navigator === "undefined" ? undefined : navigator)) return;
  if (/^(localhost$|127\.|10\.|192\.168\.|0\.0\.0\.0$)/.test(location.hostname)) return;
  const url = `${ANALYTICS_ENDPOINT}?${new URLSearchParams(params).toString()}`;
  try {
    if (navigator.sendBeacon?.(url)) return;
    void fetch(url, { method: "POST", keepalive: true, credentials: "omit", mode: "same-origin" }).catch(() => {});
  } catch {
    // Messung darf die Seite nie stören.
  }
}

let lastPath: string | null = null;

/** Seitenaufruf. Der erste Aufruf einer Sitzung trägt die Herkunftsseite, spätere nicht. */
export function trackPageview(pathname: string): void {
  if (typeof window === "undefined") return;
  const p = cleanPath(pathname);
  if (p === lastPath) return;
  const first = lastPath === null;
  lastPath = p;
  send({
    p,
    t: document.title.slice(0, 120),
    r: first ? externalReferrerOrigin(document.referrer, location.hostname) : "",
    s: String(window.screen?.width ?? 0),
  });
}

/** Zählt ein festes Ereignis (keine Eingaben). */
export function trackEvent(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  send({ p: `event/${event}`, t: event, e: "true" });
}
