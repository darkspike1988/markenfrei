/**
 * German & International Phonetic + Trademark Law Analysis (§ 8 & § 9 MarkenG)
 * Implements Kölner Phonetik (German sound-alike code), Soundex, Levenshtein,
 * Phonetic Twin generation, and Nice Classification (Nizza-Klassen) mapping.
 */

import { foldToAscii } from "@/lib/name";

export type NiceClassInfo = {
  classNumber: number;
  title: string;
  reason: string;
  officialScope: string;
};

export type ProtectedCollision = {
  brand: string;
  matchType: "identisch" | "enthalten" | "klangidentisch" | "tippfehler-nah";
  phoneticMatch: boolean;
  note: string;
};

export type TrademarkAnalysis = {
  cleanName: string;
  koelnerPhonetik: string;
  soundex: string;
  phoneticTwins: string[];
  descriptivenessRisk: "niedrig" | "mittel" | "hoch";
  descriptivenessNote: string;
  distinctivenessType: "Fantasiename (Stark)" | "Kompositum / Anlehnung (Mittel)" | "Beschreibend (Schwach - § 8 MarkenG Risiko)";
  protectedCollisions: ProtectedCollision[];
  niceClasses: NiceClassInfo[];
  dpmaExpertQuery: string;
  officialFees: {
    dpma: string;
    euipo: string;
    uspto: string;
  };
  registryLinks: {
    dpma: string;
    euipo: string;
    tmview: string;
    /** TMDB: kostenlose Markensuche der IP Central GmbH, Daten von EUIPO, DPMA, IGE, WIPO, USPTO. Nur zur manuellen Recherche. */
    tmdb: string;
    wipo: string;
    uspto: string;
    offeneRegister: string;
    unternehmensregister: string;
  };
};

/**
 * Kölner Phonetik (Hans Joachim Postel, 1969)
 * Standard-Algorithmus für deutsche Klangähnlichkeit (z. B. "Klarna" == "Clarna" -> "4576").
 */
export function koelnerPhonetik(input: string): string {
  const word = input
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/ph/g, "f")
    .replace(/[^a-z]/g, "");

  if (!word) return "";

  const codes: string[] = [];
  const len = word.length;

  for (let i = 0; i < len; i++) {
    const ch = word[i];
    const prev = i > 0 ? word[i - 1] : "";
    const next = i < len - 1 ? word[i + 1] : "";

    let code = "";
    if ("aeijouy".includes(ch)) {
      code = "0";
    } else if (ch === "h") {
      code = "";
    } else if (ch === "b" || (ch === "p" && next !== "h")) {
      code = "1";
    } else if ((ch === "d" || ch === "t") && !"csz".includes(next)) {
      code = "2";
    } else if ("fvw".includes(ch) || (ch === "p" && next === "h")) {
      code = "3";
    } else if ("gkq".includes(ch)) {
      code = "4";
    } else if (ch === "c") {
      if (i === 0) {
        code = "ahkloqrux".includes(next) ? "4" : "8";
      } else {
        if ("sz".includes(prev)) {
          code = "8";
        } else {
          code = "ahkoqux".includes(next) ? "4" : "8";
        }
      }
    } else if (ch === "x") {
      code = "ckq".includes(prev) ? "8" : "48";
    } else if (ch === "l") {
      code = "5";
    } else if (ch === "m" || ch === "n") {
      code = "6";
    } else if (ch === "r") {
      code = "7";
    } else if ("sz".includes(ch)) {
      code = "8";
    } else if ((ch === "d" || ch === "t") && "csz".includes(next)) {
      code = "8";
    }

    for (const digit of code) {
      codes.push(digit);
    }
  }

  // Mehrfache benachbarte gleiche Ziffern zusammenfassen
  const deduped: string[] = [];
  for (const c of codes) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== c) {
      deduped.push(c);
    }
  }

  // Alle "0" entfernen außer am Anfang
  const result = deduped
    .filter((digit, idx) => digit !== "0" || idx === 0)
    .join("");

  return result || "0";
}

/**
 * Soundex für englische/internationale Klangähnlichkeit
 */
