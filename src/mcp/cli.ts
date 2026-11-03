#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMarkenfreiMcpServer } from "./server";

async function main() {
  const server = createMarkenfreiMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MarkenFrei MCP Server running on stdio (PID: " + process.pid + ")");
}

main().catch((err) => {
  console.error("MarkenFrei MCP Server Fatal Error:", err);
  process.exit(1);
});
