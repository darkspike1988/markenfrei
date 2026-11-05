import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  // Das CSS ist klein (Tailwind, etwa 7 KB gepackt): Inline spart die blockierende Anfrage vor dem ersten Rendern.
  experimental: { inlineCss: true },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders(process.env.NODE_ENV === "development") }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