export function soundex(input: string): string {
  const s = input.toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "0000";

  const first = s[0];
  const map: Record<string, string> = {
    B: "1", F: "1", P: "1", V: "1",
    C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
    D: "3", T: "3",
    L: "4",
    M: "5", N: "5",
    R: "6",
  };

  let out = first;
  let lastCode = map[first] || "";

  for (let i = 1; i < s.length && out.length < 4; i++) {
    const ch = s[i];
    const code = map[ch] || "";
    if (code && code !== lastCode) {
      out += code;
    }
    if (!"HW".includes(ch)) {
      lastCode = code;
    }
  }

  return (out + "000").slice(0, 4);
}

/**
 * Levenshtein-Distanz für Schriftbild-Ähnlichkeit
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

/**
 * Erzeugt klanggleiche Schreibvarianten (Phonetische Zwillinge),
 * nach denen Markenprüfer und Abmahnanwälte suchen (§ 9 MarkenG).
 */
export function generatePhoneticTwins(word: string): string[] {
  const clean = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean.length < 3) return [];

  const variants = new Set<string>();

  const rules: [RegExp, string][] = [
    [/k/g, "c"],
    [/c(?=[aou])/g, "k"],
    [/v/g, "f"],
    [/f/g, "v"],
    [/ph/g, "f"],
    [/z/g, "s"],
    [/s(?=[aeiou])/g, "z"],
    [/ai/g, "ei"],
    [/ei/g, "ai"],
    [/y/g, "i"],
    [/i$/g, "y"],
    [/x/g, "ks"],
    [/ks/g, "x"],
    [/qu/g, "kw"],
  ];

  for (const [pattern, replacement] of rules) {
    const replaced = clean.replace(pattern, replacement);
    if (replaced !== clean && replaced.length >= 3) {
      variants.add(replaced);
    }
  }

  return Array.from(variants).slice(0, 6);
}

/**
 * Bekannte geschützte Marken im Tech-, App- & SaaS-Bereich (Kollisions-Wächter)
 */
const PROTECTED_TECH_BRANDS = [
  "apple", "google", "amazon", "microsoft", "meta", "netflix", "spotify",
  "tesla", "uber", "airbnb", "paypal", "stripe", "klarna", "revolut",
  "notion", "figma", "canva", "linear", "vercel", "supabase", "github",
  "gitlab", "docker", "kubernetes", "openai", "anthropic", "claude",
  "gemini", "deepseek", "mistral", "perplexity", "midjourney", "slack",
  "discord", "zoom", "shopify", "zalando", "sap", "siemens", "allianz",
  "telekom", "vodafone", "personio", "celonis", "n26", "traderepublic",
  "sumup", "deepl", "teamviewer", "anydesk", "bitwarden", "1password",
  "dropbox", "box", "asana", "trello", "jira", "atlassian", "hubspot",
  "salesforce", "zendesk", "intercom", "twilio", "cloudflare", "datadog",
  "sentry", "posthog", "raycast", "obsidian", "logseq", "todoist",
  "duolingo", "babbel", "strava", "komoot", "doctolib", "instagram",
  "tiktok", "whatsapp", "telegram", "signal", "snapchat", "pinterest",
  "reddit", "linkedin", "youtube", "twitch", "nintendo", "playstation",
];

/**
 * Rein beschreibende deutsche & englische Gattungsbegriffe (§ 8 Abs. 2 Nr. 1 & 2 MarkenG)
 */
const DESCRIPTIVE_ROOTS = [
  "app", "web", "cloud", "tool", "software", "system", "portal", "online",
  "digital", "smart", "easy", "pro", "plus", "max", "super", "best", "top",
  "direct", "direkt", "planer", "manager", "rechner", "check", "checker",
  "finder", "search", "suche", "helper", "hilfe", "service", "agent",
  "studio", "lab", "labs", "hub", "base", "data", "tech", "net", "bot",
];

