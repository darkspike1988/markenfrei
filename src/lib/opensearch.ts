import { SITE_NAME } from "@/lib/site";

/** Maskiert Zeichen, die in XML-Text und Attributwerten nicht stehen dürfen. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * OpenSearch-Beschreibung (opensearch.org) für „Als Suchmaschine hinzufügen“ im Browser.
 * Die Vorlage führt auf den Prüfer mit ?q=…; der Prüfer liest das beim Öffnen. Bewusst ohne
 * Vorschlags-URL, damit nicht schon jeder Tastendruck im Browser eine Prüfung auslöst.
 */
export function buildOpenSearchXml(origin: string): string {
  const base = xmlEscape(origin);
  return (
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">',
      `  <ShortName>${xmlEscape(SITE_NAME)}</ShortName>`,
      `  <Description>${xmlEscape(`${SITE_NAME}: Namen vorprüfen (Domains, Pakete, App Stores und mehr)`)}</Description>`,
      "  <InputEncoding>UTF-8</InputEncoding>",
      `  <Image width="192" height="192" type="image/png">${base}/icon-192.png</Image>`,
      `  <Url type="text/html" method="get" template="${base}/?q={searchTerms}"/>`,
      "</OpenSearchDescription>",
    ].join("\n") + "\n"
  );
}
