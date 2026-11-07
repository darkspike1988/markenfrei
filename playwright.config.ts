import { defineConfig } from "@playwright/test";

/**
 * End-to-End-Tests der Oberfläche gegen den Produktions-Build (`npm run build` zuerst).
 * Die Prüf-API wird in den Tests gestubbt: kein Netz, keine Abfragen bei Dritten.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    locale: "de-DE",
  },
  webServer: {
    command: `npx next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
