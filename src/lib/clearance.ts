import {
  analyzeTrademarkSafety,
  koelnerPhonetik,
  type TrademarkAnalysis,
} from "@/lib/phonetics";
import {
  computeWeightedClearanceScore,
  getRegistrarLinks,
  scoreDodoBrandability,
  type AgentCriteriaScores,
  type DodoDomainScore,
} from "@/lib/scoring";
import { dohLookup } from "@/lib/doh";
import {
  auditCandidateBundleIds,
  type AppBundleCheckResult,
} from "@/lib/rea";
import {
  compareDomainPrices,
  type TldPriceComparison,
} from "@/lib/domain-pricing";

export const MARKENFREI_UA =
  "Markenfrei/1.0 (+https://markenfrei.app; https://github.com/darkspike1988/markenfrei; Namens-Vorpruefung)";

export type TldCheckResult = {
  tld: string;
  domain: string;
  status: "available" | "taken" | "unknown";
  method: "rdap";
  registrarLinks: ReturnType<typeof getRegistrarLinks>;
};

export type AppStoreHit = {
  trackName: string;
  sellerName: string;
  primaryGenreName: string;
  artworkUrl60: string;
  trackViewUrl: string;
  exactOrPhoneticMatch: boolean;
};

export type WikidataHit = {
  id: string;
  label: string;
  description: string;
  url: string;
  isBrandOrSoftware: boolean;
};

export type WikipediaHit = {
  title: string;
  description: string;
  extract: string;
  url: string;
};

export type DuckDuckGoHit = {
  heading: string;
  abstract: string;
  entity: string;
};

export type GitHubRepoHit = {
  fullName: string;
  stars: number;
  description: string;
  url: string;
};

export type ClearanceReport = {
  name: string;
  tagline?: string;
  category?: string;
  checkedAt: string;
  domains: TldCheckResult[];
  trademark: TrademarkAnalysis;
  wikidataHits: WikidataHit[];
  wikipediaHit?: WikipediaHit | null;
  duckDuckGoHit?: DuckDuckGoHit | null;
  domainPrices: Record<string, TldPriceComparison | null>;
  /** Quellen, die nicht antworteten. Ein Ergebnis ohne Treffer bedeutet dort NICHT "frei". */
  incomplete: string[];
  appStore: {
    status: "clear" | "similar" | "collision";
    hits: AppStoreHit[];
    bundleIds: AppBundleCheckResult[];
  };
  devAndSocial: {
    githubHandle: "available" | "taken" | "unknown";
    npmPackage: "available" | "taken" | "unknown";
    pypiPackage: "available" | "taken" | "unknown";
    cratesIo: "available" | "taken" | "unknown";
    homebrew: "available" | "taken" | "unknown";
    golangModule: "available" | "taken" | "unknown";
    topRepos: GitHubRepoHit[];
  };
  dodoBrandability: DodoDomainScore;
  matrixScore: {
    criteria: AgentCriteriaScores;
    totalScore: number;
    verdict: "grün" | "gelb" | "rot";
    verdictLabel: string;
  };
};

/**
 * Autoritative RDAP-Server je Endung (Quelle: IANA-Bootstrap https://data.iana.org/rdap/dns.json).
 * Gegen bekannte und frei erfundene Domains geprüft: 200 = registriert, 404 = frei.
 * Neue Endungen nur eintragen, wenn sie im IANA-Bootstrap stehen und beide Antworten
 * geprüft wurden. Für .jp gibt es dort keinen Eintrag, daher fehlt es hier absichtlich.
 */
export const RDAP_BASE: Record<string, string> = {
  de: "https://rdap.denic.de/domain/",
  com: "https://rdap.verisign.com/com/v1/domain/",
  net: "https://rdap.verisign.com/net/v1/domain/",
  app: "https://pubapi.registry.google/rdap/domain/",
  dev: "https://pubapi.registry.google/rdap/domain/",
  io: "https://rdap.identitydigital.services/rdap/domain/",
  ai: "https://rdap.identitydigital.services/rdap/domain/",
  fr: "https://rdap.nic.fr/domain/",
  uk: "https://rdap.nominet.uk/uk/domain/",
  kr: "https://rdap.nic.or.kr/domain/",
};

