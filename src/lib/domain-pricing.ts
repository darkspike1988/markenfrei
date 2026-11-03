/**
 * Domain Registrar Price Comparison Engine
 * Transparent, affiliate-free price comparison for domains (.de, .com, .app, .ai, .io, .dev).
 * Contrasts first-year promotional teaser rates vs. long-term renewal pricing.
 */

export type RegistrarPrice = {
  id: string;
  name: string;
  country: "DE" | "US" | "Global";
  firstYearEur: number;
  renewalEur: number;
  currencyLabel: string;
  isAtCost: boolean;
  isTeaserTrap: boolean;
  trapWarning?: string;
  features: string[];
  registerUrl: string;
};

export type TldPriceComparison = {
  tld: string;
  domain: string;
  cheapestRenewal: RegistrarPrice;
  cheapestFirstYear: RegistrarPrice;
  atCostRecommendation?: RegistrarPrice;
  registrars: RegistrarPrice[];
};

/**
 * Standardized pricing database (Stand 2026, EUR netto/brutto gerundet)
 */
const PRICING_DB: Record<
  string,
  Array<Omit<RegistrarPrice, "registerUrl"> & { urlTemplate: (domain: string) => string }>
> = {
  de: [
    {
      id: "netcup",
      name: "Netcup",
      country: "DE",
      firstYearEur: 5.04,
      renewalEur: 5.04,
      currencyLabel: "0,42 €/Monat (5,04 €/Jahr)",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Günstigster DE-Dauerpreis", "DNSSEC inklusive", "Inkl. Nameserver-Verwaltung"],
      urlTemplate: (d) => `https://www.netcup.de/bestellen/domainangebote.php?domain=${encodeURIComponent(d)}`,
    },
    {
      id: "hetzner",
      name: "Hetzner",
      country: "DE",
      firstYearEur: 5.95,
      renewalEur: 5.95,
      currencyLabel: "0,50 €/Monat (5,95 €/Jahr)",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Hetzner DNS Console", "Anycast Nameserver", "Keine versteckten Gebühren"],
      urlTemplate: (d) => `https://www.hetzner.com/de/domainregistration?domain=${encodeURIComponent(d)}`,
    },
    {
      id: "porkbun",
      name: "Porkbun",
      country: "US",
      firstYearEur: 6.05,
      renewalEur: 6.05,
      currencyLabel: "6,05 €/Jahr (~6,58 $)",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Kostenlose WHOIS Privacy", "Kostenloses SSL-Zertifikat", "URL-Weiterleitung"],
      urlTemplate: (d) => `https://porkbun.com/checkout/search?q=${encodeURIComponent(d)}`,
    },
    {
      id: "inwx",
      name: "INWX",
      country: "DE",
      firstYearEur: 6.90,
      renewalEur: 6.90,
      currencyLabel: "6,90 €/Jahr",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Deutscher Profi-Registrar (Berlin)", "REST-API & DynDNS", "2FA & DNSSEC"],
      urlTemplate: (d) => `https://www.inwx.de/de/domain/check#search=${encodeURIComponent(d)}`,
    },
    {
      id: "ionos",
      name: "IONOS (1&1)",
      country: "DE",
      firstYearEur: 1.00,
      renewalEur: 15.00,
      currencyLabel: "1,00 € im 1. Jahr, danach 15,00 €/Jahr",
      isAtCost: false,
      isTeaserTrap: true,
      trapWarning: "Lockangebot: Ab dem 2. Jahr verfünfzehnfacht sich der Preis (15,00 €/Jahr)!",
      features: ["1 E-Mail-Postfach inklusive", "24/7 Support"],
      urlTemplate: (d) => `https://www.ionos.de/domaincheckresult?domains=${encodeURIComponent(d)}`,
    },
  ],
  com: [
    {
      id: "cloudflare",
      name: "Cloudflare Registrar",
      country: "Global",
      firstYearEur: 9.60,
      renewalEur: 9.60,
      currencyLabel: "9,60 €/Jahr (~10,44 $ Großhandelspreis)",
      isAtCost: true,
      isTeaserTrap: false,
      features: ["At-Cost Großhandelspreis (0 $ Aufschlag)", "Kostenlose WHOIS Privacy", "DDoS & Anycast DNS"],
      urlTemplate: () => "https://www.cloudflare.com/products/registrar/",
    },
    {
      id: "porkbun",
      name: "Porkbun",
      country: "US",
      firstYearEur: 9.55,
      renewalEur: 9.55,
      currencyLabel: "9,55 €/Jahr (~10,37 $)",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Kostenlose WHOIS Privacy", "Keine Preissprünge", "Kostenlose E-Mail-Weiterleitung"],
      urlTemplate: (d) => `https://porkbun.com/checkout/search?q=${encodeURIComponent(d)}`,
    },
    {
      id: "netcup",
      name: "Netcup",
      country: "DE",
      firstYearEur: 15.48,
      renewalEur: 15.48,
      currencyLabel: "1,29 €/Monat (15,48 €/Jahr)",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Deutscher Vertragspartner", "DNSSEC", "Inkl. Webhosting-Option"],
      urlTemplate: (d) => `https://www.netcup.de/bestellen/domainangebote.php?domain=${encodeURIComponent(d)}`,
    },
    {
      id: "inwx",
      name: "INWX",
      country: "DE",
      firstYearEur: 14.90,
      renewalEur: 14.90,
      currencyLabel: "14,90 €/Jahr",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Profi-DNS-Verwaltung", "Deutscher Datenschutz (DSGVO)", "Anycast"],
      urlTemplate: (d) => `https://www.inwx.de/de/domain/check#search=${encodeURIComponent(d)}`,
    },
    {
      id: "namecheap",
      name: "Namecheap",
      country: "US",
      firstYearEur: 10.10,
      renewalEur: 14.80,
      currencyLabel: "10,10 € (~10,98 $) 1. Jahr, danach 14,80 €/Jahr",
      isAtCost: false,
      isTeaserTrap: true,
      trapWarning: "Verlängerung 40% teurer als das 1. Jahr.",
      features: ["Kostenlose Privacy Protection", "DNSSEC"],
      urlTemplate: (d) => `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(d)}`,
    },
    {
      id: "ionos",
      name: "IONOS (1&1)",
      country: "DE",
      firstYearEur: 1.00,
      renewalEur: 22.00,
      currencyLabel: "1,00 € im 1. Jahr, danach 22,00 €/Jahr",
      isAtCost: false,
      isTeaserTrap: true,
      trapWarning: "Starker Preissprung: Ab dem 2. Jahr 22,00 €/Jahr!",
      features: ["E-Mail-Postfach inklusive"],
      urlTemplate: (d) => `https://www.ionos.de/domaincheckresult?domains=${encodeURIComponent(d)}`,
    },
  ],
  app: [
    {
      id: "cloudflare",
      name: "Cloudflare Registrar",
      country: "Global",
      firstYearEur: 12.90,
      renewalEur: 12.90,
      currencyLabel: "12,90 €/Jahr (~14,00 $ At-Cost)",
      isAtCost: true,
      isTeaserTrap: false,
      features: ["Grosshandels-Originalpreis", "Erzwungenes HTTPS (HSTS)", "WHOIS Privacy"],
      urlTemplate: () => "https://www.cloudflare.com/products/registrar/",
    },
    {
      id: "porkbun",
      name: "Porkbun",
      country: "US",
      firstYearEur: 12.80,
      renewalEur: 12.80,
      currencyLabel: "12,80 €/Jahr (~13,90 $)",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["HSTS-Preloaded", "WHOIS Privacy", "Kostenlose Weiterleitungen"],
      urlTemplate: (d) => `https://porkbun.com/checkout/search?q=${encodeURIComponent(d)}`,
    },
    {
      id: "inwx",
      name: "INWX",
      country: "DE",
      firstYearEur: 18.90,
      renewalEur: 18.90,
      currencyLabel: "18,90 €/Jahr",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Deutscher Registrar", "DNSSEC & API"],
      urlTemplate: (d) => `https://www.inwx.de/de/domain/check#search=${encodeURIComponent(d)}`,
    },
    {
      id: "ionos",
      name: "IONOS",
      country: "DE",
      firstYearEur: 12.00,
      renewalEur: 24.00,
      currencyLabel: "12,00 € im 1. Jahr, danach 24,00 €/Jahr",
      isAtCost: false,
      isTeaserTrap: true,
      trapWarning: "Verdopplung ab dem 2. Jahr auf 24,00 €/Jahr.",
      features: ["Support 24/7"],
      urlTemplate: (d) => `https://www.ionos.de/domaincheckresult?domains=${encodeURIComponent(d)}`,
    },
  ],
  dev: [
    {
      id: "cloudflare",
      name: "Cloudflare Registrar",
      country: "Global",
      firstYearEur: 11.00,
      renewalEur: 11.00,
      currencyLabel: "11,00 €/Jahr (~12,00 $ At-Cost)",
      isAtCost: true,
      isTeaserTrap: false,
      features: ["Großhandelspreis ohne Markup", "HSTS preloaded", "Free WHOIS"],
      urlTemplate: () => "https://www.cloudflare.com/products/registrar/",
    },
    {
      id: "porkbun",
      name: "Porkbun",
      country: "US",
      firstYearEur: 12.80,
      renewalEur: 12.80,
      currencyLabel: "12,80 €/Jahr (~13,90 $)",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["WHOIS Privacy inklusive", "SSL Zertifikate"],
      urlTemplate: (d) => `https://porkbun.com/checkout/search?q=${encodeURIComponent(d)}`,
    },
    {
      id: "inwx",
      name: "INWX",
      country: "DE",
      firstYearEur: 18.90,
      renewalEur: 18.90,
      currencyLabel: "18,90 €/Jahr",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Deutscher Registrar", "DNSSEC"],
      urlTemplate: (d) => `https://www.inwx.de/de/domain/check#search=${encodeURIComponent(d)}`,
    },
  ],
  io: [
    {
      id: "porkbun",
      name: "Porkbun",
      country: "US",
      firstYearEur: 32.10,
      renewalEur: 32.10,
      currencyLabel: "32,10 €/Jahr (~34,90 $)",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Günstigster IO-Preis weltweit", "Kostenlose WHOIS Privacy"],
      urlTemplate: (d) => `https://porkbun.com/checkout/search?q=${encodeURIComponent(d)}`,
    },
    {
      id: "cloudflare",
      name: "Cloudflare Registrar",
      country: "Global",
      firstYearEur: 36.00,
      renewalEur: 36.00,
      currencyLabel: "36,00 €/Jahr (~39,00 $ At-Cost)",
      isAtCost: true,
      isTeaserTrap: false,
      features: ["At-Cost Großhandel", "DNSSEC"],
      urlTemplate: () => "https://www.cloudflare.com/products/registrar/",
    },
    {
      id: "hetzner",
      name: "Hetzner",
      country: "DE",
      firstYearEur: 48.00,
      renewalEur: 48.00,
      currencyLabel: "4,00 €/Monat (48,00 €/Jahr)",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Deutscher Hoster", "Hetzner DNS"],
      urlTemplate: (d) => `https://www.hetzner.com/de/domainregistration?domain=${encodeURIComponent(d)}`,
    },
    {
      id: "inwx",
      name: "INWX",
      country: "DE",
      firstYearEur: 49.90,
      renewalEur: 49.90,
      currencyLabel: "49,90 €/Jahr",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Profi DNS & API"],
      urlTemplate: (d) => `https://www.inwx.de/de/domain/check#search=${encodeURIComponent(d)}`,
    },
  ],
  ai: [
    {
      id: "porkbun",
      name: "Porkbun",
      country: "US",
      firstYearEur: 63.50,
      renewalEur: 63.50,
      currencyLabel: "63,50 €/Jahr (~69,00 $)",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Günstigster AI-Registrar", "2-Jahres-Minimum der Registry"],
      urlTemplate: (d) => `https://porkbun.com/checkout/search?q=${encodeURIComponent(d)}`,
    },
    {
      id: "cloudflare",
      name: "Cloudflare Registrar",
      country: "Global",
      firstYearEur: 64.50,
      renewalEur: 64.50,
      currencyLabel: "64,50 €/Jahr (~70,00 $ At-Cost)",
      isAtCost: true,
      isTeaserTrap: false,
      features: ["At-Cost Einkaufspreis", "Kein Markup"],
      urlTemplate: () => "https://www.cloudflare.com/products/registrar/",
    },
    {
      id: "inwx",
      name: "INWX",
      country: "DE",
      firstYearEur: 84.00,
      renewalEur: 84.00,
      currencyLabel: "84,00 €/Jahr",
      isAtCost: false,
      isTeaserTrap: false,
      features: ["Deutscher Support", "DSGVO"],
      urlTemplate: (d) => `https://www.inwx.de/de/domain/check#search=${encodeURIComponent(d)}`,
    },
  ],
};

