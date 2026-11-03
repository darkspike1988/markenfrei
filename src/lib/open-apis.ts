/**
 * Central Inventory of all Open Data APIs & Registries used by MarkenFrei.
 * 100% Zero-Key, Public, Transparent.
 */

export type OpenApiEntry = {
  id: string;
  name: string;
  provider: string;
  category:
    | "Domains & DNS"
    | "Mobile App Stores"
    | "Wissen & Enzyklopädie"
    | "Entwickler-Ökosysteme"
    | "Linguistik & Wortfelder"
    | "Marken & Amtsregister";
  endpoint: string;
  protocol: "REST (JSON)" | "RDAP (RFC 7484)" | "DoH (RFC 8484)" | "Deep-Link";
  auth: "100% Kostenlos / Zero-Key" | "Öffentlich / Rate-Limited";
  purpose: string;
  docsUrl: string;
};

export const OPEN_APIS: OpenApiEntry[] = [
  // --- Domains & DNS ---
  {
    id: "denic-rdap",
    name: "DENIC eG RDAP",
    provider: "DENIC eG (Frankfurt)",
    category: "Domains & DNS",
    endpoint: "https://rdap.denic.de/domain/{domain}",
    protocol: "RDAP (RFC 7484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Autoritative Echtzeit-Verfügbarkeitsabfrage für alle .de-Domains direkt bei der deutschen Registry.",
    docsUrl: "https://www.denic.de/service/rdap/",
  },
  {
    id: "verisign-rdap",
    name: "Verisign RDAP",
    provider: "Verisign Inc.",
    category: "Domains & DNS",
    endpoint: "https://rdap.verisign.com/com/v1/domain/{domain}",
    protocol: "RDAP (RFC 7484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Autoritativer Registry-Lookup für .com und .net Domains.",
    docsUrl: "https://www.verisign.com/en_US/channel-resources/domain-registry-products/rdap/index.xhtml",
  },
  {
    id: "google-registry-rdap",
    name: "Google Registry RDAP",
    provider: "Google Registry (Charleston)",
    category: "Domains & DNS",
    endpoint: "https://pubapi.registry.google/rdap/domain/{domain}",
    protocol: "RDAP (RFC 7484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Offizielle Abfrage für moderne TLDs wie .app und .dev.",
    docsUrl: "https://www.registry.google/",
  },
  {
    id: "identity-digital-rdap",
    name: "Identity Digital RDAP",
    provider: "Identity Digital Services",
    category: "Domains & DNS",
    endpoint: "https://rdap.identitydigital.services/rdap/domain/{domain}",
    protocol: "RDAP (RFC 7484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Autoritative Abfragen für Tech-Endungen wie .io und .ai.",
    docsUrl: "https://identitydigital.com/",
  },
  {
    id: "google-doh",
    name: "Google DNS-over-HTTPS",
    provider: "Google LLC",
    category: "Domains & DNS",
    endpoint: "https://dns.google/resolve?name={domain}&type=NS",
    protocol: "DoH (RFC 8484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Dual-Layer Fail-Safe: Verifiziert aktive Nameserver-Einträge und NXDOMAIN bei RDAP-Timeouts.",
    docsUrl: "https://developers.google.com/speed/public-dns/docs/doh",
  },
  {
    id: "cloudflare-doh",
    name: "Cloudflare 1.1.1.1 DoH",
    provider: "Cloudflare, Inc.",
    category: "Domains & DNS",
    endpoint: "https://cloudflare-dns.com/dns-query?name={domain}&type=NS",
    protocol: "DoH (RFC 8484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Sekundärer Anycast-DNS-Resolver für ultraschnelle DNS-Statusprüfung.",
    docsUrl: "https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/",
  },

  // --- Mobile App Stores ---
  {
    id: "apple-itunes-search",
    name: "Apple iTunes Search API",
    provider: "Apple Inc.",
    category: "Mobile App Stores",
    endpoint: "https://itunes.apple.com/search?term={name}&country=de&entity=software",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Werktitelschutz (§ 5 Abs. 3 MarkenG): Prüft live auf bestehende Apps im deutschen Apple App Store.",
    docsUrl: "https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html",
  },
  {
    id: "apple-itunes-lookup",
    name: "Apple iTunes Bundle Lookup",
    provider: "Apple Inc.",
    category: "Mobile App Stores",
    endpoint: "https://itunes.apple.com/lookup?bundleId={bundleId}&country=de",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft, ob eine konkrete iOS/macOS Bundle Identifier (z. B. de.firma.app) bereits vergeben ist.",
    docsUrl: "https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html",
  },
  {
    id: "google-play-store",
    name: "Google Play Store Namespace Check",
    provider: "Google LLC",
    category: "Mobile App Stores",
    endpoint: "https://play.google.com/store/apps/details?id={packageId}&hl=de",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft Android Package-Namespaces und App-Titel zur Verhinderung von Verwechslungskollisionen.",
    docsUrl: "https://play.google.com/store/apps",
  },

  // --- Wissen & Enzyklopädie ---
  {
    id: "wikidata-api",
    name: "Wikidata Entity Search API",
    provider: "Wikimedia Foundation",
    category: "Wissen & Enzyklopädie",
    endpoint: "https://www.wikidata.org/w/api.php?action=wbsearchentities&search={name}&language=de&format=json",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Durchsucht die weltgrößte Open-Data Wissensdatenbank nach Firmen, Software, Spielen und Brands.",
    docsUrl: "https://www.wikidata.org/w/api.php",
  },
  {
    id: "wikipedia-summary",
    name: "Wikipedia Page Summary REST API",
    provider: "Wikimedia Foundation",
    category: "Wissen & Enzyklopädie",
    endpoint: "https://de.wikipedia.org/api/rest_v1/page/summary/{name}",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft, ob ein Begriff bereits als lexikalischer Artikel in der freien Enzyklopädie existiert.",
    docsUrl: "https://en.wikipedia.org/api/rest_v1/",
  },
  {
    id: "duckduckgo-instant",
    name: "DuckDuckGo Instant Answer API",
    provider: "DuckDuckGo Inc.",
    category: "Wissen & Enzyklopädie",
    endpoint: "https://api.duckduckgo.com/?q={name}&format=json&no_html=1",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Zero-Click Wissensextrakt zur Feststellung von Marken- und Bekanntheitsgrad.",
    docsUrl: "https://duckduckgo.com/api",
  },

  // --- Entwickler-Ökosysteme ---
  {
    id: "github-api",
    name: "GitHub Public REST API",
    provider: "GitHub / Microsoft",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://api.github.com/users/{name} & search/repositories",
    protocol: "REST (JSON)",
    auth: "Öffentlich / Rate-Limited",
    purpose: "Prüft GitHub-Nutzernamen, Orgs und sucht nach Open-Source-Repositories mit hohen Star-Zahlen.",
    docsUrl: "https://docs.github.com/en/rest",
  },
  {
    id: "npm-registry",
    name: "npm Public Registry",
    provider: "npm, Inc. / GitHub",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://registry.npmjs.org/{name}",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft die Verfügbarkeit des JavaScript/TypeScript Paket-Namensraums.",
    docsUrl: "https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md",
  },
  {
    id: "pypi-json",
    name: "PyPI JSON API",
    provider: "Python Software Foundation",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://pypi.org/pypi/{name}/json",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft, ob ein Python-Paketname auf pypi.org bereits registriert ist.",
    docsUrl: "https://warehouse.pypa.io/api-reference/json.html",
  },
  {
    id: "crates-io",
    name: "Crates.io Rust API",
    provider: "Rust Project Developers",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://crates.io/api/v1/crates/{name}",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft den Rust Cargo Crate-Namensraum.",
    docsUrl: "https://crates.io/data-access",
  },
  {
    id: "homebrew-api",
    name: "Homebrew Formulae API",
    provider: "Homebrew",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://formulae.brew.sh/api/formula/{name}.json",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft die Verfügbarkeit als Homebrew CLI-Tool Formula für macOS & Linux.",
    docsUrl: "https://formulae.brew.sh/docs/api/",
  },
  {
    id: "go-proxy",
    name: "Go Module Proxy API",
    provider: "Google / Go Team",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://proxy.golang.org/{module}/@v/list",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft den globalen Go Modul-Namensraum.",
    docsUrl: "https://proxy.golang.org/",
  },

  // --- Linguistik & Wortfelder ---
  {
    id: "openthesaurus",
    name: "OpenThesaurus.de API",
    provider: "Daniel Naber / OpenThesaurus",
    category: "Linguistik & Wortfelder",
    endpoint: "https://www.openthesaurus.de/synonyme/search?q={term}&format=application/json&similar=true",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Liefert deutsche Synonyme, Assoziationen, Oberbegriffe und Wortstämme.",
    docsUrl: "https://www.openthesaurus.de/about/api",
  },
  {
    id: "datamuse",
    name: "Datamuse / WordNet API",
    provider: "Datamuse",
    category: "Linguistik & Wortfelder",
    endpoint: "https://api.datamuse.com/words?ml={query}&max=20",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Semantische Wortfeld-Analyse und phonetische Triggermorpheme.",
    docsUrl: "https://www.datamuse.com/api/",
  },

  // --- Marken & Amtsregister ---
  {
    id: "dpma-register",
    name: "DPMAregister",
    provider: "Deutsches Patent- und Markenamt (München)",
    category: "Marken & Amtsregister",
    endpoint: "https://register.dpma.de/DPMAregister/marke/einsteiger",
    protocol: "Deep-Link",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Offizielles deutsches Markenregister für Wortmarken und Nizza-Klassen.",
    docsUrl: "https://www.dpma.de/marken/recherche/index.html",
  },
  {
    id: "euipo-tmview",
    name: "TMview & EUIPO eSearch Plus",
    provider: "European Union Intellectual Property Office (Alicante)",
    category: "Marken & Amtsregister",
    endpoint: "https://www.tmdn.org/tmview/ & https://euipo.europa.eu/eSearch/",
    protocol: "Deep-Link",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Unionsmarken (UM) und nationale Marken aller 27 EU-Mitgliedsstaaten.",
    docsUrl: "https://www.tmdn.org/tmview/",
  },
  {
    id: "wipo-branddb",
    name: "WIPO Global Brand Database",
    provider: "World Intellectual Property Organization (Genf)",
    category: "Marken & Amtsregister",
    endpoint: "https://branddb.wipo.int/",
    protocol: "Deep-Link",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Internationale Markenregistrierungen nach dem Madrider System.",
    docsUrl: "https://www.wipo.int/reference/en/branddb/",
  },
  {
    id: "uspto-tsdr",
    name: "USPTO TSDR & Trademark Search",
    provider: "United States Patent and Trademark Office",
    category: "Marken & Amtsregister",
    endpoint: "https://tmsearch.uspto.gov/",
    protocol: "Deep-Link",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "US-Markenrecherche im amtlichen TSDR-System.",
    docsUrl: "https://www.uspto.gov/trademarks/search",
  },
  {
    id: "offene-register",
    name: "OffeneRegister.de & Handelsregister",
    provider: "Open Knowledge Foundation Deutschland",
    category: "Marken & Amtsregister",
    endpoint: "https://offeneregister.de/?q={name}",
    protocol: "Deep-Link",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Deutsches Handelsregister (GmbH, AG, UG) für Firmennamens-Kollisionen (§ 12 BGB / § 17 HGB).",
    docsUrl: "https://offeneregister.de/",
  },
];

export const OPEN_APIS_INVENTORY = OPEN_APIS;

export function getApiCategories(): string[] {
  return Array.from(new Set(OPEN_APIS.map((a) => a.category)));
}

export function getApisByCategory(category: string): OpenApiEntry[] {
  return OPEN_APIS.filter((a) => a.category === category);
}
