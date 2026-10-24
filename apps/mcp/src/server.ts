import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetContext } from "@/tools/get-context";
import { registerAuditContent } from "@/tools/audit-content";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "synapse-mcp",
    version: "1.0.0",
  });

  registerGetContext(server);
  registerAuditContent(server);

  return server;
}
