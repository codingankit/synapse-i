import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetContext } from "@/tools/get-context";
import { registerAuditContent } from "@/tools/audit-content";

const registrars: ReadonlyArray<(server: McpServer) => void> = [
  registerGetContext,
  registerAuditContent,
];

export function registerAllTools(server: McpServer): void {
  for (const register of registrars) register(server);
}