export async function rdapLookup(
  url: string,
): Promise<"available" | "taken" | "unknown"> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/rdap+json" },
        redirect: "follow",
        signal: AbortSignal.timeout(4000),
      });
      if (res.status === 404) return "available";
      if (res.status >= 200 && res.status < 300) return "taken";
      if (res.status !== 429) return "unknown";
    } catch {
      /* Netzwerkfehler: erneut versuchen */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return "unknown";
}

/**
 * Verfügbarkeit primär über autoritative Registry-Auskunft (RDAP).
 * Bei RDAP-Ausfall/Rate-Limit greift autoritatives DNS-over-HTTPS (DoH).
 */
export async function checkSingleDomain(name: string, tld: string): Promise<TldCheckResult> {
  const domain = `${name}.${tld}`;
  const registrarLinks = getRegistrarLinks(domain);
  // hasOwn: verhindert Treffer auf Object-Eigenschaften wie "constructor"
  const base = Object.hasOwn(RDAP_BASE, tld) ? RDAP_BASE[tld] : undefined;

  let status = base
    ? await rdapLookup(`${base}${encodeURIComponent(domain)}`)
    : "unknown";

  // Wenn RDAP keine definitive Auskunft liefert, DoH-Abfrage auf NS/SOA-Einträge
  if (status === "unknown") {
    const doh = await dohLookup(domain);
    if (doh.status === "taken") {
      status = "taken";
    }
  }

  return { tld, domain, status, method: "rdap", registrarLinks };
}

/**
 * Queries Wikidata Open Data API for existing companies, brands, software, or trademarks
 */
export async function checkWikidata(
  name: string,
): Promise<{ hits: WikidataHit[]; ok: boolean }> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
      name,
    )}&language=de&uselang=de&format=json&limit=6`;
    let res = await fetch(url, {
      headers: { "User-Agent": MARKENFREI_UA },
      signal: AbortSignal.timeout(3500),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 900));
      res = await fetch(url, {
        headers: { "User-Agent": MARKENFREI_UA },
        signal: AbortSignal.timeout(3500),
      });
    }
    if (!res.ok) return { hits: [], ok: false };
    const data = await res.json();
    const items = Array.isArray(data?.search) ? data.search : [];

    const hits: WikidataHit[] = [];
    for (const item of items) {
      const label = String(item.label || "");
      const desc = String(item.description || "");
      if (!label) continue;

      const isBrandOrSoftware =
        /(unternehmen|firma|marke|software|app|website|konzern|plattform|dienst|company|brand|trademark|application|video game|bank|startup)/i.test(
          desc,
        ) || label.toLowerCase() === name.toLowerCase();

      hits.push({
        id: String(item.id || ""),
        label,
        description: desc || "Wikidata-Eintrag",
        url: `https://www.wikidata.org/wiki/${encodeURIComponent(item.id)}`,
        isBrandOrSoftware,
      });
    }
    return { hits, ok: true };
  } catch {
    return { hits: [], ok: false };
  }
}

/**
 * Queries Wikipedia REST API (de.wikipedia.org) for existing notable entities/brands
 */
export async function checkWikipedia(name: string): Promise<WikipediaHit | null> {
  try {
    const url = `https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      name,
    )}`;
    const res = await fetch(url, {
      headers: { "User-Agent": MARKENFREI_UA },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.title || data?.type === "disambiguation") return null;
    return {
      title: String(data.title || ""),
      description: String(data.description || ""),
      extract: String(data.extract || "").slice(0, 180),
      url: String(
        data?.content_urls?.desktop?.page ||
          `https://de.wikipedia.org/wiki/${encodeURIComponent(name)}`,
      ),
    };
  } catch {
    return null;
  }
}

/**
 * Queries DuckDuckGo Instant Answer Open API for zero-click brand abstracts
 */
export async function checkDuckDuckGo(name: string): Promise<DuckDuckGoHit | null> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      name,
    )}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": MARKENFREI_UA },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.Heading && !data?.Abstract) return null;
    return {
      heading: String(data.Heading || ""),
      abstract: String(data.Abstract || "").slice(0, 180),
      entity: String(data.Entity || ""),
    };
  } catch {
    return null;
  }
}

