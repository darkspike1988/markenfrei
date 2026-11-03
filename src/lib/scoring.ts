/**
 * Combined Brandability & Legal Clearance Scoring Engine
 * Merges:
 * 1) r13i/dodomains deterministic 6-factor Brandability Breakdown (0–100)
 * 2) faizul666/domain-search-agent weighted 10-criteria Matrix Score (0–100)
 * 3) German/EU Trademark & App Store (Werktitelschutz § 5 MarkenG) signals
 */

export type DodoBrandabilityBreakdown = {
  length: number; // max 25
  pronounceability: number; // max 25
  hyphens: number; // max 15
  digits: number; // max 15
  tldTier: number; // max 15
  typoRisk: number; // max 5
};

export type DodoDomainScore = {
  domain: string;
  score: number;
  breakdown: DodoBrandabilityBreakdown;
  notes: string[];
};

export type AgentCriteriaScores = {
  brandable: number; // 1-10 (weight 10)
  short: number; // 1-10 (weight 9)
  spell: number; // 1-10 (weight 9)
  domain: number; // 1-10 (weight 10)
  tm: number; // 1-10 (weight 12 - elevated for legal safety)
  appStore: number; // 1-10 (weight 9 - Werktitelschutz § 5 MarkenG)
  social: number; // 1-10 (weight 8 - GitHub/npm/PyPI)
  future: number; // 1-10 (weight 8)
  pron: number; // 1-10 (weight 8)
  pro: number; // 1-10 (weight 7)
};

export const AGENT_CRITERIA: {
  key: keyof AgentCriteriaScores;
  label: string;
  weight: number;
  hint: string;
}[] = [
  { key: "tm", label: "Markenrecht-Safe", weight: 12, hint: "Kollisionsfreiheit (Marken, Wikidata, Phonetik & § 8 MarkenG)" },
  { key: "domain", label: "Domains frei", weight: 10, hint: "Echtzeit-Verfügbarkeit via RDAP & DNS (.de, .com, .app, .ai)" },
  { key: "brandable", label: "Brandability", weight: 10, hint: "Eigenständiger Markencharakter & Klangbild" },
  { key: "appStore", label: "App-Store frei", weight: 9, hint: "Keine gleichnamige App im deutschen Apple App Store (§ 5 MarkenG)" },
  { key: "short", label: "Kürze", weight: 9, hint: "Ideale Zeichenlänge (4–8 Buchstaben)" },
  { key: "spell", label: "Schreibbarkeit", weight: 9, hint: "Keine Tippfehler-Fallen oder unklaren Buchstabenfolgen" },
  { key: "social", label: "Tech & Handles", weight: 8, hint: "GitHub Org/Repos, npm & PyPI Paketnamen frei" },
  { key: "future", label: "Zukunftssicher", weight: 8, hint: "Kein kurzlebiger Mode-Suffix, skaliert bei Produkt-Erweiterung" },
  { key: "pron", label: "Aussprache", weight: 8, hint: "Guter Vokal-Konsonanten-Fluss (DE & EN)" },
  { key: "pro", label: "Seriosität", weight: 7, hint: "Professionelle Wirkung ohne Spam-Muster" },
];

const TOP_TLD = ["com", "de"];
const SECOND_TIER_TLD = ["io", "dev", "app", "ai", "eu", "co", "net", "org"];
const VOWELS = /[aeiouyäöü]/;
const CONSONANT_RUN_4 = /[^aeiouyäöü0-9-]{4,}/;
const CONSONANT_RUN_3 = /[^aeiouyäöü0-9-]{3}/;
const HOMOGLYPHS = ["rn", "vv", "cl"];

const clamp = (n: number, a = 1, b = 10) => Math.max(a, Math.min(b, n));

/**
 * 1. r13i/dodomains Brandability Scorer (translated to German notes)
 */
