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
export function clientKey(req: Request, trustedProxies = TRUSTED_PROXIES): string {
  if (trustedProxies <= 0) return "local";
  const list = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length > 0) return list[Math.max(0, list.length - trustedProxies)];
  return req.headers.get("x-real-ip")?.trim() || "local";
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
