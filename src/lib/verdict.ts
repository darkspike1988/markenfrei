import type { ClearanceReport } from "@/app/api/clearance/route";

export type Tone = "ok" | "warn" | "bad";

export type Signal = { tone: Tone; text: string };

export const VERDICT: Record<
  ClearanceReport["matrixScore"]["verdict"],
  { tone: Tone; label: string }
> = {
  grün: { tone: "ok", label: "Wahrscheinlich frei" },
  gelb: { tone: "warn", label: "Prüfen" },
  rot: { tone: "bad", label: "Konflikt" },
};

export const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
};

export const TONE_DOT: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};

/**
 * Verdichtet die Rohdaten eines Reports zu wenigen lesbaren Aussagen.
 * Reihenfolge: schwerwiegendste zuerst.
 */
export function buildSignals(r: ClearanceReport): Signal[] {
  const out: Signal[] = [];

  const collision = r.trademark.protectedCollisions[0];
  if (collision) {
    out.push({ tone: "bad", text: collision.note });
  }

  if (r.appStore.status === "collision") {
    const hit = r.appStore.hits.find((h) => h.exactOrPhoneticMatch);
    out.push({
      tone: "bad",
      text: `Im deutschen App Store gibt es bereits „${hit?.trackName ?? "eine App"}“ mit gleichem oder klanggleichem Namen.`,
    });
  } else if (r.appStore.status === "similar") {
    out.push({
      tone: "warn",
      text: `Ähnliche Apps im App Store: ${r.appStore.hits
        .slice(0, 2)
        .map((h) => h.trackName)
        .join(", ")}.`,
    });
  }

  if (r.trademark.descriptivenessRisk === "hoch") {
    out.push({ tone: "warn", text: r.trademark.descriptivenessNote });
  }

  const brandHits = r.wikidataHits.filter((w) => w.isBrandOrSoftware);
  if (brandHits.length > 0) {
    out.push({
      tone: "warn",
      text: `Wikidata kennt gleichnamige Einträge: ${brandHits
        .slice(0, 2)
        .map((w) => `${w.label} (${w.description})`)
        .join("; ")}.`,
    });
  }

  if (r.aiGroundedTm && r.aiGroundedTm.riskScore <= 6) {
    out.push({
      tone: r.aiGroundedTm.riskScore <= 3 ? "bad" : "warn",
      text: r.aiGroundedTm.notes || "Websuche meldet mögliche Marken-Treffer.",
    });
  }

  const free = r.domains.filter((d) => d.status === "available");
  if (free.length === 0 && r.domains.every((d) => d.status === "taken")) {
    out.push({ tone: "warn", text: "Keine der gewählten Domains ist frei." });
  }

  if (r.devAndSocial.npmPackage === "taken") {
    out.push({ tone: "warn", text: "Der npm-Paketname ist bereits vergeben." });
  }

  if (r.incomplete?.length) {
    out.push({
      tone: "warn",
      text: `Nicht geprüft, weil keine Antwort kam: ${r.incomplete.join(", ")}. Kein Treffer heißt dort nicht „frei“.`,
    });
  }

  if (out.length === 0) {
    out.push({
      tone: "ok",
      text: "Keine Konflikte in den geprüften Quellen gefunden.",
    });
  }

  const rank: Record<Tone, number> = { bad: 0, warn: 1, ok: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
