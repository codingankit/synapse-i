import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { serve } from "@hono/node-server";
import z from "zod";
import { getContext } from "@synapse/core/context";
import { runAuditCore, type AuditReport } from "@synapse/core/audit";

const app = new Hono();

const server = new McpServer({
  name: "synapse-mcp",
  version: "1.0.0",
});

server.registerTool(
  "synapse-get-context",
  {
    description:
      "Fetch brand governance context, compliance rules, and execution directives before generating or drafting content.",
    inputSchema: {
      prompt: z
        .string()
        .describe(
          "The user prompt, brief, or topic for which brand context is required",
        ),
    },
  },
  async ({ prompt }) => {
    try {
      const result = await getContext(prompt);

      return {
        content: [
          {
            type: "text",
            text: result.systemDirective,
          },
        ],
      };
    } catch (err: any) {
      console.error("[MCP Tool Error - synapse-get-context]:", err);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to fetch context: ${err?.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.registerTool(
  "synapse-audit-content",
  {
    description:
      "Cross-examine draft copy or generated content against brand memory to audit policy compliance and flag violations.",
    inputSchema: {
      content: z
        .string()
        .describe("The draft content or copy to audit against brand memory"),
    },
  },
  async ({ content }) => {
    try {
      const result = await runAuditCore(content);

      if (!result.report) {
        return {
          content: [
            {
              type: "text",
              text: "Audit completed: No compliance issues detected.",
            },
          ],
        };
      }

      const report: AuditReport = result.report;
      const formattedReport = [
        "### SYNAPSE BRAND GOVERNANCE AUDIT ###",
        `STATUS: ${report.status}`,
        `SCORE: ${report.score}/100`,
        `FEEDBACK: ${report.feedback}`,
        "",
        report.violations.length > 0
          ? "VIOLATIONS DETECTED:\n" +
            report.violations
              .map(
                (v, i) =>
                  `[${i + 1}] Rule Violated: ${v.rule_violated}\n    Reason: ${v.reason}\n    Suggested Fix: ${v.suggested_fix}`,
              )
              .join("\n\n")
          : "No specific rule violations found.",
        "========================================",
      ].join("\n");

      return {
        content: [
          {
            type: "text",
            text: formattedReport,
          },
        ],
      };
    } catch (err: any) {
      console.error("[MCP Tool Error - synapse-audit-content]:", err);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Audit failed: ${err?.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

const transport = new StreamableHTTPTransport();

app.all("/mcp", async (c) => {
  if (!server.isConnected()) {
    await server.connect(transport);
  }

  return transport.handleRequest(c);
});

const port = Number(process.env.PORT) || 7000;

serve({
  fetch: app.fetch,
  port,
});

console.error(`Synapse MCP Server is running on http://localhost:${port}/mcp`);
