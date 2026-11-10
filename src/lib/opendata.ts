/**
 * Open Data Lexical & Semantic Discovery Engine
 * Queries:
 * 1) OpenThesaurus.de Open Data API (German synonyms, word stems, associations)
 * 2) Datamuse / WordNet Open API (Semantic related words, triggers, phonetic stems)
 * 3) Algorithmic Morpheme & Portmanteau Synthesizer (Fantasiewort-Generator nach § 8 MarkenG)
 */

import { buildUserAgent, createHttpClient } from "@/lib/engine/http";
import type { HttpClient } from "@/lib/engine/types";

export type OpenDataWordField = {
  germanSynonyms: string[];
  semanticRelated: string[];
  extractedStems: string[];
  synthesizedCandidates: {
    name: string;
    origin: string;
    category: "Kunstwort (Open-Data)" | "Portmanteau" | "Neo-Latein / Metapher";
  }[];
  sourcesQueried: string[];
};

/** Gesamtzeit für alle Wortfeld-Anfragen eines Aufrufs */
const OPENDATA_DEADLINE_MS = 5000;
const OPENDATA_TIMEOUT_MS = 3500;
/** Antworten von OpenThesaurus und Datamuse sind klein; mehr wird nicht gelesen */
const OPENDATA_MAX_BYTES = 256 * 1024;

export type OpenDataOptions = {
  contact?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

/**
 * Derselbe HTTP-Client wie bei der Prüfung: gleicher User-Agent, Größenlimit, Deadline und dieselben
 * Abfragebudgets (HOST_BUDGETS für OpenThesaurus und Datamuse). Ist ein Budget erschöpft, kommt keine
 * Anfrage zustande und es gibt weniger oder keine Vorschläge aus dieser Quelle, keinen Fehler.
 */
function openDataClient(opts: OpenDataOptions): HttpClient {
  const now = opts.now ?? Date.now;
  return createHttpClient({
    deadlineAt: now() + OPENDATA_DEADLINE_MS,
    userAgent: buildUserAgent(opts.contact ?? process.env.MARKENFREI_CONTACT ?? ""),
    fetchImpl: opts.fetchImpl,
    now,
  });
}

async function getJson(http: HttpClient, url: string, headers?: Record<string, string>): Promise<unknown> {
  const res = await http.request(url, {
    read: "json",
    headers,
    timeoutMs: OPENDATA_TIMEOUT_MS,
    maxBytes: OPENDATA_MAX_BYTES,
  });
  if (res.error || res.status < 200 || res.status >= 300) return undefined;
  return res.json;
}

function normalizeStem(word: string): string {
  return word
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z]/g, "")
    .trim();
}

/**
 * Fetches German synonyms & associations from OpenThesaurus.de (Open Data)
 */
async function fetchOpenThesaurus(http: HttpClient, terms: string[]): Promise<string[]> {
  const results = new Set<string>();
  const slice = terms.slice(0, 4);

  await Promise.all(
    slice.map(async (term) => {
      try {
        const url = `https://www.openthesaurus.de/synonyme/search?q=${encodeURIComponent(
          term,
        )}&format=application/json&similar=true`;
        const data = (await getJson(http, url, { Accept: "application/json" })) as
          | { synsets?: { terms?: { term?: unknown }[] }[] }
          | undefined;
        const synsets = Array.isArray(data?.synsets) ? data.synsets : [];
        for (const synset of synsets.slice(0, 4)) {
          const synTerms = Array.isArray(synset?.terms) ? synset.terms : [];
          for (const t of synTerms.slice(0, 6)) {
            if (typeof t?.term === "string") {
              const cleaned = t.term.replace(/\([^)]*\)/g, "").trim();
              if (cleaned.length >= 3 && cleaned.length <= 16 && !cleaned.includes(" ")) {
                results.add(cleaned);
              }
            }
          }
        }
      } catch {
        // Ignore timeout/network errors on individual term
      }
    }),
  );

  return Array.from(results).slice(0, 20);
}

/**
 * Fetches semantic & phonetic associations from Datamuse API (WordNet + Google Books Ngrams)
 */
