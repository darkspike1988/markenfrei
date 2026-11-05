import type { MetadataRoute } from "next";
import { publicUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = publicUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/_gc/"] }],
    sitemap: new URL("/sitemap.xml", base).toString(),
    host: base.origin,
  };
}
