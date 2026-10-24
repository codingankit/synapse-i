import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import { getContext } from "@synapse/core/context";
import { errorResult } from "@/types";

export function registerGetContext(server: McpServer) {
  server.registerTool(
    "synapse-get-context",
    {
      description:
        "Fetch brand governance context, compliance rules, and execution directives before generating or drafting content. Returns the retrieved rules verbatim, split into MUST FOLLOW and MUST NOT.",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .describe(
            "The user prompt, brief, or topic for which brand context is required",
          ),
      },
      outputSchema: {
        has_context: z
          .boolean()
          .describe("False only when the brand memory store is empty."),
        rules: z.array(
          z.object({
            id: z.string(),
            rule: z.string(),
            is_negative: z.boolean(),
          }),
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ prompt }) => {
      try {
        const result = await getContext(prompt);

        if (!result.ok) {
          return errorResult(
            `Brand context unavailable (${result.reason}): ${result.message}. Do NOT assume that no brand rules apply.`,
          );
        }

        return {
          content: [{ type: "text" as const, text: result.systemDirective }],
          structuredContent: {
            has_context: result.hasContext,
            rules: result.atoms.map((a) => ({
              id: a.id,
              rule: a.content,
              is_negative: a.isNegative,
            })),
          },
        };
      } catch (err: unknown) {
        console.error("[MCP Tool Error - synapse-get-context]:", err);
        return errorResult(
          `Failed to fetch context: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    },
  );
}
