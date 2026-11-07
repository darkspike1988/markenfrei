/**
 * Datenformat der Live-Probe (probe-status.json): je Quelle nur eine Kennung und ein Status.
 * Bewusst ohne Notizen, Belege, HTTP-Codes und Zufallsnamen. Die Beschriftung einer Quelle kommt erst
 * beim Anzeigen aus STATIC_SOURCES, damit es keine zweite Quellenliste gibt.
 */
import { z } from "zod";

export const PROBE_STATUS_VALUES = ["ok", "warning", "error"] as const;
export type ProbeState = (typeof PROBE_STATUS_VALUES)[number];

export const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export const probeStatusSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    sources: z.array(z.object({ id: z.string().min(1), status: z.enum(PROBE_STATUS_VALUES) }).strict()),
  })
  .strict();

export type ProbeStatus = z.infer<typeof probeStatusSchema>;

/** Eingabe aus der Probe; weitere Felder (Notiz, Namen) werden bewusst nicht übernommen. */
export type ProbeRowInput = { id: string; ok: boolean; level: string };

export function toProbeStatus(rows: readonly ProbeRowInput[], now: Date): ProbeStatus {
  return {
    generatedAt: now.toISOString(),
    sources: rows.map((r) => ({
      id: r.id,
      status: r.ok ? "ok" : r.level === "gate" ? "error" : "warning",
    })),
  };
}

/** Veraltet, wenn der Stand mehr als 14 Tage zurückliegt (genau 14 Tage gilt noch als aktuell). */
export function isStale(generatedAt: string, now: Date): boolean {
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > STALE_AFTER_MS;
}
