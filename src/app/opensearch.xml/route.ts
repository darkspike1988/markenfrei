import { buildOpenSearchXml } from "@/lib/opensearch";
import { publicUrl } from "@/lib/site";

/** GET /opensearch.xml: Suchbeschreibung für den Browser. Adresse zur Laufzeit gelesen. */
export function GET(req: Request): Response {
  void req.headers;
  return new Response(buildOpenSearchXml(publicUrl().origin), {
    headers: {
      "Content-Type": "application/opensearchdescription+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
