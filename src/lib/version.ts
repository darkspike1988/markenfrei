import pkg from "../../package.json";

/**
 * Version der Anwendung aus package.json. Sie ist mit MCP_SERVER_VERSION (src/mcp/server.ts)
 * und den Versionen im Ordner mcp/ gleich; tests/docs-consistency.test.ts prüft das.
 */
export const APP_VERSION: string = pkg.version;
