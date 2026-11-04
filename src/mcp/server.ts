import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  performClearanceCheck,
} from "@/lib/clearance";
import {
  compareDomainPrices,
} from "@/lib/domain-pricing";
import {
  discoverOpenDataWords,
} from "@/lib/opendata";
import {
  auditCandidateBundleIds,
  checkAppleBundleId,
  checkGooglePlayPackage,
} from "@/lib/rea";
import {
  OPEN_APIS_INVENTORY,
  getApiCategories,
  getApisByCategory,
} from "@/lib/open-apis";

export function createMarkenfreiMcpServer(): McpServer {
  const server = new McpServer({
    name: "markenfrei",
    version: "1.0.0",
  });

  // Tool 1: Full clearance check
  server.tool(
    "markenfrei_clearance_check",
    "Führt eine vollständige Vorab-Prüfung eines Namens oder einer App-Identität durch. Prüft Markenrecht (§ 8 Gattungsbegriff, § 9 Verwechslungsgefahr), phonetische Zwillinge (Kölner Phonetik & Soundex), Mobile App Stores Werktitelschutz (§ 5 Abs. 3 MarkenG auf Apple App Store & Google Play), autoritative Registries (DENIC .de, Verisign .com, Google .app), DoH Fallback, Enzyklopädien (Wikipedia REST, DuckDuckGo) und Entwickler-Namensräume (GitHub, npm, PyPI, Crates.io, Homebrew, Go Proxy).",
    {
      name: z
        .string()
        .min(2)
        .describe("Der zu prüfende Name (z. B. 'WachWerk' oder 'CloudPilot')"),
      description: z
        .string()
        .optional()
        .describe("Optionale Beschreibung des Projekts oder Produkts"),
      tagline: z.string().optional().describe("Optionale Tagline"),
      tlds: z
        .array(z.string())
        .optional()
        .describe("TLDs zur Prüfung (Standard: ['de', 'com', 'app', 'ai', 'io'])"),
    },
    async ({ name, description, tagline, tlds }) => {
      try {
        const report = await performClearanceCheck({
          name,
          description,
          tagline,
          tlds: tlds && tlds.length > 0 ? tlds : ["de", "com", "app", "ai", "io"],
        });

        const freeDomains = report.domains
          .filter((d) => d.status === "available")
          .map((d) => `.${d.tld}`);
        const takenDomains = report.domains
          .filter((d) => d.status === "taken")
          .map((d) => `.${d.tld}`);

        const summaryText = [
          `# Markenfrei Vorab-Prüfung: „${report.name}“`,
          ``,
          `* **Gesamt-Urteil:** ${report.matrixScore.verdict.toUpperCase()} (${report.matrixScore.verdictLabel})`,
          `* **Clearance-Score:** ${report.matrixScore.totalScore} / 100 Punkte`,
          `* **Phonetischer Code (Kölner Phonetik):** \`${report.trademark.koelnerPhonetik}\` (Soundex: \`${report.trademark.soundex}\`)`,
          `* **Freihaltebedürfnis (§ 8 MarkenG):** Risiko ${report.trademark.descriptivenessRisk.toUpperCase()} (${report.trademark.descriptivenessNote})`,
          ``,
          `## 🌐 Domain-Verfügbarkeit`,
          `* **Frei:** ${freeDomains.length > 0 ? freeDomains.join(", ") : "keine"}`,
          `* **Vergeben:** ${takenDomains.length > 0 ? takenDomains.join(", ") : "keine"}`,
          ``,
          `## 📱 Mobile App Stores & Werktitelschutz (§ 5 Abs. 3 MarkenG)`,
          `* **Status:** ${report.appStore.status}`,
          `* **Apple App Store Treffer:** ${report.appStore.hits.length}`,
          report.appStore.hits.length > 0
            ? report.appStore.hits
                .slice(0, 3)
                .map((h) => `  - ${h.trackName} (${h.sellerName}) [${h.primaryGenreName}]`)
                .join("\n")
            : `  - Keine identischen oder ähnlichen Apps im deutschen App Store gefunden.`,
          ``,
          `## 💻 Entwickler-Namensräume`,
          `* **GitHub Handle:** ${report.devAndSocial.githubHandle}`,
          `* **npm Package:** ${report.devAndSocial.npmPackage}`,
          `* **PyPI Package:** ${report.devAndSocial.pypiPackage}`,
          `* **Crates.io:** ${report.devAndSocial.cratesIo}`,
          `* **Homebrew:** ${report.devAndSocial.homebrew}`,
          `* **Go Module:** ${report.devAndSocial.golangModule}`,
          ``,
          `## ⚖️ Empfohlene Nizza-Klassen & Amtsgebühren`,
          `* Klassen: ${report.trademark.niceClasses.map((c) => `Klasse ${c.classNumber} (${c.title})`).join("; ")}`,
          `* **DPMA (DE):** ${report.trademark.officialFees.dpma}`,
          `* **EUIPO (EU):** ${report.trademark.officialFees.euipo}`,
          `* **USPTO (US):** ${report.trademark.officialFees.uspto}`,
          ``,
          `## 🔍 Amtliche Register-Links`,
          `* DPMAregister: ${report.trademark.registryLinks.dpma}`,
          `* TMview (EU & DE): ${report.trademark.registryLinks.tmview}`,
          `* EUIPO eSearch: ${report.trademark.registryLinks.euipo}`,
          `* WIPO Brand DB: ${report.trademark.registryLinks.wipo}`,
          `* USPTO TSDR: ${report.trademark.registryLinks.uspto}`,
        ].join("\n");

        return {
          content: [
            {
              type: "text",
              text: summaryText,
            },
            {
              type: "text",
              text: JSON.stringify(report, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Fehler bei der Prüfung von „${name}“: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // Tool 2: Domain price comparison
  server.tool(
    "markenfrei_domain_pricing",
    "Vergleicht echte Registrar-Dauerpreise für eine Domain oder TLD (.de, .com, .app, .ai, .io, .dev). Zeigt die günstigsten Anbieter (Netcup, Hetzner, Cloudflare At-Cost Wholesale, Porkbun) und warnt vor 1 € Lockvogel-Fallen.",
    {
      domainOrTld: z
        .string()
        .describe("Domainname (z. B. 'meinprojekt.de') oder TLD (z. B. 'de', 'com', 'app')"),
    },
    async ({ domainOrTld }) => {
      const clean = domainOrTld.toLowerCase().trim().replace(/^\./, "");
      const tld = clean.includes(".") ? clean.split(".").pop() || "de" : clean;
      const domain = clean.includes(".") ? clean : `name.${clean}`;

      const comparison = compareDomainPrices(domain);

      if (!comparison) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Keine Preisdaten für TLD .${tld} verfügbar. Unterstützt werden: .de, .com, .app, .ai, .io, .dev.`,
            },
          ],
        };
      }

      const teaserTrap = comparison.registrars.find((r) => r.isTeaserTrap);

      const lines = [
        `# Domain-Preisvergleich für .${tld.toUpperCase()} (${domain})`,
        ``,
        `* **Günstigster Dauerpreis:** ${comparison.cheapestRenewal.name} mit **${comparison.cheapestRenewal.renewalEur.toFixed(2)} € / Jahr**`,
        comparison.atCostRecommendation
          ? `* **At-Cost Großhandel (0 $ Markup):** ${comparison.atCostRecommendation.name} mit **${comparison.atCostRecommendation.renewalEur.toFixed(2)} € / Jahr**`
          : "",
        teaserTrap && teaserTrap.trapWarning
          ? `⚠️ **Lockvogel-Warnung:** ${teaserTrap.name} (${teaserTrap.trapWarning})`
          : "",
        ``,
        `### Alle Anbieter im Vergleich (sortiert nach Dauerpreis):`,
        ...comparison.registrars.map(
          (r, i) =>
            `${i + 1}. **${r.name}**: Erstes Jahr: ${r.firstYearEur.toFixed(2)} € | **Verlängerung: ${r.renewalEur.toFixed(2)} €/Jahr**${r.isAtCost ? " *(At-Cost Wholesale)*" : ""}${r.isTeaserTrap ? " ⚠️ *(Lockvogelangebot)*" : ""} [Link](${r.registerUrl})`,
        ),
      ].filter(Boolean);

      return {
        content: [
          {
            type: "text",
            text: lines.join("\n"),
          },
        ],
      };
    },
  );

  // Tool 3: Generate brand ideas (Open-Data zero-key morphology)
  server.tool(
    "markenfrei_generate_ideas",
    "Generiert unbedenkliche Markennamen, Portmanteaus und Kunstwörter basierend auf einem Thema oder einer Projektidee. Nutzt 100% deutsches Open-Data Wortfeld-Morphing ohne API-Key.",
    {
      query: z
        .string()
        .min(2)
        .describe("Thema oder Projektidee (z. B. 'Schichtplaner Hilfsorganisationen' oder 'Cloud Kosten')"),
      count: z
        .number()
        .optional()
        .default(10)
        .describe("Anzahl gewünschter Namensvorschläge (Standard: 10)"),
    },
    async ({ query, count = 10 }) => {
      const tokens = query.split(/[\s,.;:!?()/-]+/).filter((w) => w.length >= 3);
      const wordField = await discoverOpenDataWords({
        keywords: tokens,
        description: query,
        maxLen: 12,
      });

      const candidates = wordField.synthesizedCandidates.slice(0, count);

      const lines = [
        `# Markenfrei Namens-Generierung für: „${query}“`,
        ``,
        `Hier sind ${candidates.length} konstruierte Kunstwörter und Portmanteaus (generiert aus OpenThesaurus & Datamuse), bereit für die Sofort-Clearance-Prüfung:`,
        ``,
        ...candidates.map(
          (c, i) =>
            `${i + 1}. **${c.name}** – *${c.origin}* [Kategorie: ${c.category}]`,
        ),
      ];

      return {
        content: [
          {
            type: "text",
            text: lines.join("\n"),
          },
          {
            type: "text",
            text: JSON.stringify(candidates, null, 2),
          },
        ],
      };
    },
  );

  // Tool 4: Inspect App Bundle ID & Mobile Stores
  server.tool(
    "markenfrei_inspect_bundle",
    "Prüft einen Reverse-DNS App-Bundle-Identifier (z. B. 'de.wachwerk.app') oder Paketnamen auf Apple App Store und Google Play Store Präsenz (Werktitelschutz § 5 Abs. 3 MarkenG).",
    {
      identifier: z
        .string()
        .min(3)
        .describe("Der zu prüfende Bundle-Identifier oder Name (z. B. 'de.wachwerk.app')"),
    },
    async ({ identifier }) => {
      const clean = identifier.trim().toLowerCase();
      const isReverseDns = clean.includes(".");

      if (isReverseDns) {
        const [apple, google] = await Promise.all([
          checkAppleBundleId(clean),
          checkGooglePlayPackage(clean),
        ]);

        const summary = [
          `# App-Bundle & Werktitelschutz: \`${clean}\``,
          ``,
          `* **Apple App Store:** ${apple.status === "taken" ? `❌ Vergeben (${apple.app?.trackName ?? "vorhanden"})` : apple.status === "available" ? "✅ Frei" : "⚠️ Unbekannt"}`,
          `* **Google Play Store:** ${google.status === "taken" ? "❌ Paket existiert bereits im Play Store" : google.status === "available" ? "✅ Frei" : "⚠️ Unbekannt"}`,
        ].join("\n");

        return {
          content: [
            {
              type: "text",
              text: summary,
            },
            {
              type: "text",
              text: JSON.stringify({ bundleId: clean, apple, google }, null, 2),
            },
          ],
        };
      } else {
        const audit = await auditCandidateBundleIds(clean);
        return {
          content: [
            {
              type: "text",
              text: `# Kandidaten-Bundle-IDs für „${clean}“\n\n` +
                audit
                  .map(
                    (b) =>
                      `* \`${b.bundleId}\`: Apple [${b.appleStatus}], Google Play [${b.googlePlayStatus}]`,
                  )
                  .join("\n"),
            },
            {
              type: "text",
              text: JSON.stringify(audit, null, 2),
            },
          ],
        };
      }
    },
  );

  // Tool 5: Quelleninventar (abgefragte Quellen und reine Verweise)
  server.tool(
    "markenfrei_list_open_apis",
    "Liefert das vollständige Verzeichnis aller weltweiten (europäischen, amerikanischen & asiatischen) von Markenfrei genutzten Open APIs und autoritativen Register mit Endpunkten und Dokumentations-URLs.",
    {
      category: z
        .string()
        .optional()
        .describe("Optionale Kategorie-Filterung (z. B. 'Domains & DNS', 'Mobile App Stores', etc.)"),
    },
    async ({ category }) => {
      const categories = getApiCategories();
      const selectedCategories = category ? [category] : categories;

      const lines: string[] = [
        `# Markenfrei: Verwendete weltweite Open APIs & Datenquellen (Europa, Amerika, Asien)`,
        ``,
        `Markenfrei arbeitet nach dem Open-Data-First-Prinzip: Alle Kernabfragen erfolgen direkt gegen offizielle, kostenfreie Register und autoritative Schnittstellen ohne Tracking und ohne Paywall.`,
        ``,
      ];

      for (const cat of selectedCategories) {
        const apis = getApisByCategory(cat);
        if (apis.length === 0) continue;
        lines.push(`## ${cat}`);
        for (const api of apis) {
          lines.push(
            `* **${api.name}** (\`${api.protocol}\` | ${api.auth}): ${api.purpose}\n  - Endpoint: \`${api.endpoint}\`\n  - Doku: ${api.docsUrl}`,
          );
        }
        lines.push(``);
      }

      return {
        content: [
          {
            type: "text",
            text: lines.join("\n"),
          },
          {
            type: "text",
            text: JSON.stringify(
              category ? getApisByCategory(category) : OPEN_APIS_INVENTORY,
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Prompt: Structured brand clearance audit
  server.prompt(
    "clearance_audit_prompt",
    "Führt einen vollständigen Marken-, Domain- und Identitäts-Audit für einen Projektnamen durch.",
    {
      name: z.string().describe("Der zu prüfende Name"),
      purpose: z.string().describe("Zweck des Projekts oder der App"),
    },
    ({ name, purpose }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Bitte prüfe den Namen „${name}“ für das Projekt „${purpose}“.
Rufe dazu das Tool markenfrei_clearance_check auf und erstelle mir einen detaillierten Bericht:
1. Markenrechtliche Risikoeinstufung (§ 8 Freihaltebedürfnis, § 9 Verwechslungsgefahr, phonetische Zwillinge)
2. Domain-Verfügbarkeit (.de, .com, .app) und günstigste Registrar-Preise (unter Vermeidung von Lockvogelangeboten)
3. App Store & Werktitelschutz (§ 5 Abs. 3 MarkenG)
4. Entwickler-Handles (GitHub, npm, PyPI)
5. Konkrete Empfehlungen für Nizza-Klassen und offizielle Register-Recherche (DPMAregister, TMview).`,
          },
        },
      ],
    }),
  );

  return server;
}
