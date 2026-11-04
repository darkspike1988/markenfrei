/**
 * Zentrales Inventar der Quellen von Markenfrei. Zero-Key, öffentlich.
 * Einträge mit Protokoll "Deep-Link" sind reine Verweise (es erfolgt keine Abfrage).
 * Alle anderen Einträge werden im Code live abgefragt.
 */

export type OpenApiRegion = "Europa" | "Amerika" | "Asien" | "Global";

export type OpenApiEntry = {
  id: string;
  name: string;
  provider: string;
  region: OpenApiRegion;
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
  // --- Domains & DNS: Europa ---
  {
    id: "denic-rdap",
    name: "DENIC eG RDAP (.de)",
    provider: "DENIC eG (Frankfurt am Main, Deutschland)",
    region: "Europa",
    category: "Domains & DNS",
    endpoint: "https://rdap.denic.de/domain/{domain}",
    protocol: "RDAP (RFC 7484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Autoritative Echtzeit-Verfügbarkeitsabfrage für alle .de-Domains direkt bei der deutschen Registry.",
    docsUrl: "https://www.denic.de/service/rdap/",
  },
  {
    id: "afnic-rdap",
    name: "NIC.fr (AFNIC) RDAP (.fr)",
    provider: "Association Française pour le Nommage Internet en Coopération (Frankreich)",
    region: "Europa",
    category: "Domains & DNS",
    endpoint: "https://rdap.nic.fr/domain/{domain}",
    protocol: "RDAP (RFC 7484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Offizielle französische Registry-Abfrage für .fr-Domains.",
    docsUrl: "https://www.afnic.fr/en/products-and-services/services/rdap/",
  },
  {
    id: "nominet-rdap",
    name: "Nominet UK RDAP (.uk)",
    provider: "Nominet UK (Oxford, Vereinigtes Königreich)",
    region: "Europa",
    category: "Domains & DNS",
    endpoint: "https://rdap.nominet.uk/uk/domain/{domain}",
    protocol: "RDAP (RFC 7484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Offizieller RDAP-Dienst der britischen Registry für .uk-Domains.",
    docsUrl: "https://www.nominet.uk/rdap/",
  },

  // --- Domains & DNS: Amerika ---
  {
    id: "verisign-rdap",
    name: "Verisign RDAP (.com / .net)",
    provider: "Verisign Inc. (Reston, Virginia, USA)",
    region: "Amerika",
    category: "Domains & DNS",
    endpoint: "https://rdap.verisign.com/com/v1/domain/{domain}",
    protocol: "RDAP (RFC 7484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Direkte autoritative Registry-Prüfung für .com und .net ohne Zwischenschaltung unzuverlässiger WHOIS-Proxies.",
    docsUrl: "https://www.verisign.com/en_US/channel-resources/domain-registry-products/rdap/index.xhtml",
  },
  {
    id: "google-registry-rdap",
    name: "Google Registry RDAP (.app / .dev)",
    provider: "Charleston Road Registry / Google LLC (Mountain View, USA)",
    region: "Amerika",
    category: "Domains & DNS",
    endpoint: "https://pubapi.registry.google/rdap/domain/{domain}",
    protocol: "RDAP (RFC 7484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Autoritative Registry für moderne entwickler- und app-fokussierte TLDs (.app, .dev, .page).",
    docsUrl: "https://www.registry.google/about/rdap/",
  },
  {
    id: "identity-digital-rdap",
    name: "Identity Digital RDAP (.io / .ai)",
    provider: "Identity Digital Inc. (Bellevue, Washington, USA)",
    region: "Amerika",
    category: "Domains & DNS",
    endpoint: "https://rdap.identitydigital.services/rdap/domain/{domain}",
    protocol: "RDAP (RFC 7484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Offizieller RDAP-Endpunkt für Tech-TLDs wie .io, .ai und .tech.",
    docsUrl: "https://www.identity.digital/",
  },

  // --- Domains & DNS: Asien ---
  {
    id: "kisa-rdap",
    name: "KISA / KRNIC RDAP (.kr)",
    provider: "Korea Internet & Security Agency (Seoul, Südkorea)",
    region: "Asien",
    category: "Domains & DNS",
    endpoint: "https://rdap.nic.or.kr/domain/{domain}",
    protocol: "RDAP (RFC 7484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Offizielle südkoreanische Registry für .kr-Domains.",
    docsUrl: "https://krnic.or.kr/",
  },

  // --- DNS-over-HTTPS Fallback (Global) ---
  {
    id: "google-doh",
    name: "Google Public DNS-over-HTTPS (DoH)",
    provider: "Google LLC",
    region: "Global",
    category: "Domains & DNS",
    endpoint: "https://dns.google/resolve?name={domain}&type=NS",
    protocol: "DoH (RFC 8484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Fallback-Ebene bei RDAP-Rate-Limits: Prüft NS- und SOA-Zoneneinträge via verschlüsseltem DNS.",
    docsUrl: "https://developers.google.com/speed/public-dns/docs/doh",
  },
  {
    id: "cloudflare-doh",
    name: "Cloudflare 1.1.1.1 DNS-over-HTTPS",
    provider: "Cloudflare Inc.",
    region: "Global",
    category: "Domains & DNS",
    endpoint: "https://cloudflare-dns.com/dns-query?name={domain}&type=SOA",
    protocol: "DoH (RFC 8484)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Sekundärer DoH-Resolver für unabhängige Zweitverifikation von Zoneneinträgen.",
    docsUrl: "https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/",
  },

  // --- Mobile App Stores & Werktitelschutz ---
  {
    id: "apple-itunes-search",
    name: "Apple iTunes Search & Store API",
    provider: "Apple Inc. (Cupertino, USA)",
    region: "Amerika",
    category: "Mobile App Stores",
    endpoint: "https://itunes.apple.com/search?term={name}&country=de&entity=software",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Werktitelschutz (§ 5 Abs. 3 MarkenG): Prüft den deutschen iOS App Store auf gleichnamige Software und Apps.",
    docsUrl: "https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iQuerySearch/index.html",
  },
  {
    id: "apple-itunes-lookup",
    name: "Apple iTunes Bundle-ID Lookup API",
    provider: "Apple Inc. (Cupertino, USA)",
    region: "Amerika",
    category: "Mobile App Stores",
    endpoint: "https://itunes.apple.com/lookup?bundleId={bundleId}&country=de",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Verifiziert, ob ein Reverse-DNS App-Bundle-Identifier (z. B. de.wachwerk.app) im App Store existiert.",
    docsUrl: "https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iQuerySearch/index.html",
  },
  {
    id: "google-play-store",
    name: "Google Play Store Namespace Check",
    provider: "Google LLC (Mountain View, USA)",
    region: "Amerika",
    category: "Mobile App Stores",
    endpoint: "https://play.google.com/store/apps/details?id={packageId}",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft, ob ein Android-Paketname im Google Play Store belegt ist.",
    docsUrl: "https://play.google.com/about/developer-distribution-agreement.html",
  },

  // --- Wissen & Enzyklopädie ---
  {
    id: "wikipedia-summary",
    name: "Wikipedia Page Summary REST API",
    provider: "Wikimedia Foundation (San Francisco, USA / Global)",
    region: "Global",
    category: "Wissen & Enzyklopädie",
    endpoint: "https://de.wikipedia.org/api/rest_v1/page/summary/{title}",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Ermittelt, ob der Name ein bekanntes enzyklopädisches Lemma, Unternehmen oder eine weltbekannte Marke darstellt.",
    docsUrl: "https://en.wikipedia.org/api/rest_v1/",
  },
  {
    id: "duckduckgo-instant",
    name: "DuckDuckGo Instant Answer API",
    provider: "DuckDuckGo Inc. (Paoli, Pennsylvania, USA)",
    region: "Amerika",
    category: "Wissen & Enzyklopädie",
    endpoint: "https://api.duckduckgo.com/?q={name}&format=json&no_html=1",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Zero-Click-Enzyklopädie: Findet Infoboxen und Marken-Kurzbeschreibungen bekannter Entitäten.",
    docsUrl: "https://duckduckgo.com/api",
  },
  {
    id: "wikidata-entity-search",
    name: "Wikidata Entity Search Open API",
    provider: "Wikimedia Deutschland e.V. (Berlin, Deutschland)",
    region: "Europa",
    category: "Wissen & Enzyklopädie",
    endpoint: "https://www.wikidata.org/w/api.php?action=wbsearchentities&search={name}&language=de&format=json",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Durchsucht strukturierte Wissensgraphen nach bestehenden Unternehmen, Softwareprojekten und Marken.",
    docsUrl: "https://www.wikidata.org/w/api.php",
  },

  // --- Entwickler-Ökosysteme ---
  {
    id: "github-users",
    name: "GitHub Users & Organizations REST API",
    provider: "GitHub Inc. / Microsoft (San Francisco, USA)",
    region: "Amerika",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://api.github.com/users/{username}",
    protocol: "REST (JSON)",
    auth: "Öffentlich / Rate-Limited",
    purpose: "Prüft, ob der Name als Nutzer- oder Organisations-Handle auf GitHub bereits registriert ist.",
    docsUrl: "https://docs.github.com/en/rest/users/users",
  },
  {
    id: "github-repos",
    name: "GitHub Repository Search API",
    provider: "GitHub Inc. / Microsoft (San Francisco, USA)",
    region: "Amerika",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://api.github.com/search/repositories?q={name}+in:name&sort=stars",
    protocol: "REST (JSON)",
    auth: "Öffentlich / Rate-Limited",
    purpose: "Findet bekannte Open-Source-Repositories mit Sternen, um Namenskollisionen im Softwarebereich zu vermeiden.",
    docsUrl: "https://docs.github.com/en/rest/search/search#search-repositories",
  },
  {
    id: "npm-registry",
    name: "npm Public Registry API",
    provider: "npm Inc. / GitHub (San Francisco, USA)",
    region: "Amerika",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://registry.npmjs.org/{packageName}",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft den globalen JavaScript- und TypeScript-Paketnamensraum auf Belegung.",
    docsUrl: "https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md",
  },
  {
    id: "pypi-registry",
    name: "PyPI JSON API",
    provider: "Python Software Foundation (Beaverton, Oregon, USA)",
    region: "Amerika",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://pypi.org/pypi/{packageName}/json",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft den globalen Python-Paketindex auf bestehende Bibliotheken.",
    docsUrl: "https://warehouse.pypa.io/api-reference/json.html",
  },
  {
    id: "crates-io",
    name: "Crates.io Cargo Registry API",
    provider: "Rust Foundation (Portland, Oregon, USA)",
    region: "Amerika",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://crates.io/api/v1/crates/{crateName}",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft den Rust Cargo Paket-Namensraum.",
    docsUrl: "https://crates.io/data-access",
  },
  {
    id: "homebrew-api",
    name: "Homebrew Formulae API",
    provider: "Homebrew Association (Global)",
    region: "Global",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://formulae.brew.sh/api/formula/{formula}.json",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft den Paketnamensraum für macOS- und Linux-CLI-Tools.",
    docsUrl: "https://formulae.brew.sh/docs/api/",
  },
  {
    id: "go-proxy",
    name: "Go Module Proxy Index",
    provider: "Google LLC / Go Team",
    region: "Amerika",
    category: "Entwickler-Ökosysteme",
    endpoint: "https://proxy.golang.org/{module}/@v/list",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Prüft das globale Go-Modul-Ökosystem auf existierende Bibliotheksnamen.",
    docsUrl: "https://proxy.golang.org/",
  },

  // --- Linguistik & Wortfelder ---
  {
    id: "openthesaurus",
    name: "OpenThesaurus.de Open Data API",
    provider: "OpenThesaurus e.V. (Deutschland)",
    region: "Europa",
    category: "Linguistik & Wortfelder",
    endpoint: "https://www.openthesaurus.de/synonyme/search?q={term}&format=application/json",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Deutsche Synonyme, Assoziationen und Wortstämme zur freien Morphem-Synthese.",
    docsUrl: "https://www.openthesaurus.de/about/api",
  },
  {
    id: "datamuse",
    name: "Datamuse / WordNet Open API",
    provider: "Datamuse / Princeton WordNet (USA)",
    region: "Amerika",
    category: "Linguistik & Wortfelder",
    endpoint: "https://api.datamuse.com/words?rel_trg={term}&max=15",
    protocol: "REST (JSON)",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Semantisch verwandte Begriffe, klanggleiche Stämme und Portmanteau-Wortblends.",
    docsUrl: "https://www.datamuse.com/api/",
  },

  // --- Marken & Amtsregister: Europa ---
  {
    id: "dpma-register",
    name: "DPMAregister (Deutsches Patent- und Markenamt)",
    provider: "DPMA (München, Deutschland)",
    region: "Europa",
    category: "Marken & Amtsregister",
    endpoint: "https://register.dpma.de/DPMAregister/marke/einsteiger",
    protocol: "Deep-Link",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Amtliche deutsche Markenregister-Recherche mit vorbereitetem Expertensuchstring.",
    docsUrl: "https://www.dpma.de/marken/recherche/dpmaregister/index.html",
  },
  {
    id: "tmview",
    name: "TMview (Europäisches & Internationales Markenportal)",
    provider: "EUIPO / WIPO / Nationale Markenämter (Alicante, Spanien)",
    region: "Europa",
    category: "Marken & Amtsregister",
    endpoint: "https://www.tmdn.org/tmview/#/tmview/results?basicSearch={name}",
    protocol: "Deep-Link",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Größte weltweite Markendatenbank mit Zugriff auf über 110 Millionen Marken aus DPMA, EUIPO und WIPO.",
    docsUrl: "https://www.tmdn.org/tmview/welcome#/",
  },
  {
    id: "euipo-esearch",
    name: "EUIPO eSearch Plus (Unionsmarken)",
    provider: "Amt der Europäischen Union für geistiges Eigentum (EUIPO)",
    region: "Europa",
    category: "Marken & Amtsregister",
    endpoint: "https://euipo.europa.eu/eSearch/#details/trademarks/{name}",
    protocol: "Deep-Link",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "EU-weite Markeneintragungen mit Schutz in allen 27 EU-Mitgliedsstaaten.",
    docsUrl: "https://euipo.europa.eu/ohimportal/de/online-services",
  },
  {
    id: "offene-register",
    name: "OffeneRegister.de & Handelsregister",
    provider: "Open Knowledge Foundation Deutschland",
    region: "Europa",
    category: "Marken & Amtsregister",
    endpoint: "https://offeneregister.de/?q={name}",
    protocol: "Deep-Link",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Deutsches Handelsregister (GmbH, AG, UG) für Firmennamens-Kollisionen (§ 12 BGB / § 17 HGB).",
    docsUrl: "https://offeneregister.de/",
  },

  // --- Marken & Amtsregister: Amerika ---
  {
    id: "uspto-tsdr",
    name: "USPTO TSDR & Trademark Search",
    provider: "United States Patent and Trademark Office (Alexandria, Virginia, USA)",
    region: "Amerika",
    category: "Marken & Amtsregister",
    endpoint: "https://tmsearch.uspto.gov/search/search-results?text={name}",
    protocol: "Deep-Link",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "US-Markenrecherche im amtlichen TSDR-System.",
    docsUrl: "https://www.uspto.gov/trademarks/search",
  },
  {
    id: "wipo-brand-db",
    name: "WIPO Global Brand Database",
    provider: "World Intellectual Property Organization (Genf, Schweiz / International)",
    region: "Global",
    category: "Marken & Amtsregister",
    endpoint: "https://branddb.wipo.int/en/quicksearch/results?v={name}",
    protocol: "Deep-Link",
    auth: "100% Kostenlos / Zero-Key",
    purpose: "Weltweite Marken nach dem Madrider Abkommen (Internationale Registrierungen).",
    docsUrl: "https://branddb.wipo.int/",
  },

];

export const OPEN_APIS_INVENTORY = OPEN_APIS;

export function getApiCategories(): string[] {
  return Array.from(new Set(OPEN_APIS.map((a) => a.category)));
}

export function getApiRegions(): OpenApiRegion[] {
  return ["Europa", "Amerika", "Asien", "Global"];
}

export function getApisByCategory(category: string): OpenApiEntry[] {
  return OPEN_APIS.filter((a) => a.category === category);
}

export function getApisByRegion(region: OpenApiRegion): OpenApiEntry[] {
  return OPEN_APIS.filter((a) => a.region === region);
}
