/**
 * Einfaches Rate-Limit pro Schlüssel (Festes Zeitfenster, im Arbeitsspeicher).
 *
 * Grenzen: Der Zähler gilt pro Serverprozess. Mehrere Prozesse auf derselben ausgehenden IP
 * und serverlose Plattformen werden nicht unterstützt (docs/design.md, Option A+). Der Schlüssel ist die IP aus x-forwarded-for; ohne vertrauenswürdigen
 * Proxy davor lässt sich dieser Header fälschen.
 */

const MAX_KEYS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSec: number;
  /** Einheiten pro Fenster */
  limit: number;
  /** Noch freie Einheiten im aktuellen Fenster (nach dieser Anfrage) */
  remaining: number;
  /** Sekunden bis zum Ende des Fensters */
  resetSec: number;
};

/** cost: wie viele Einheiten die Anfrage verbraucht (z. B. Anzahl geprüfter Namen) */
export type RateLimiter = { check(key: string, cost?: number): RateLimitResult };

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
  /** Obergrenze der gemerkten Schlüssel (Standard 10 000); kleiner nur für Tests sinnvoll */
  maxKeys?: number;
}): RateLimiter {
  const now = opts.now ?? Date.now;
  const maxKeys = Math.max(1, opts.maxKeys ?? MAX_KEYS);
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string, cost = 1): RateLimitResult {
      const units = Math.max(1, Math.ceil(cost));
      const t = now();

      // Abgelaufene Fenster gelegentlich entfernen, damit die Map nicht wächst
      if (windows.size > 2000 || windows.size >= maxKeys) {
        for (const [k, w] of windows) if (w.resetAt <= t) windows.delete(k);
      }

      let w = windows.get(key);
      if (w && w.resetAt <= t) {
        // Löschen und unten neu einfügen: So steht der Schlüssel in der Map wieder hinten
        windows.delete(key);
        w = undefined;
      }
      if (!w) {
        // Harte Obergrenze, nur für neue Schlüssel: Fenster mit dem ältesten Beginn zuerst
        // (Map behält die Einfügereihenfolge). Das laufende Fenster des Anfragenden bleibt.
        while (windows.size >= maxKeys) {
          const oldest = windows.keys().next().value;
          if (oldest === undefined) break;
          windows.delete(oldest);
        }
        w = { count: 0, resetAt: t + opts.windowMs };
        windows.set(key, w);
      }

      if (w.count + units > opts.limit) {
        const reset = Math.max(1, Math.ceil((w.resetAt - t) / 1000));
        return { allowed: false, retryAfterSec: reset, limit: opts.limit, remaining: Math.max(0, opts.limit - w.count), resetSec: reset };
      }
      w.count += units;
      return {
        allowed: true,
        retryAfterSec: 0,
        limit: opts.limit,
        remaining: opts.limit - w.count,
        resetSec: Math.max(1, Math.ceil((w.resetAt - t) / 1000)),
      };
    },
  };
}

const trustedEnv = Number(process.env.MARKENFREI_TRUSTED_PROXIES);
/** Anzahl vertrauenswürdiger Proxys vor der App (Standard 1, z. B. Caddy, nginx, Vercel). */
export const TRUSTED_PROXIES =
  Number.isInteger(trustedEnv) && trustedEnv >= 0 ? trustedEnv : 1;

/**
 * Schlüssel fürs Rate-Limit. x-forwarded-for wird von rechts gelesen: Jeder Proxy hängt
 * die Adresse an, von der er die Anfrage bekam. Der Eintrag an Position (Länge minus Anzahl
 * vertrauter Proxys) ist damit die Adresse, die der äußerste vertraute Proxy gesehen hat.
 * Einträge links davon setzt der Client selbst und werden ignoriert.
 * Ohne vertraute Proxys (0) zählen alle Anfragen gemeinsam als "local".
 */
/**
 * IPv6-Adressen zählen als Netz (/64), weil ein Anschluss meist ein ganzes /64 bekommt und sonst
 * jede Anfrage von einer neuen Adresse käme. IPv4 und IPv4-mapped IPv6 bleiben unverändert (IPv4).
 * Ein angehängter Port ("1.2.3.4:5678", "[2001:db8::1]:443") zählt nicht mit, sonst hätte
 * jeder Quellport einen eigenen Zähler. Nicht lesbare Werte bleiben wie sie sind.
 */
