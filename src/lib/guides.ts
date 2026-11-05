/** Die Anleitungsseiten: Pfad, kurzer Navigationstext und eine Zeile zum Inhalt. */
export const GUIDES = [
  {
    href: "/domain-pruefen",
    nav: "Domain prüfen",
    title: "Domain-Verfügbarkeit prüfen",
    blurb: "Was eine Registry-Abfrage (RDAP) sagt und was nicht.",
  },
  {
    href: "/paketname-pruefen",
    nav: "Paketnamen prüfen",
    title: "Paketnamen prüfen",
    blurb: "npm, PyPI, crates.io, GitHub und weitere Register.",
  },
  {
    href: "/app-name-pruefen",
    nav: "App-Namen prüfen",
    title: "App-Namen prüfen",
    blurb: "Was bei App Store und Google Play abgedeckt ist.",
  },
  {
    href: "/markenrecherche-vorbereiten",
    nav: "Markenrecherche vorbereiten",
    title: "Markenrecherche vorbereiten",
    blurb: "Links zu DPMA, EUIPO und WIPO, Suchstring und Checkliste.",
  },
] as const;

export type GuidePath = (typeof GUIDES)[number]["href"];
