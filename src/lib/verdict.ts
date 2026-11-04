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

export const TONE_LABEL: Record<Tone, string> = {
  ok: "unauffällig",
  warn: "prüfen",
  bad: "Konflikt",
};

export type CategoryStatus = {
  domain: Tone;
  trademark: Tone;
  appStore: Tone;
  packages: Tone;
};

export const CATEGORY_LABEL: Record<keyof CategoryStatus, string> = {
  domain: "Domain",
  trademark: "Marke",
  appStore: "App Store",
  packages: "Pakete",
};

/**
 * Eine Ampelfarbe je Bereich für die Schnellansicht.
 * "ok" gibt es nur, wenn der Bereich geantwortet hat und nichts auffiel.
 */
export function categoryStatus(r: ClearanceReport): CategoryStatus {
  const missing = (label: string) => r.incomplete.includes(label);

  // Domain: alle vergeben = Konflikt, eindeutig frei = ok, sonst prüfen
  let domain: Tone = "warn";
  if (r.domains.length > 0) {
    const free = r.domains.some((d) => d.status === "available");
    const unknown = r.domains.some((d) => d.status === "unknown");
    if (r.domains.every((d) => d.status === "taken")) domain = "bad";
    else if (free && !unknown) domain = "ok";
  }

  // Marke: identische oder klanggleiche Treffer sind ein Konflikt
  let trademark: Tone = "ok";
  const collisions = r.trademark.protectedCollisions;
  if (collisions.some((c) => c.matchType === "identisch" || c.matchType === "klangidentisch")) {
    trademark = "bad";
  } else if (
    collisions.length > 0 ||
    r.trademark.descriptivenessRisk === "hoch" ||
    r.wikidataHits.some((w) => w.isBrandOrSoftware) ||
    r.wikipediaHit ||
    missing("Wikidata")
  ) {
    trademark = "warn";
  }

  let appStore: Tone = "ok";
  if (r.appStore.status === "collision") appStore = "bad";
  else if (
    r.appStore.status === "similar" ||
    r.appStore.bundleIds.some((b) => b.appleStatus === "taken" || b.googlePlayStatus === "taken") ||
    missing("App Store") ||
    missing("Bundle-IDs")
  ) {
    appStore = "warn";
  }

  const d = r.devAndSocial;
  const packages: Tone =
    [d.githubHandle, d.npmPackage, d.pypiPackage, d.cratesIo].includes("taken") ||
    missing("Entwickler-Namensräume")
      ? "warn"
      : "ok";

  return { domain, trademark, appStore, packages };
}

/** Die wichtigsten Gründe für die Ampelfarbe, schwerwiegendste zuerst. */
export function topSignals(r: ClearanceReport, n = 3): Signal[] {
  return buildSignals(r).slice(0, n);
}

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