export function rateLimitKey(address: string): string {
  const trimmed = address.trim();
  const bracketed = /^\[([^\]]*)\](?::\d{1,5})?$/.exec(trimmed);
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(trimmed);
  const a = (bracketed?.[1] ?? v4WithPort?.[1] ?? trimmed).split("%")[0].toLowerCase();
  if (!a.includes(":")) return a;
  const mapped = /^(?:0{0,4}:){2,5}ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a);
  if (mapped) return mapped[1];
  const halves = a.split("::");
  if (halves.length > 2) return a;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return a;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return a;
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

/** Gemeinsamer Zählschlüssel, wenn keine Client-Adresse bekannt oder vertraut ist. */
export const SHARED_KEY = "local";

export function clientKey(req: Request, trustedProxies = TRUSTED_PROXIES): string {
  if (trustedProxies <= 0) return SHARED_KEY;
  const list = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length > 0) return rateLimitKey(list[Math.max(0, list.length - trustedProxies)]);
  const real = req.headers.get("x-real-ip")?.trim();
  return real ? rateLimitKey(real) : SHARED_KEY;
}

/** Meldung der 429-Antwort (auch für die API-Dokumentation). */
export function rateLimitMessage(retryAfterSec: number): string {
  return `Zu viele Anfragen. Bitte in ${retryAfterSec} Sekunden erneut versuchen.`;
}

/**
 * Header zur Auskunft über das Limit des Clients: RateLimit-Limit, RateLimit-Remaining,
 * RateLimit-Reset (Sekunden bis zum Ende des Fensters). Das sind die drei Einzelheader der
 * früheren Fassungen des Entwurfs draft-ietf-httpapi-ratelimit-headers. Neuere Fassungen des
 * Entwurfs nutzen stattdessen `RateLimit` und `RateLimit-Policy`; darauf ist hier bewusst nicht
 * umgestellt.
 * Die Werte gelten pro Einheit; eine Anfrage mit mehreren Namen verbraucht mehrere.
 */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(r.limit),
    "RateLimit-Remaining": String(r.remaining),
    "RateLimit-Reset": String(r.resetSec),
  };
}

export function limitedResponse(retryAfterSec: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: rateLimitMessage(retryAfterSec),
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
        ...extraHeaders,
      },
    },
  );
}

export type GuardOutcome = {
  /** 429-Antwort, wenn das Limit erreicht ist, sonst null */
  response: Response | null;
  /** RateLimit-Header für die Antwort (auch bei 429) */
  headers: Record<string, string>;
};

/** Wie createGuard, liefert aber zusätzlich die RateLimit-Header für die Erfolgsantwort. */
export function createGuardDetailed(limiter: RateLimiter): (req: Request, cost?: number) => GuardOutcome {
  return (req, cost = 1) => {
    const key = clientKey(req);
    const r = limiter.check(key, cost);
    // Beim gemeinsamen Schlüssel "local" (keine vertrauten Proxys oder keine Adresse) zählen alle
    // Nutzer zusammen. RateLimit-Remaining wäre dann die Gesamtlast aller und keine Auskunft über
    // den eigenen Client; deshalb keine Header. Das Limit selbst wirkt unverändert (429, Retry-After).
    const headers = key === SHARED_KEY ? {} : rateLimitHeaders(r);
    return { response: r.allowed ? null : limitedResponse(r.retryAfterSec, headers), headers };
  };
}

/** Liefert eine 429-Antwort, wenn das Limit erreicht ist, sonst null. */
export function createGuard(limiter: RateLimiter): (req: Request, cost?: number) => Response | null {
  const detailed = createGuardDetailed(limiter);
  return (req, cost = 1) => detailed(req, cost).response;
}

const perMinute = Number(process.env.MARKENFREI_RATE_LIMIT);

/** Standard des Limits pro Client, wenn MARKENFREI_RATE_LIMIT fehlt (Einheiten pro Fenster). */
export const DEFAULT_RATE_LIMIT = 60;
/** Länge des Zeitfensters in Millisekunden. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Wirksames Limit pro Client (MARKENFREI_RATE_LIMIT oder Standard). */
export const CLIENT_RATE_LIMIT = Number.isFinite(perMinute) && perMinute > 0 ? perMinute : DEFAULT_RATE_LIMIT;

const clientLimiter = createRateLimiter({
  limit: CLIENT_RATE_LIMIT,
  windowMs: RATE_LIMIT_WINDOW_MS,
});

/** Gemeinsamer Wächter für alle öffentlichen Routen (Standard: 60 Anfragen pro Minute und IP). */
export const guardRequest = createGuard(clientLimiter);
/** Derselbe Zähler wie guardRequest, mit RateLimit-Headern für die Antwort. */
export const guardRequestDetailed = createGuardDetailed(clientLimiter);
