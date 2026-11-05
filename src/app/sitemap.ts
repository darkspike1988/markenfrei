import type { MetadataRoute } from "next";
import { publicUrl, SITEMAP_PATHS } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicUrl();
  return SITEMAP_PATHS.map((path) => ({
    url: new URL(path, base).toString(),
    changeFrequency: path === "/" ? "monthly" : "yearly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
