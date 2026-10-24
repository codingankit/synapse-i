import type { AuditReport } from "@synapse/core/audit";

export function errorResult(text: string) {
  return { isError: true as const, content: [{ type: "text" as const, text }] };
}

export function formatAuditReport(
  report: AuditReport,
  revisedContent: string | null,
) {
  const lines = [
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
              `[${i + 1}] Rule Violated: ${v.rule_text ?? `(unknown rule ${v.rule_id})`}\n    Reason: ${v.reason}\n    Suggested Fix: ${v.suggested_fix}`,
          )
          .join("\n\n")
      : "No specific rule violations found.",
  ];

  if (revisedContent) {
    lines.push("", "REVISED CONTENT (audited):", revisedContent);
  }
  lines.push("========================================");
  return lines.join("\n");
}
