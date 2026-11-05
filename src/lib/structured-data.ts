import { publicUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/** schema.org-Beschreibung der Anwendung für die Startseite (rein statisch, keine Nutzereingaben). */
export function webApplicationJsonLd(base: URL = publicUrl()): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: base.origin + "/",
    description: SITE_DESCRIPTION,
    inLanguage: "de",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Alle",
    isAccessibleForFree: true,
    license: "https://opensource.org/licenses/MIT",
    codeRepository: "https://github.com/darkspike1988/markenfrei",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  };
  // "<" maskieren, damit der Inhalt nie ein </script> beenden kann.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