async function fetchDatamuse(http: HttpClient, terms: string[]): Promise<string[]> {
  const results = new Set<string>();
  const query = terms.slice(0, 4).join(" ");
  if (!query) return [];

  try {
    const lists = await Promise.all([
      getJson(http, `https://api.datamuse.com/words?ml=${encodeURIComponent(query)}&max=20`),
      getJson(http, `https://api.datamuse.com/words?rel_trg=${encodeURIComponent(terms[0] || query)}&max=12`),
    ]);
    for (const data of lists) {
      if (!Array.isArray(data)) continue;
      for (const item of data) {
        if (typeof item?.word === "string" && /^[a-z]{3,10}$/.test(item.word)) {
          results.add(item.word);
        }
      }
    }
  } catch {
    // Ignore network fallback
  }

  return Array.from(results).slice(0, 24);
}

const BRAND_SUFFIXES = [
  { s: "ora", desc: "Lateinisch-offener Markenklang" },
  { s: "vio", desc: "Vitalität & Fokus (lat. via/vita)" },
  { s: "vela", desc: "Aufbruch & Navigation (lat. Segel)" },
  { s: "nova", desc: "Erneuerung & Klarheit" },
  { s: "luma", desc: "Licht & Transparenz (lat. lumen)" },
  { s: "kura", desc: "Sorgfalt & Pflege (lat. cura)" },
  { s: "takt", desc: "Rhythmus & Präzision" },
  { s: "flux", desc: "Fließender Prozess" },
  { s: "vanta", desc: "Vorsprung & Tiefe" },
  { s: "lyx", desc: "Kurzer Tech-Akzent" },
  { s: "nion", desc: "Verbindung & Struktur" },
  { s: "vero", desc: "Verlässlichkeit (lat. verus)" },
  { s: "zent", desc: "Zentrum & Fokus" },
  { s: "pakt", desc: "Verbindlichkeit & Kompaktheit" },
  { s: "ari", desc: "Leichte, einprägsame Endung" },
  { s: "exo", desc: "Weitblick & Struktur" },
];

const NEO_PREFIXES = [
  "velo", "krono", "lumi", "prismo", "verto", "novo", "zentro",
  "klaro", "talo", "viva", "orbi", "sano", "fino", "miro", "solu",
];

/**
 * Discovers Open Data word fields and synthesizes distinctive brand candidates.
 */
