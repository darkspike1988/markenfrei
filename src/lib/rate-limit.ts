/**
 * Einfaches Rate-Limit pro Schlüssel (Festes Zeitfenster, im Arbeitsspeicher).
 *
 * Grenzen: Der Zähler gilt pro Serverprozess. Laufen mehrere Instanzen oder eine
 * serverlose Plattform, begrenzt jede für sich. Dort zusätzlich am Reverse-Proxy
 * begrenzen. Der Schlüssel ist die IP aus x-forwarded-for; ohne vertrauenswürdigen
 * Proxy davor lässt sich dieser Header fälschen.
 */

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

export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "local";
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
