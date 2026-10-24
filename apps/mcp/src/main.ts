import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import { serve } from "@hono/node-server";
import { createMcpServer } from "./server";

const app = new Hono();

app.all("/mcp", async (c) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c);
});

const port = Number(process.env.PORT) || 7000;

serve({
  fetch: app.fetch,
  port,
});

console.error(`Synapse MCP Server is running on http://localhost:${port}/mcp`);
