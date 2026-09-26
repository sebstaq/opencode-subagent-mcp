#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { reapOrphans } from "./opencode/server.js";
import { createServer } from "./server.js";

reapOrphans();

const config = await loadConfig();
const { mcp, shutdown } = createServer(config);

const exit = () => {
  shutdown();
  process.exit(0);
};
process.on("SIGINT", exit);
process.on("SIGTERM", exit);
process.stdin.on("close", exit);
process.on("exit", shutdown);

await mcp.connect(new StdioServerTransport());
