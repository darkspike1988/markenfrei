import { buildLlmsTxt } from "@/lib/llms-txt";
import { publicUrl } from "@/lib/site";

/** GET /llms.txt: Kurzbeschreibung für Sprachmodelle (llmstxt.org). Adresse zur Laufzeit gelesen. */
export function GET(req: Request): Response {
  void req.headers;
  return new Response(buildLlmsTxt(publicUrl().origin), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