export function analyzeTrademarkSafety(
  rawName: string,
  description = "",
  keywords: string[] = [],
): TrademarkAnalysis {
  const cleanName = foldToAscii(rawName).replace(/[^a-z0-9]/g, "");
  const kp = koelnerPhonetik(cleanName);
  const sdx = soundex(cleanName);
  const twins = generatePhoneticTwins(cleanName);

  // 1. Check against famous / protected tech brands (exact, substring, phonetic, Levenshtein)
  const protectedCollisions: ProtectedCollision[] = [];
  for (const brand of PROTECTED_TECH_BRANDS) {
    if (cleanName === brand) {
      protectedCollisions.push({
        brand,
        matchType: "identisch",
        phoneticMatch: true,
        note: `Identisch mit bekannter geschützter Marke "${brand}" (§ 9 / § 14 MarkenG).`,
      });
      continue;
    }
    if (brand.length >= 4 && cleanName.includes(brand)) {
      protectedCollisions.push({
        brand,
        matchType: "enthalten",
        phoneticMatch: false,
        note: `Enthält geschützte bekannte Marke "${brand}" vollständig als Bestandteil.`,
      });
      continue;
    }
    const brandKp = koelnerPhonetik(brand);
    if (brandKp.length >= 3 && kp === brandKp) {
      protectedCollisions.push({
        brand,
        matchType: "klangidentisch",
        phoneticMatch: true,
        note: `Klangidentisch nach Kölner Phonetik (${kp}) mit "${brand}" – hohes Abmahnrisiko wegen klanglicher Verwechslungsgefahr!`,
      });
      continue;
    }
    if (
      cleanName.length >= 5 &&
      brand.length >= 5 &&
      levenshtein(cleanName, brand) === 1
    ) {
      protectedCollisions.push({
        brand,
        matchType: "tippfehler-nah",
        phoneticMatch: sdx === soundex(brand),
        note: `Nur 1 Buchstabe Unterschied zu "${brand}" (Schriftbildliche Verwechslungsgefahr).`,
      });
    }
  }

  // 2. Evaluate § 8 MarkenG Descriptiveness (Freihaltebedürfnis / Unterscheidungskraft)
  let remaining = cleanName;
  let matchedDescriptive = 0;
  for (const root of DESCRIPTIVE_ROOTS) {
    if (remaining.includes(root)) {
      matchedDescriptive++;
      remaining = remaining.replace(root, "");
    }
  }

  let descriptivenessRisk: "niedrig" | "mittel" | "hoch" = "niedrig";
  let distinctivenessType: TrademarkAnalysis["distinctivenessType"] =
    "Fantasiename (Stark)";
  let descriptivenessNote =
    "Hohe originäre Kennzeichnungskraft: Kein bloßer Gattungsbegriff erkannt (ideal nach § 8 MarkenG).";

  if (remaining.length <= 1 && matchedDescriptive >= 1) {
    descriptivenessRisk = "hoch";
    distinctivenessType = "Beschreibend (Schwach - § 8 MarkenG Risiko)";
    descriptivenessNote =
      "Achtung (§ 8 Abs. 2 MarkenG): Besteht fast nur aus beschreibenden Fach-/Gattungsbegriffen – hohes Risiko einer Zurückweisung durch das DPMA wegen Freihaltebedürfnis.";
  } else if (matchedDescriptive >= 1) {
    descriptivenessRisk = "mittel";
    distinctivenessType = "Kompositum / Anlehnung (Mittel)";
    descriptivenessNote =
      "Kombination aus sprechendem Begriff und kennzeichnendem Teil – gut merkbar, sollte aber als Gesamtbegriff nicht rein beschreibend wirken.";
  }

  // 3. Recommend Nice Classes (Nizza-Klassen) for Apps & Websites
  const textContext = `${description} ${keywords.join(" ")}`.toLowerCase();
  const niceClasses: NiceClassInfo[] = [
    {
      classNumber: 9,
      title: "Klasse 9 · Apps & herunterladbare Software",
      reason: "Pflichtklasse für Mobile Apps (iOS/Android), Desktop-Software & KI-Modelle.",
      officialScope: "Wissenschaftliche, Schifffahrts-, Vermessungs-, fotografische, Film-, optische, Wäge-, Mess-, Signal-, Kontroll-, Rettungs- und Unterrichtsapparate; Datenverarbeitungsgeräte und Computer; Computersoftware.",
    },
    {
      classNumber: 42,
      title: "Klasse 42 · SaaS, Web-Apps & IT-Dienste",
      reason: "Pflichtklasse für Webseiten, Cloud-Plattformen, APIs und Software-as-a-Service.",
      officialScope: "Wissenschaftliche und technologische Dienstleistungen und Forschungsarbeiten; industrielle Analyse- und Forschungsdienstleistungen; Entwurf und Entwicklung von Computerhardware und -software.",
    },
  ];

  if (/(shop|handel|markt|marketing|business|b2b|agentur|crm|erp|finanz|steuer|rechnung)/.test(textContext)) {
    niceClasses.push({
      classNumber: 35,
      title: "Klasse 35 · Online-Marktplätze, Werbung & Business",
      reason: "Empfohlen für E-Commerce, Unternehmensverwaltung und Preis-/Produktportale.",
      officialScope: "Werbung; Geschäftsführung; Unternehmensverwaltung; Büroarbeiten; Groß- und Einzelhandelsdienstleistungen.",
    });
  }
  if (/(chat|kommunikation|mail|messag|forum|social|community|netzwerk)/.test(textContext)) {
    niceClasses.push({
      classNumber: 38,
      title: "Klasse 38 · Telekommunikation & Messaging",
      reason: "Empfohlen bei Chat-, Community-, Streaming- oder Kommunikationsfunktionen.",
      officialScope: "Telekommunikation; Bereitstellung des Zugriffs auf globale Computernetzwerke; elektronische Nachrichtenübermittlung.",
    });
  }
  if (/(lernen|schule|kurs|wissen|training|buch|game|spiel|musik|medien|coaching)/.test(textContext)) {
    niceClasses.push({
      classNumber: 41,
      title: "Klasse 41 · Bildung, Coaching & Entertainment",
      reason: "Empfohlen für Lern-Apps, Kurse, Medien und Spiele.",
      officialScope: "Erziehung; Ausbildung; Unterhaltung; sportliche und kulturelle Aktivitäten; Bereitstellung elektronischer Veröffentlichungen.",
    });
  }
  if (/(gesundheit|medizin|pflege|rettung|klinik|arzt|therapie|fitness|ernährung)/.test(textContext)) {
    niceClasses.push({
      classNumber: 44,
      title: "Klasse 44 · Gesundheit, Medizin & Pflege",
      reason: "Empfohlen bei Gesundheits-, Medizin- oder Pflege-Bezug.",
      officialScope: "Medizinische Dienstleistungen; tierärztliche Dienstleistungen; Gesundheits- und Schönheitspflege für Menschen.",
    });
  }

  const classList = niceClasses.map((c) => String(c.classNumber).padStart(2, "0"));
  const variantTerms = [cleanName, ...twins.slice(0, 2)]
    .map((v) => `"${v}*"`)
    .join(" OR ");
  const dpmaExpertQuery = `(${variantTerms}) AND (${classList.map((c) => `IC=${c}`).join(" OR ")})`;

  return {
    cleanName,
    koelnerPhonetik: kp,
    soundex: sdx,
    phoneticTwins: twins,
    descriptivenessRisk,
    descriptivenessNote,
    distinctivenessType,
    protectedCollisions,
    niceClasses,
    dpmaExpertQuery,
    officialFees: {
      dpma: "290 € (elektronische Anmeldung, bis zu 3 Klassen inklusive)",
      euipo: "850 € (1. Klasse) + 50 € (2. Klasse) + 150 € (ab 3. Klasse) – EU-weiter Schutz",
      uspto: "250 $ - 350 $ pro Waren-/Dienstleistungsklasse (TEAS)",
    },
    registryLinks: {
      dpma: `https://register.dpma.de/DPMAregister/marke/einsteiger`,
      euipo: `https://euipo.europa.eu/eSearch/#details/trademarks/${encodeURIComponent(cleanName)}`,
      tmview: `https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=${encodeURIComponent(cleanName)}`,
      tmdb: `https://tmdb.eu/de/suche/marken?q=${encodeURIComponent(cleanName)}&mode%5B%5D=fts`,
      wipo: `https://branddb.wipo.int/en/quicksearch/results?by=brandName&v=${encodeURIComponent(cleanName)}`,
      uspto: `https://tmsearch.uspto.gov/search/search-results?field=COMBINED&search_type=SEARCH_ALL&text=${encodeURIComponent(cleanName)}`,
      offeneRegister: `https://offeneregister.de/?q=${encodeURIComponent(cleanName)}`,
      unternehmensregister: `https://www.unternehmensregister.de/ureg/search1.3.html?search-analyt-submit=Suche+starten&submit=Suche+starten&searchWord=${encodeURIComponent(cleanName)}`,
    },
  };
}