export function scoreDodoBrandability(domain: string): DodoDomainScore {
  const lower = domain.trim().toLowerCase();
  const dot = lower.indexOf(".");
  const name = dot === -1 ? lower : lower.slice(0, dot);
  const tld = dot === -1 ? "de" : lower.slice(dot + 1);
  const notes: string[] = [];

  // Length (max 25)
  let lengthScore = 25;
  const n = name.length;
  if (n >= 4 && n <= 10) {
    lengthScore = 25;
  } else if (n < 4) {
    notes.push("Sehr kurze Namen (< 4 Zeichen) sind einprägsam, aber oft als Akronym belegt.");
    lengthScore = 22;
  } else if (n <= 12) {
    notes.push(`${n} Zeichen ist noch gut nutzbar, aber etwas länger für ein App-Icon.`);
    lengthScore = 20;
  } else if (n <= 15) {
    notes.push(`${n} Zeichen wird auf Mobilgeräten oft abgekürzt.`);
    lengthScore = 14;
  } else {
    notes.push(`${n} Zeichen ist recht lang für schnelle Mund-zu-Mund-Empfehlungen.`);
    lengthScore = 8;
  }

  // Pronounceability (max 25)
  let pronScore = 25;
  if (!VOWELS.test(name)) {
    notes.push("Kein Vokal enthalten – schwer flüssig auszusprechen.");
    pronScore -= 15;
  }
  if (CONSONANT_RUN_4.test(name)) {
    notes.push("4+ Konsonanten in Folge erschweren die Aussprache.");
    pronScore -= 10;
  } else if (CONSONANT_RUN_3.test(name)) {
    notes.push("3 Konsonanten in Folge bremsen den Lesefluss leicht.");
    pronScore -= 4;
  }
  pronScore = Math.max(0, pronScore);

  // Hyphens (max 15)
  const hyphenCount = (name.match(/-/g) ?? []).length;
  let hyphenScore = 15;
  if (hyphenCount === 1) {
    notes.push("Bindestrich muss beim Weitererzählen jedes Mal mitgesprochen werden.");
    hyphenScore = 4;
  } else if (hyphenCount > 1) {
    notes.push("Mehrere Bindestriche wirken unmodern und führen zu Tippfehlern.");
    hyphenScore = 0;
  }

  // Digits (max 15)
  let digitScore = 15;
  if (/\d/.test(name)) {
    notes.push("Zahlen im Namen sind am Telefon oder im Podcast missverständlich (Ziffer vs. Wort).");
    digitScore = 6;
  }

  // TLD Tier (max 15)
  let tldScore = 15;
  if (TOP_TLD.includes(tld)) {
    tldScore = 15;
  } else if (SECOND_TIER_TLD.includes(tld)) {
    tldScore = 13;
  } else {
    tldScore = 8;
  }

  // Typo Risk / Homoglyphs (max 5)
  let typoScore = 5;
  for (const pair of HOMOGLYPHS) {
    if (name.includes(pair)) {
      notes.push(`Buchstabenfolge "${pair}" kann in kleinen Schriften leicht verwechselt werden (Homoglyphen-Effekt).`);
      typoScore -= 2;
      break;
    }
  }
  if (/(.)\1\1/.test(name)) {
    notes.push("Drei gleiche Buchstaben hintereinander führen häufig zu Tippfehlern.");
    typoScore -= 2;
  }
  typoScore = Math.max(0, typoScore);

  const breakdown: DodoBrandabilityBreakdown = {
    length: lengthScore,
    pronounceability: pronScore,
    hyphens: hyphenScore,
    digits: digitScore,
    tldTier: tldScore,
    typoRisk: typoScore,
  };

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    domain: `${name}.${tld}`,
    score: Math.max(0, Math.min(100, score)),
    breakdown,
    notes,
  };
}

/**
 * 2. faizul666/domain-search-agent Heuristics + Multi-Vector Clearance Weighted Score
 */
export function estSyllables(w: string): number {
  const clean = w.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 1;
  const groups = clean.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 1;
  if (clean.endsWith("e") && n > 1) n--;
  return Math.max(1, n);
}

export function maxConsonantRun(w: string): number {
  let m = 0;
  let c = 0;
  for (const ch of w.toLowerCase().replace(/[^a-z]/g, "")) {
    if ("aeiouy".includes(ch)) {
      c = 0;
    } else {
      c++;
      m = Math.max(m, c);
    }
  }
  return m;
}

