import { NextResponse } from "next/server";
import { discoverOpenDataWords } from "@/lib/opendata";
import { getProvider } from "@/lib/providers";

export type GeneratedCandidate = {
  name: string;
  tagline: string;
  category: string;
};

function cleanName(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/\.[a-z]+$/, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseJsonCandidates(rawText: string): GeneratedCandidate[] {
  const stripped = (rawText || "").replace(/```(?:json)?/gi, "").trim();
  const match = stripped.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  const target = match ? match[0] : stripped;

  try {
    const parsed = JSON.parse(target);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.candidates)
        ? parsed.candidates
        : Array.isArray(parsed.names)
          ? parsed.names
          : Array.isArray(parsed.domains)
            ? parsed.domains
            : [];

    const out: GeneratedCandidate[] = [];
    for (const item of arr) {
      if (typeof item === "string") {
        const n = cleanName(item);
        if (n.length >= 3) {
          out.push({
            name: n,
            tagline: "KI-generierter Markenvorschlag",
            category: "Kunstwort / Brandable",
          });
        }
      } else if (item && typeof item === "object") {
        const n = cleanName(item.name || item.word || item.domain || "");
        if (n.length >= 3) {
          out.push({
            name: n,
            tagline: String(item.tagline || item.reason || item.meaning || "Passender Markenname"),
            category: String(item.category || item.style || "Kunstwort"),
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function callGemini(params: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<{ candidates?: GeneratedCandidate[]; error?: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.model || "gemini-2.5-flash",
  )}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: params.prompt }] }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { error: `Gemini API (${res.status}): ${txt.slice(0, 240)}` };
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return { candidates: parseJsonCandidates(text) };
}

async function callAnthropic(params: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
}): Promise<{ candidates?: GeneratedCandidate[]; error?: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.model || "claude-3-5-haiku-latest",
      max_tokens: 1500,
      temperature: 0.85,
      system: params.system,
      messages: [{ role: "user", content: params.prompt }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { error: `Anthropic API (${res.status}): ${txt.slice(0, 240)}` };
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text || "{}";
  return { candidates: parseJsonCandidates(text) };
}

async function callOpenAICompatible(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
}): Promise<{ candidates?: GeneratedCandidate[]; error?: string }> {
  const endpoint = `${params.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.prompt },
      ],
      temperature: 0.9,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { error: `LLM API (${res.status}): ${txt.slice(0, 240)}` };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "{}";
  return { candidates: parseJsonCandidates(text) };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      provider = "opendata",
      model = "",
      apiKey = "",
      baseUrl = "",
      brandSeed = "",
      description = "",
      keywords = "",
      tone = "",
      styles = ["brandable"],
      avoid = "",
      maxLen = 11,
      count = 12,
      exclude = [],
    } = body || {};

    const keywordList = Array.isArray(keywords)
      ? keywords
      : String(keywords || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

    const avoidList = String(avoid || "")
      .split(/[,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const excludeSet = new Set(
      (Array.isArray(exclude) ? exclude : []).map(cleanName).filter(Boolean),
    );

    // Always enrich with Open Data lexical discovery (OpenThesaurus DE + Datamuse)
    const openDataField = await discoverOpenDataWords({
      keywords: keywordList,
      description,
      brandSeed,
      maxLen: Number(maxLen) || 11,
      avoid: avoidList,
    });

    // If user selected the Open-Data Engine (or provided no key for a key-requiring provider), return Open Data + Morpheme synthesis directly
    const providerMeta = getProvider(provider);
    const effectiveApiKey =
      apiKey ||
      (provider === "google" ? process.env.GEMINI_API_KEY || "" : "") ||
      (provider === "deepseek" ? process.env.DEEPSEEK_API_KEY || "" : "") ||
      (provider === "openai" ? process.env.OPENAI_API_KEY || "" : "");

    if (
      provider === "opendata" ||
      (providerMeta?.needsKey && !effectiveApiKey)
    ) {
      const candidates: GeneratedCandidate[] = openDataField.synthesizedCandidates
        .filter((c) => !excludeSet.has(c.name))
        .slice(0, count)
        .map((c) => ({
          name: c.name,
          tagline: c.origin,
          category: c.category,
        }));

      return NextResponse.json({
        candidates,
        openDataField,
        usedProvider: "opendata",
        notice:
          provider !== "opendata" && !effectiveApiKey
            ? `Kein API-Key für ${providerMeta?.label} hinterlegt – Open-Data & Morphem-Engine wurde als Sofort-Fallback genutzt.`
            : undefined,
      });
    }

    // Build prompt combining dodomains + domain-search-agent + German trademark law (§ 8 & § 9 MarkenG) + Open Data context
    const systemPrompt =
      "Du bist ein spezialisierter Marken- und Naming-Stratege für Apps, SaaS und Webseiten im deutschsprachigen (DPMA/EUIPO) und internationalen Raum. Antworte ausschließlich mit validem JSON.";

    const openDataHint = [
      openDataField.germanSynonyms.length
        ? `Deutsche Synonyme & Assoziationen (OpenThesaurus): ${openDataField.germanSynonyms.slice(0, 12).join(", ")}`
        : "",
      openDataField.semanticRelated.length
        ? `Semantisches Wortfeld (Datamuse/WordNet): ${openDataField.semanticRelated.slice(0, 12).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const excludeHint =
      excludeSet.size > 0
        ? `\nGeneriere KEINEN dieser bereits geprüften Namen: ${Array.from(excludeSet).slice(0, 120).join(", ")}.`
        : "";

    const prompt = `Generiere ${count} einprägsame, markenrechtlich starke Namensvorschläge (nur den Namensteil ohne Domain-Endung, z. B. "velora" statt "velora.de") für folgendes Projekt:

Projektbeschreibung: ${description || "(nicht angegeben)"}
Kern-Keywords: ${keywordList.join(", ") || "(keine)"}
Marken-Seed / Idee: ${brandSeed || "(frei erfinden)"}
Zielgruppe & Tonalität: ${tone || "modern, vertrauenswürdig, prägnant"}
Gewünschte Stile: ${Array.isArray(styles) ? styles.join(", ") : styles}
Zu vermeidende Wörter: ${avoidList.join(", ") || "(keine)"}
Maximale Zeichenlänge: ${maxLen} Buchstaben

Open-Data Wort-Inspiration:
${openDataHint || "(keine)"}

Wichtige Markenrechts-Regeln (§ 8 & § 9 MarkenG / EUIPO):
1. Bevorzuge originelle Fantasiewörter (Kunstwörter), kreative Portmanteaus oder unverbrauchte Metaphern mit hoher Unterscheidungskraft.
2. Vermeide rein beschreibende Gattungsbegriffe (Freihaltebedürfnis nach § 8 Abs. 2 MarkenG) und bekannte Marken (Apple, Google, Klarna, Notion etc. – auch keine klangähnlichen Varianten!).
3. Jeder Name muss zwischen 4 und ${maxLen} Buchstaben lang sein (nur Buchstaben a-z, keine Bindestriche, keine Zahlen).
4. Der Name muss sowohl auf Deutsch als auch auf Englisch flüssig aussprechbar sein.${excludeHint}

Antworte exakt im folgenden JSON-Format:
{
  "candidates": [
    {
      "name": "beispiel",
      "tagline": "Kurze Erklärung zur Herleitung (max. 10 Wörter)",
      "category": "Kunstwort | Portmanteau | Metapher | Kompositum"
    }
  ]
}`;

    let llmRes: { candidates?: GeneratedCandidate[]; error?: string };

    if (provider === "google") {
      llmRes = await callGemini({
        apiKey: effectiveApiKey,
        model: model || "gemini-2.5-flash",
        prompt: `${systemPrompt}\n\n${prompt}`,
      });
    } else if (provider === "anthropic") {
      llmRes = await callAnthropic({
        apiKey: effectiveApiKey,
        model: model || "claude-3-5-haiku-latest",
        system: systemPrompt,
        prompt,
      });
    } else {
      const targetBaseUrl =
        baseUrl ||
        providerMeta?.defaultBaseUrl ||
        "https://api.openai.com/v1";
      llmRes = await callOpenAICompatible({
        baseUrl: targetBaseUrl,
        apiKey: effectiveApiKey,
        model: model || providerMeta?.models[0]?.id || "gpt-4o-mini",
        system: systemPrompt,
        prompt,
      });
    }

    if (llmRes.error) {
      return NextResponse.json(
        {
          error: llmRes.error,
          openDataField,
        },
        { status: 400 },
      );
    }

    // Filter & deduplicate candidates
    const finalCandidates: GeneratedCandidate[] = [];
    const seen = new Set<string>();

    for (const c of llmRes.candidates || []) {
      const w = cleanName(c.name);
      if (
        w.length >= 3 &&
        w.length <= (Number(maxLen) || 14) &&
        !seen.has(w) &&
        !excludeSet.has(w) &&
        !avoidList.some((a) => a && w.includes(a))
      ) {
        seen.add(w);
        finalCandidates.push({
          name: w,
          tagline: c.tagline,
          category: c.category,
        });
      }
    }

    // Top up with Open Data synthesized names if LLM returned fewer than requested
    for (const od of openDataField.synthesizedCandidates) {
      if (finalCandidates.length >= count) break;
      if (!seen.has(od.name) && !excludeSet.has(od.name)) {
        seen.add(od.name);
        finalCandidates.push({
          name: od.name,
          tagline: od.origin,
          category: od.category,
        });
      }
    }

    return NextResponse.json({
      candidates: finalCandidates,
      openDataField,
      usedProvider: provider,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unbekannter Fehler bei der Namensgenerierung",
      },
      { status: 500 },
    );
  }
}
