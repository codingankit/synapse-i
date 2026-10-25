import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "@/tools";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "synapse-mcp",
    version: "1.0.0",
  });

  registerAllTools(server);

  return server;
}