export async function discoverOpenDataWords(params: {
  keywords: string[];
  description?: string;
  brandSeed?: string;
  maxLen?: number;
  avoid?: string[];
}, opts: OpenDataOptions = {}): Promise<OpenDataWordField> {
  const maxLen = params.maxLen || 11;
  const avoidSet = new Set(
    (params.avoid || []).map((a) => a.toLowerCase().trim()).filter(Boolean),
  );

  // Extract raw terms from keywords + description
  const stopWords = new Set([
    "und", "oder", "fuer", "für", "eine", "einen", "einer", "der", "die", "das",
    "mit", "von", "auf", "aus", "bei", "nach", "wie", "wir", "app", "web", "webseite",
    "the", "and", "for", "with", "that", "from", "your", "this",
  ]);

  const rawTokens = [
    ...(params.brandSeed ? [params.brandSeed] : []),
    ...params.keywords,
    ...(params.description || "")
      .split(/[\s,.;:!?()/-]+/)
      .filter((w) => w.length >= 4),
  ]
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !stopWords.has(w.toLowerCase()));

  const uniqueSearchTerms = Array.from(new Set(rawTokens)).slice(0, 6);

  const http = openDataClient(opts);
  const [germanSynonyms, semanticRelated] = await Promise.all([
    fetchOpenThesaurus(http, uniqueSearchTerms),
    fetchDatamuse(http, uniqueSearchTerms),
  ]);

  // Extract short pronounceable stems (3 to 5 chars)
  const stemPool: { stem: string; sourceWord: string }[] = [];
  const seenStems = new Set<string>();

  const allWords = [
    ...uniqueSearchTerms,
    ...germanSynonyms.slice(0, 12),
    ...semanticRelated.slice(0, 12),
  ];

  for (const w of allWords) {
    const clean = normalizeStem(w);
    if (clean.length < 3) continue;

    // Cut stem to 3-5 chars ending ideally in consonant so vowel suffixes attach cleanly
    let stem = clean.slice(0, 5);
    if (stem.length >= 4 && /[aeiouy]$/.test(stem)) {
      stem = stem.slice(0, -1);
    }
    if (stem.length >= 3 && !seenStems.has(stem)) {
      seenStems.add(stem);
      stemPool.push({ stem, sourceWord: w });
    }
  }

  // Fallback stems if input was empty
  if (stemPool.length === 0) {
    for (const p of NEO_PREFIXES.slice(0, 6)) {
      stemPool.push({ stem: p.slice(0, 4), sourceWord: p });
    }
  }

  const synthesizedCandidates: OpenDataWordField["synthesizedCandidates"] = [];
  const usedNames = new Set<string>();

  const addCandidate = (
    name: string,
    origin: string,
    category: "Kunstwort (Open-Data)" | "Portmanteau" | "Neo-Latein / Metapher",
  ) => {
    const clean = name.toLowerCase().replace(/[^a-z]/g, "");
    if (clean.length < 4 || clean.length > maxLen) return;
    if (usedNames.has(clean)) return;
    if (Array.from(avoidSet).some((a) => a && clean.includes(a))) return;
    if (/[^aeiouy]{4,}/.test(clean)) return; // avoid unpronounceable consonant clusters
    usedNames.add(clean);
    synthesizedCandidates.push({
      name: clean,
      origin,
      category,
    });
  };

  // 1) Stem + Brand Suffix (Kunstwort)
  for (let i = 0; i < stemPool.length; i++) {
    const { stem, sourceWord } = stemPool[i];
    const suf1 = BRAND_SUFFIXES[i % BRAND_SUFFIXES.length];
    const suf2 = BRAND_SUFFIXES[(i + 5) % BRAND_SUFFIXES.length];

    const join1 =
      /[aeiouy]$/.test(stem) && /^[aeiouy]/.test(suf1.s)
        ? stem.slice(0, -1) + suf1.s
        : stem + suf1.s;
    addCandidate(
      join1,
      `Wortstamm aus "${sourceWord}" + -${suf1.s} (${suf1.desc})`,
      "Kunstwort (Open-Data)",
    );

    const join2 =
      /[aeiouy]$/.test(stem) && /^[aeiouy]/.test(suf2.s)
        ? stem.slice(0, -1) + suf2.s
        : stem + suf2.s;
    addCandidate(
      join2,
      `Wortstamm aus "${sourceWord}" + -${suf2.s} (${suf2.desc})`,
      "Kunstwort (Open-Data)",
    );
  }

  // 2) Portmanteau blends between two Open Data stems
  for (let i = 0; i < Math.min(stemPool.length, 6); i++) {
    for (let j = i + 1; j < Math.min(stemPool.length, 7); j++) {
      const a = stemPool[i];
      const b = stemPool[j];
      const partA = a.stem.slice(0, 4);
      const partB = b.stem.slice(0, 4);
      const bridge =
        !/[aeiouy]$/.test(partA) && !/^[aeiouy]/.test(partB) ? "o" : "";
      const blend = `${partA}${bridge}${partB}`;
      addCandidate(
        blend,
        `Portmanteau-Kreuzung aus "${a.sourceWord}" + "${b.sourceWord}"`,
        "Portmanteau",
      );
    }
  }

  // 3) Neo-Latin / Metaphorical combinations
  for (let i = 0; i < Math.min(stemPool.length, 5); i++) {
    const neo = NEO_PREFIXES[i % NEO_PREFIXES.length];
    const s = stemPool[i];
    addCandidate(
      `${neo}${s.stem.slice(0, 3)}`,
      `Neo-Präfix "${neo}-" + "${s.sourceWord}"`,
      "Neo-Latein / Metapher",
    );
  }

  return {
    germanSynonyms,
    semanticRelated,
    extractedStems: stemPool.map((s) => s.stem).slice(0, 14),
    synthesizedCandidates: synthesizedCandidates.slice(0, 24),
    sourcesQueried: [
      "OpenThesaurus.de (Deutsche Open-Data Synonym-Datenbank)",
      "Datamuse / WordNet API (Semantische & Phonetische Wortfelder)",
      "Markenfrei Morphem-Synthese (§ 8 MarkenG Fantasiewort-Generator)",
    ],
  };
}
