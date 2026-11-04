/**
 * Kleiner Cache mit Ablaufzeit für Abfragen bei Dritten (im Arbeitsspeicher).
 *
 * Regel: Nur eindeutige Antworten werden gespeichert. Ein "unknown" (Timeout, 429, 5xx)
 * bleibt ungespeichert, sonst würde ein kurzer Ausfall minutenlang haften.
 */

export type TtlCache<T> = {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  clear(): void;
};

const registry: Array<{ clear(): void }> = [];

export function createTtlCache<T>(opts: {
  ttlMs: number;
  max: number;
  now?: () => number;
}): TtlCache<T> {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, { value: T; expiresAt: number }>();

  const cache: TtlCache<T> = {
    get(key) {
      const e = entries.get(key);
      if (!e) return undefined;
      if (e.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return e.value;
    },
    set(key, value) {
      if (opts.ttlMs <= 0) return;
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + opts.ttlMs });
      // Älteste Einträge zuerst entfernen (Map behält die Einfügereihenfolge)
      while (entries.size > opts.max) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    clear() {
      entries.clear();
    },
  };
  registry.push(cache);
  return cache;
}

/** Leert alle Caches. Für Tests. */
export function clearAllCaches(): void {
  for (const c of registry) c.clear();
}

export async function cachedLookup<T>(
  cache: TtlCache<T>,
  key: string,
  fn: () => Promise<T>,
  isDefinitive: (value: T) => boolean,
): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  if (isDefinitive(value)) cache.set(key, value);
  return value;
}

const ttlSec = Number(process.env.MARKENFREI_CACHE_TTL_SEC);

/** Standard: 10 Minuten. MARKENFREI_CACHE_TTL_SEC=0 schaltet den Cache aus. */
export const DEFAULT_CACHE_TTL_MS =
  Number.isFinite(ttlSec) && ttlSec >= 0 && process.env.MARKENFREI_CACHE_TTL_SEC !== undefined
    ? ttlSec * 1000
    : 10 * 60 * 1000;

export const DEFAULT_CACHE_MAX = 500;
