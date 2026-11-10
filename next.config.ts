import path from "node:path";
import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

// next.config.ts wird als CommonJS geladen: __dirname ist das Projektverzeichnis (im Docker-Image /app).
const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  // Ohne festen Root nimmt Next die package-lock.json eines Elternverzeichnisses als Workspace-Root und warnt bei jedem Build/Start.
  outputFileTracingRoot: projectRoot,
  // Das CSS ist klein (Tailwind, etwa 7 KB gepackt): Inline spart die blockierende Anfrage vor dem ersten Rendern.
  experimental: { inlineCss: true },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders(process.env.NODE_ENV === "development") }];
  },
  turbopack: {
    root: projectRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
