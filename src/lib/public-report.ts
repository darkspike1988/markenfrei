import type { ClearanceReport } from "@/lib/clearance";
import {
  buildSignals,
  categoryStatus,
  type CategoryStatus,
  type Signal,
} from "@/lib/verdict";

/**
 * Stabiles, kompaktes Berichtsschema für JSON-Export und MCP (structuredContent).
 * Es enthält nur, was für eine Entscheidung nötig ist. Rohdaten der Quellen bleiben draußen.
 * Bei inkompatiblen Änderungen schemaVersion erhöhen.
 */
export type PublicReport = {
  schemaVersion: 1;
  name: string;
  checkedAt: string;
  verdict: "grün" | "gelb" | "rot";
  verdictLabel: string;
  score: number;
  /** Quellen ohne Antwort. Ein fehlender Treffer dort bedeutet nicht "frei". */
  incomplete: string[];
  categories: CategoryStatus;
  signals: Signal[];
  domains: { tld: string; domain: string; status: "available" | "taken" | "unknown" }[];
  trademark: {
    koelnerPhonetik: string;
    descriptivenessRisk: "niedrig" | "mittel" | "hoch";
    collisions: { brand: string; matchType: string }[];
    niceClasses: { classNumber: number; title: string }[];
    /** Links zur manuellen Recherche. Markenregister werden nicht abgefragt. */
    registryLinks: Record<string, string>;
  };
  appStore: {
    status: "clear" | "similar" | "collision";
    hits: { trackName: string; sellerName: string }[];
    bundleIds: { bundleId: string; apple: string; googlePlay: string }[];
  };
  packages: {
    github: string;
    npm: string;
    pypi: string;
    cratesIo: string;
    homebrew: string;
    go: string;
  };
};

export function toPublicReport(r: ClearanceReport): PublicReport {
  return {
    schemaVersion: 1,
    name: r.name,
    checkedAt: r.checkedAt,
    verdict: r.matrixScore.verdict,
    verdictLabel: r.matrixScore.verdictLabel,
    score: r.matrixScore.totalScore,
    incomplete: r.incomplete,
    categories: categoryStatus(r),
    signals: buildSignals(r),
    domains: r.domains.map((d) => ({ tld: d.tld, domain: d.domain, status: d.status })),
    trademark: {
      koelnerPhonetik: r.trademark.koelnerPhonetik,
      descriptivenessRisk: r.trademark.descriptivenessRisk,
      collisions: r.trademark.protectedCollisions.map((c) => ({
        brand: c.brand,
        matchType: c.matchType,
      })),
      niceClasses: r.trademark.niceClasses.map((c) => ({
        classNumber: c.classNumber,
        title: c.title,
      })),
      registryLinks: { ...r.trademark.registryLinks },
    },
    appStore: {
      status: r.appStore.status,
      hits: r.appStore.hits.map((h) => ({ trackName: h.trackName, sellerName: h.sellerName })),
      bundleIds: r.appStore.bundleIds.map((b) => ({
        bundleId: b.bundleId,
        apple: b.appleStatus,
        googlePlay: b.googlePlayStatus,
      })),
    },
    packages: {
      github: r.devAndSocial.githubHandle,
      npm: r.devAndSocial.npmPackage,
      pypi: r.devAndSocial.pypiPackage,
      cratesIo: r.devAndSocial.cratesIo,
      homebrew: r.devAndSocial.homebrew,
      go: r.devAndSocial.golangModule,
    },
  };
}