/**
 * Queries Apple iTunes Search API (DE App Store) for Werktitelschutz (§ 5 Abs. 3 MarkenG)
 */
export async function checkAppleAppStore(name: string): Promise<{
  ok: boolean;
  status: "clear" | "similar" | "collision";
  hits: AppStoreHit[];
}> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
      name,
    )}&country=de&entity=software&limit=5`;
    const res = await fetch(url, {
      headers: { "User-Agent": MARKENFREI_UA },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return { ok: false, status: "clear", hits: [] };
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    const targetKp = koelnerPhonetik(name);
    let hasExactCollision = false;

    const hits: AppStoreHit[] = results.map((app: Record<string, unknown>) => {
      const trackName = String(app.trackName || "");
      const mainTitle = trackName
        .split(/[:\-–|]/)[0]
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const exactOrPhoneticMatch =
        mainTitle === name.toLowerCase() ||
        (targetKp.length >= 3 && koelnerPhonetik(mainTitle) === targetKp);

      if (exactOrPhoneticMatch) {
        hasExactCollision = true;
      }

      return {
        trackName,
        sellerName: String(app.sellerName || ""),
        primaryGenreName: String(app.primaryGenreName || "App"),
        artworkUrl60: String(app.artworkUrl60 || ""),
        trackViewUrl: String(app.trackViewUrl || ""),
        exactOrPhoneticMatch,
      };
    });

    const status = hasExactCollision
      ? "collision"
      : hits.length > 0
        ? "similar"
        : "clear";

    return { ok: true, status, hits };
  } catch {
    return { ok: false, status: "clear", hits: [] };
  }
}

/**
 * Checks GitHub user/org handle, top GitHub repos, npm registry, and PyPI registry
 */
export async function checkDevAndSocial(name: string): Promise<ClearanceReport["devAndSocial"]> {
  const ghHeaders: Record<string, string> = {
    "User-Agent": MARKENFREI_UA,
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const [ghUserRes, npmRes, pypiRes, cratesRes, brewRes, goRes, ghRepoRes] = await Promise.allSettled([
    fetch(`https://api.github.com/users/${encodeURIComponent(name)}`, {
      headers: ghHeaders,
      signal: AbortSignal.timeout(3000),
    }),
    fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      headers: { "User-Agent": MARKENFREI_UA },
      signal: AbortSignal.timeout(3000),
    }),
    fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      headers: { "User-Agent": MARKENFREI_UA },
      signal: AbortSignal.timeout(3000),
    }),
    fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`, {
      headers: { "User-Agent": MARKENFREI_UA },
      signal: AbortSignal.timeout(3000),
    }),
    fetch(`https://formulae.brew.sh/api/formula/${encodeURIComponent(name)}.json`, {
      headers: { "User-Agent": MARKENFREI_UA },
      signal: AbortSignal.timeout(3000),
    }),
    fetch(`https://proxy.golang.org/${encodeURIComponent(name)}/@v/list`, {
      headers: { "User-Agent": MARKENFREI_UA },
      signal: AbortSignal.timeout(3000),
    }),
    fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(
        name,
      )}+in:name&sort=stars&order=desc&per_page=3`,
      {
        headers: ghHeaders,
        signal: AbortSignal.timeout(3000),
      },
    ),
  ]);

  const mapStatus = (
    settled: PromiseSettledResult<Response>,
  ): "available" | "taken" | "unknown" => {
    if (settled.status !== "fulfilled") return "unknown";
    if (settled.value.status === 404) return "available";
    if (settled.value.status === 200) return "taken";
    return "unknown";
  };

  let topRepos: GitHubRepoHit[] = [];
  if (ghRepoRes.status === "fulfilled" && ghRepoRes.value.ok) {
    try {
      const repoJson = await ghRepoRes.value.json();
      if (Array.isArray(repoJson?.items)) {
        topRepos = repoJson.items.slice(0, 3).map((r: Record<string, unknown>) => ({
          fullName: String(r.full_name || ""),
          stars: Number(r.stargazers_count || 0),
          description: String(r.description || "").slice(0, 100),
          url: String(r.html_url || ""),
        }));
      }
    } catch {
      // ignore
    }
  }

  return {
    githubHandle: mapStatus(ghUserRes),
    npmPackage: mapStatus(npmRes),
    pypiPackage: mapStatus(pypiRes),
    cratesIo: mapStatus(cratesRes),
    homebrew: mapStatus(brewRes),
    golangModule: mapStatus(goRes),
    topRepos,
  };
}

export type PerformClearanceOptions = {
  name: string;
  tagline?: string;
  category?: string;
  description?: string;
  keywords?: string[];
  tlds?: string[];
};

/**
 * Central clearance execution engine used by both REST API and MCP Server
 */
export async function performClearanceCheck(
  options: PerformClearanceOptions,
): Promise<ClearanceReport> {
  const rawName = String(options.name || "").trim();
  const clean = rawName
    .toLowerCase()
    .replace(/\.[a-z]+$/, "")
    .replace(/[^a-z0-9-]/g, "");

  if (!clean || clean.length < 2) {
    throw new Error("Bitte einen gültigen Namen (mind. 2 Zeichen) angeben.");
  }

  const tlds: string[] =
    Array.isArray(options.tlds) && options.tlds.length > 0
      ? options.tlds
      : ["de", "com", "app", "ai", "io"];

  const description = String(options.description || "");
  const keywords = Array.isArray(options.keywords) ? options.keywords : [];

  // Run all live checks in parallel!
  const [
    domains,
    wikidata,
    wikipediaHit,
    duckDuckGoHit,
    appStoreRaw,
    candidateBundleIds,
    devAndSocial,
  ] = await Promise.all([
    Promise.all(tlds.map((tld) => checkSingleDomain(clean, tld))),
    checkWikidata(clean),
    checkWikipedia(clean),
    checkDuckDuckGo(clean),
    checkAppleAppStore(clean),
    auditCandidateBundleIds(clean),
    checkDevAndSocial(clean),
  ]);

  const wikidataHits = wikidata.hits;
  const { ok: appStoreOk, ...appStoreBase } = appStoreRaw;
  const anyBundleTaken = candidateBundleIds.some(
    (b) => b.appleStatus === "taken" || b.googlePlayStatus === "taken",
  );

  const appStore = {
    ...appStoreBase,
    bundleIds: candidateBundleIds,
  };

  // Calculate domain price comparisons for all requested TLDs
  const domainPrices: Record<string, TldPriceComparison | null> = {};
  for (const tld of tlds) {
    domainPrices[tld] = compareDomainPrices(`${clean}.${tld}`);
  }

  const incomplete: string[] = [];
  if (domains.every((d) => d.status === "unknown")) incomplete.push("Domains");
  else if (domains.some((d) => d.status === "unknown"))
    incomplete.push("einzelne Domains");
  if (!wikidata.ok) incomplete.push("Wikidata");
  if (!appStoreOk) incomplete.push("App Store");
  if (
    candidateBundleIds.every(
      (b) => b.appleStatus === "unknown" && b.googlePlayStatus === "unknown",
    )
  )
    incomplete.push("Bundle-IDs");
  if (
    devAndSocial.npmPackage === "unknown" &&
    devAndSocial.githubHandle === "unknown" &&
    devAndSocial.pypiPackage === "unknown"
  )
    incomplete.push("Entwickler-Namensräume");

  const trademark = analyzeTrademarkSafety(clean, description, keywords);
  const dodoBrandability = scoreDodoBrandability(
    `${clean}.${tlds[0] || "de"}`,
  );

  // Compute TM safety score (1..10, 10 = safest)
  let tmRiskScore = 9;
  if (trademark.protectedCollisions.length > 0) {
    const hasExactOrPhonetic = trademark.protectedCollisions.some(
      (c) => c.matchType === "identisch" || c.matchType === "klangidentisch",
    );
    tmRiskScore = hasExactOrPhonetic ? 1 : 3;
  } else {
    if (trademark.descriptivenessRisk === "hoch") tmRiskScore -= 3;
    else if (trademark.descriptivenessRisk === "mittel") tmRiskScore -= 1;

    const brandWikidataHits = wikidataHits.filter((w) => w.isBrandOrSoftware);
    if (brandWikidataHits.length >= 2) tmRiskScore -= 3;
    else if (brandWikidataHits.length === 1) tmRiskScore -= 2;

    if (wikipediaHit) tmRiskScore = Math.max(1, tmRiskScore - 2);
    if (duckDuckGoHit) tmRiskScore = Math.max(1, tmRiskScore - 1);
  }

  // Compute App Store Werktitelschutz score (1..10).
  // Ohne Antwort des App Stores gilt ein neutraler Wert, nicht die Bestnote.
  let appStoreScore = appStoreOk ? 10 : 5;
  if (appStore.status === "collision") {
    appStoreScore = 2;
  } else if (appStore.status === "similar") {
    appStoreScore = 7;
  }
  if (anyBundleTaken) {
    appStoreScore = Math.min(appStoreScore, 5);
  }

  // Compute Dev & Social handle score (1..10)
  let freeHandles = 0;
  let knownHandles = 0;
  for (const st of [
    devAndSocial.githubHandle,
    devAndSocial.npmPackage,
    devAndSocial.pypiPackage,
  ]) {
    if (st === "available") {
      freeHandles++;
      knownHandles++;
    } else if (st === "taken") {
      knownHandles++;
    }
  }
  const highStarRepo = devAndSocial.topRepos.some(
    (r) =>
      r.fullName.split("/")[1]?.toLowerCase() === clean && r.stars >= 100,
  );
  // Ohne bekannte Handles (alle Quellen ohne Antwort) neutral bewerten, nicht gut
  let socialDevScore =
    knownHandles > 0 ? Math.round(3 + (freeHandles / knownHandles) * 7) : 5;
  if (highStarRepo) socialDevScore = Math.max(2, socialDevScore - 3);

  // Domain availability ratio
  const availableCount = domains.filter((d) => d.status === "available").length;
  const domainAvailableRatio =
    domains.length > 0 ? availableCount / domains.length : 0;
  const primaryDomainsFree = domains.some(
    (d) => (d.tld === "de" || d.tld === "com") && d.status === "available",
  );

  const matrixScore = computeWeightedClearanceScore({
    word: clean,
    domainAvailableRatio,
    primaryDomainsFree,
    tmRiskScore,
    appStoreScore,
    socialDevScore,
  });

  // Ein "grün" darf es nur geben, wenn die wesentlichen Quellen geantwortet haben.
  // Der Score bleibt dann unter 80, damit Zahl und Ampel zusammenpassen.
  if (incomplete.length > 0) {
    matrixScore.totalScore = Math.min(matrixScore.totalScore, 79);
    if (matrixScore.verdict === "grün") {
      matrixScore.verdict = "gelb";
      matrixScore.verdictLabel = `Unvollständig geprüft (${incomplete.join(", ")})`;
    }
  }

  return {
    name: clean,
    tagline: options.tagline,
    category: options.category,
    checkedAt: new Date().toISOString(),
    domains,
    trademark,
    wikidataHits,
    wikipediaHit,
    duckDuckGoHit,
    domainPrices,
    incomplete,
    appStore,
    devAndSocial,
    dodoBrandability,
    matrixScore,
  };
}