export function compareDomainPrices(domain: string): TldPriceComparison | null {
  const parts = domain.toLowerCase().split(".");
  const tld = parts.length > 1 ? parts[parts.length - 1] : "de";
  const list = PRICING_DB[tld];

  if (!list || list.length === 0) return null;

  const registrars: RegistrarPrice[] = list.map((item) => ({
    id: item.id,
    name: item.name,
    country: item.country,
    firstYearEur: item.firstYearEur,
    renewalEur: item.renewalEur,
    currencyLabel: item.currencyLabel,
    isAtCost: item.isAtCost,
    isTeaserTrap: item.isTeaserTrap,
    trapWarning: item.trapWarning,
    features: item.features,
    registerUrl: item.urlTemplate(domain),
  }));

  // Sort by renewal price ascending (long-term cost to the founder!)
  const sortedByRenewal = [...registrars].sort((a, b) => a.renewalEur - b.renewalEur);
  const sortedByFirstYear = [...registrars].sort((a, b) => a.firstYearEur - b.firstYearEur);
  const atCost = registrars.find((r) => r.isAtCost);

  return {
    tld,
    domain,
    cheapestRenewal: sortedByRenewal[0],
    cheapestFirstYear: sortedByFirstYear[0],
    atCostRecommendation: atCost,
    registrars: sortedByRenewal,
  };
}
