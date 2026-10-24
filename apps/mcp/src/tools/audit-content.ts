import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import { runAudit } from "@synapse/core/audit";
import { errorResult, formatAuditReport } from "@/types";

export function registerAuditContent(server: McpServer) {
  server.registerTool(
    "synapse-audit-content",
    {
      description:
        "Cross-examine draft copy or generated content against brand memory to audit policy compliance and flag violations. Optionally revise and re-audit a failing draft.",
      inputSchema: {
        content: z
          .string()
          .min(1)
          .describe("The draft content or copy to audit against brand memory"),
        max_revisions: z
          .number()
          .int()
          .min(0)
          .max(3)
          .default(0)
          .describe(
            "If > 0, a failing draft is rewritten and re-audited up to this many times. Default 0 (audit only).",
          ),
      },
      outputSchema: {
        status: z.enum(["PASS", "FAIL"]),
        score: z.number(),
        feedback: z.string(),
        violations: z.array(
          z.object({
            rule_id: z.string(),
            rule: z.string().optional(),
            reason: z.string(),
            suggested_fix: z.string(),
          }),
        ),
        revised_content: z.string().optional(),
        audits_run: z.number(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ content, max_revisions }) => {
      try {
        const result = await runAudit(content, {
          maxRevisions: max_revisions,
        });

        if (!result.ok) {
          return errorResult(
            `Audit unavailable (${result.reason}): ${result.message}. The content was NOT audited.`,
          );
        }

        const { report, revisedContent, metadata } = result;

        return {
          content: [
            {
              type: "text" as const,
              text: formatAuditReport(report, revisedContent),
            },
          ],
          structuredContent: {
            status: report.status,
            score: report.score,
            feedback: report.feedback,
            violations: report.violations.map((v) => ({
              rule_id: v.rule_id,
              ...(v.rule_text !== null && { rule: v.rule_text }),
              reason: v.reason,
              suggested_fix: v.suggested_fix,
            })),
            ...(revisedContent !== null && { revised_content: revisedContent }),
            audits_run: metadata.auditsRun,
          },
        };
      } catch (err: unknown) {
        console.error("[MCP Tool Error - synapse-audit-content]:", err);
        return errorResult(
          `Audit failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    },
  );
}