export function computeWeightedClearanceScore(params: {
  word: string;
  domainAvailableRatio: number; // 0..1
  primaryDomainsFree: boolean; // .de or .com free
  tmRiskScore: number; // 1..10 (10 = very safe, 1 = high risk)
  appStoreScore: number; // 1..10 (10 = no collision in App Store, 1 = exact collision)
  socialDevScore: number; // 1..10 (10 = GitHub + npm + PyPI all free)
}): {
  criteria: AgentCriteriaScores;
  totalScore: number;
  verdict: "grün" | "gelb" | "rot";
  verdictLabel: string;
} {
  const w = params.word.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const n = w.replace(/[^a-z0-9]/g, "").length;

  // Short
  let short = 2;
  if (n <= 5) short = 10;
  else if (n <= 6) short = 9;
  else if (n <= 8) short = 8;
  else if (n <= 10) short = 7;
  else if (n <= 12) short = 5;

  // Easy spell
  let spell = 10;
  if (/[0-9]/.test(w)) spell -= 3;
  if (/-/.test(w)) spell -= 2;
  if (/(.)\1\1/.test(w)) spell -= 2;
  if (/(ph|gh|kn|wr|ough|eau)/.test(w)) spell -= 1;
  if (maxConsonantRun(w) >= 4) spell -= 2;
  spell = clamp(spell);

  // Pronounceability
  let pron = 10;
  const run = maxConsonantRun(w);
  if (run >= 5) pron -= 4;
  else if (run >= 4) pron -= 2;
  else if (run >= 3) pron -= 1;
  const syl = estSyllables(w);
  if (syl >= 5) pron -= 3;
  else if (syl >= 4) pron -= 1;
  if (!/[aeiouy]/.test(w)) pron -= 4;
  pron = clamp(pron);

  // Brandable
  let brandable = 7;
  if (n >= 4 && n <= 9) brandable += 2;
  else if (n > 11) brandable -= 1;
  if (!/[0-9-]/.test(w)) brandable += 1;
  if (/(va|ora|era|io|ly|nx|vo|ix|on|ia|eo|ar|is|os|um|us)$/.test(w)) brandable += 1;
  brandable = clamp(brandable);

  // Future-proof
  let future = 10;
  if (/[0-9]/.test(w)) future -= 3;
  if (/(24|360|247|hq|online|web)$/.test(w)) future -= 2;
  if (w.length > 14) future -= 2;
  future = clamp(future);

  // Professional
  let pro = 10;
  if (/[0-9-]/.test(w)) pro -= 2;
  if (/(xx|zz|lol|wtf)/.test(w)) pro -= 4;
  pro = clamp(pro);

  // Domain score (1-10)
  let domain = Math.round(1 + params.domainAvailableRatio * 9);
  if (params.primaryDomainsFree && domain < 8) domain = 8;
  domain = clamp(domain);

  const criteria: AgentCriteriaScores = {
    brandable,
    short,
    spell,
    domain,
    tm: clamp(Math.round(params.tmRiskScore)),
    appStore: clamp(Math.round(params.appStoreScore)),
    social: clamp(Math.round(params.socialDevScore)),
    future,
    pron,
    pro,
  };

  const wSum = AGENT_CRITERIA.reduce((acc, c) => acc + c.weight, 0);
  let weighted = 0;
  for (const c of AGENT_CRITERIA) {
    weighted += criteria[c.key] * c.weight;
  }

  let totalScore = Math.round((weighted / wSum) * 10 * 10) / 10;

  // Hard penalty if severe trademark collision (tm <= 3)
  if (criteria.tm <= 3) {
    totalScore = Math.min(totalScore, 42);
  }

  let verdict: "grün" | "gelb" | "rot" = "gelb";
  let verdictLabel = "Prüfenswert (Einzelne Treffer beachten)";
  if (totalScore >= 80 && criteria.tm >= 7 && criteria.appStore >= 6) {
    verdict = "grün";
    verdictLabel = "Sehr gute Freigabe-Chancen (Grünes Licht)";
  } else if (totalScore < 58 || criteria.tm <= 4 || criteria.appStore <= 3) {
    verdict = "rot";
    verdictLabel = "Erhöhtes Konfliktrisiko (Marke/Werktitel belegt)";
  }

  return {
    criteria,
    totalScore,
    verdict,
    verdictLabel,
  };
}

export function getRegistrarLinks(fullDomain: string) {
  const enc = encodeURIComponent(fullDomain);
  return {
    inwx: `https://www.inwx.de/de/domain/check#search=${enc}`,
    ionos: `https://www.ionos.de/domaincheckresult?domains=${enc}`,
    namecheap: `https://www.namecheap.com/domains/registration/results/?domain=${enc}`,
    Porkbun: `https://porkbun.com/checkout/search?q=${enc}`,
  };
}
