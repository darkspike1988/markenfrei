/**
 * Einfaches Rate-Limit pro Schlüssel (Festes Zeitfenster, im Arbeitsspeicher).
 *
 * Grenzen: Der Zähler gilt pro Serverprozess. Laufen mehrere Instanzen oder eine
 * serverlose Plattform, begrenzt jede für sich. Dort zusätzlich am Reverse-Proxy
 * begrenzen. Der Schlüssel ist die IP aus x-forwarded-for; ohne vertrauenswürdigen
 * Proxy davor lässt sich dieser Header fälschen.
 */

const MAX_KEYS = 10_000;

export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

/** cost: wie viele Einheiten die Anfrage verbraucht (z. B. Anzahl geprüfter Namen) */
export type RateLimiter = { check(key: string, cost?: number): RateLimitResult };

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const now = opts.now ?? Date.now;
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string, cost = 1): RateLimitResult {
      const units = Math.max(1, Math.ceil(cost));
      const t = now();

      // Abgelaufene Fenster gelegentlich entfernen, damit die Map nicht wächst
      if (windows.size > 2000) {
        for (const [k, w] of windows) if (w.resetAt <= t) windows.delete(k);
      }
      // Harte Obergrenze: älteste Einträge zuerst (Map behält die Einfügereihenfolge)
      while (windows.size >= MAX_KEYS) {
        const oldest = windows.keys().next().value;
        if (oldest === undefined) break;
        windows.delete(oldest);
      }

      let w = windows.get(key);
      if (!w || w.resetAt <= t) {
        w = { count: 0, resetAt: t + opts.windowMs };
        windows.set(key, w);
      }

      if (w.count + units > opts.limit) {
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - t) / 1000)) };
      }
      w.count += units;
      return { allowed: true, retryAfterSec: 0 };
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
 * Nicht lesbare Werte bleiben wie sie sind.
 */
export function rateLimitKey(address: string): string {
  const a = address.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
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

export function clientKey(req: Request, trustedProxies = TRUSTED_PROXIES): string {
  if (trustedProxies <= 0) return "local";
  const list = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length > 0) return rateLimitKey(list[Math.max(0, list.length - trustedProxies)]);
  const real = req.headers.get("x-real-ip")?.trim();
  return real ? rateLimitKey(real) : "local";
}

export function limitedResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({
      error: `Zu viele Anfragen. Bitte in ${retryAfterSec} Sekunden erneut versuchen.`,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}

/** Liefert eine 429-Antwort, wenn das Limit erreicht ist, sonst null. */
export function createGuard(limiter: RateLimiter): (req: Request, cost?: number) => Response | null {
  return (req, cost = 1) => {
    const r = limiter.check(clientKey(req), cost);
    return r.allowed ? null : limitedResponse(r.retryAfterSec);
  };
}

const perMinute = Number(process.env.MARKENFREI_RATE_LIMIT);

/** Gemeinsamer Wächter für alle öffentlichen Routen (Standard: 60 Anfragen pro Minute und IP). */
export const guardRequest = createGuard(
  createRateLimiter({
    limit: Number.isFinite(perMinute) && perMinute > 0 ? perMinute : 60,
    windowMs: 60_000,
  }),
);
