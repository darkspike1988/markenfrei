import { NextResponse } from "next/server";
import { performClearanceCheck } from "@/lib/clearance";
import { compareDomainPrices } from "@/lib/domain-pricing";
import { discoverOpenDataWords } from "@/lib/opendata";
import { checkAppleBundleId, checkGooglePlayPackage, auditCandidateBundleIds } from "@/lib/rea";
import { OPEN_APIS_INVENTORY, getApisByCategory } from "@/lib/open-apis";

const MCP_TOOLS = [
  {
    name: "markenfrei_clearance_check",
    description: "Vollständige Vorab-Prüfung eines Namens oder einer App-Identität auf Markenrecht (§ 8, § 9), phonetische Zwillinge, Mobile App Stores (§ 5 Abs. 3 MarkenG), autoritative Registries (DENIC, Verisign, Google), DoH und Entwickler-Namensräume.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Der zu prüfende Name" },
        description: { type: "string", description: "Projektbeschreibung" },
        tagline: { type: "string", description: "Optionale Tagline" },
        tlds: { type: "array", items: { type: "string" }, description: "TLDs zur Prüfung" },
      },
      required: ["name"],
    },
  },
  {
    name: "markenfrei_domain_pricing",
    description: "Vergleicht echte Registrar-Dauerpreise für eine Domain oder TLD (.de, .com, .app, .ai, .io, .dev) mit At-Cost Wholesale und Lockvogel-Warnungen.",
    inputSchema: {
      type: "object",
      properties: {
        domainOrTld: { type: "string", description: "Domainname oder TLD" },
      },
      required: ["domainOrTld"],
    },
  },
  {
    name: "markenfrei_generate_ideas",
    description: "Generiert unbedenkliche Markennamen und Portmanteaus basierend auf einer Projektidee via Open-Data Wortfeld-Morphing.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Thema oder Projektidee" },
        count: { type: "number", description: "Anzahl Namensvorschläge" },
      },
      required: ["query"],
    },
  },
  {
    name: "markenfrei_inspect_bundle",
    description: "Prüft Mobile App-Pakete und Reverse-DNS Bundle-Identifier auf Apple App Store und Google Play Store Werktitelschutz (§ 5 Abs. 3 MarkenG).",
    inputSchema: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Bundle-Identifier (z. B. de.wachwerk.app) oder Name" },
      },
      required: ["identifier"],
    },
  },
  {
    name: "markenfrei_list_open_apis",
    description: "Liefert das Verzeichnis aller von Markenfrei genutzten weltweiten Open APIs mit Endpunkten und Dokumentation.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Optionale Kategorie" },
      },
    },
  },
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, method, params } = body;

    if (method === "initialize") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: "markenfrei-http", version: "1.0.0" },
        },
      });
    }

    if (method === "tools/list") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: { tools: MCP_TOOLS },
      });
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName === "markenfrei_clearance_check") {
        const report = await performClearanceCheck({
          name: args.name,
          description: args.description,
          tagline: args.tagline,
          tlds: args.tlds,
        });
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `# Markenfrei Vorab-Prüfung: „${report.name}“\n* Urteil: ${report.matrixScore.verdict.toUpperCase()} (${report.matrixScore.verdictLabel})\n* Score: ${report.matrixScore.totalScore}/100\n* Kölner Phonetik: \`${report.trademark.koelnerPhonetik}\`\n* § 8 Freihaltebedürfnis: ${report.trademark.descriptivenessRisk}`,
              },
              {
                type: "text",
                text: JSON.stringify(report, null, 2),
              },
            ],
          },
        });
      }

      if (toolName === "markenfrei_domain_pricing") {
        const clean = String(args.domainOrTld || "de").toLowerCase().trim().replace(/^\./, "");
        const tld = clean.includes(".") ? clean.split(".").pop() || "de" : clean;
        const domain = clean.includes(".") ? clean : `name.${clean}`;
        const comparison = compareDomainPrices(domain);

        if (!comparison) {
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              isError: true,
              content: [{ type: "text", text: `Keine Preisdaten für .${tld}` }],
            },
          });
        }

        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `# Preisvergleich für .${tld.toUpperCase()}\n* Günstigster Dauerpreis: ${comparison.cheapestRenewal.name} (${comparison.cheapestRenewal.renewalEur.toFixed(2)} €/Jahr)\n${comparison.registrars.map((r) => `- ${r.name}: ${r.renewalEur.toFixed(2)} €/Jahr`).join("\n")}`,
              },
              {
                type: "text",
                text: JSON.stringify(comparison, null, 2),
              },
            ],
          },
        });
      }

      if (toolName === "markenfrei_generate_ideas") {
        const query = String(args.query || "");
        const count = Number(args.count) || 8;
        const tokens = query.split(/[\s,.;:!?()/-]+/).filter((w) => w.length >= 3);
        const wordField = await discoverOpenDataWords({
          keywords: tokens,
          description: query,
        });
        const candidates = wordField.synthesizedCandidates.slice(0, count);

        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `# Namensvorschläge für: „${query}“\n${candidates.map((c, i) => `${i + 1}. **${c.name}** – ${c.origin} (${c.category})`).join("\n")}`,
              },
              {
                type: "text",
                text: JSON.stringify(candidates, null, 2),
              },
            ],
          },
        });
      }

      if (toolName === "markenfrei_inspect_bundle") {
        const identifier = String(args.identifier || "").toLowerCase().trim();
        if (identifier.includes(".")) {
          const [apple, google] = await Promise.all([
            checkAppleBundleId(identifier),
            checkGooglePlayPackage(identifier),
          ]);
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `# Bundle-ID: \`${identifier}\`\n* Apple App Store: ${apple.status}\n* Google Play: ${google.status}`,
                },
                {
                  type: "text",
                  text: JSON.stringify({ bundleId: identifier, apple, google }, null, 2),
                },
              ],
            },
          });
        } else {
          const audit = await auditCandidateBundleIds(identifier);
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `# Kandidaten-Bundle-IDs für „${identifier}“\n${audit.map((b) => `- ${b.bundleId}: Apple [${b.appleStatus}], Google Play [${b.googlePlayStatus}]`).join("\n")}`,
                },
                {
                  type: "text",
                  text: JSON.stringify(audit, null, 2),
                },
              ],
            },
          });
        }
      }

      if (toolName === "markenfrei_list_open_apis") {
        const category = args.category ? String(args.category) : undefined;
        const apis = category ? getApisByCategory(category) : OPEN_APIS_INVENTORY;
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `# Markenfrei Open APIs\n${apis.map((a) => `- **${a.name}** (${a.protocol} | ${a.auth}): ${a.purpose}`).join("\n")}`,
              },
              {
                type: "text",
                text: JSON.stringify(apis, null, 2),
              },
            ],
          },
        });
      }

      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Tool "${toolName}" nicht gefunden` },
      });
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Methode "${method}" nicht unterstützt` },
    });
  } catch (err) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
      },
      { status: 500 },
    );
  }
}
