import z from "zod";
import type { Atom, RetrievalFailureReason } from "./retrieval.type";

/** Scores at or above this are a PASS. Status is derived in code, not by the LLM. */
export const AUDIT_PASS_THRESHOLD = 80;

/** What the LLM is asked to produce. Note: no `status` field on purpose. */
export const AuditLlmSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Compliance score from 0 to 100, where 100 is perfect and 0 is total failure.",
    ),
  violations: z.array(
    z.object({
      rule_id: z
        .string()
        .describe("The id attribute of the violated <rule> element."),
      reason: z
        .string()
        .describe("Why the proposed content violates this rule."),
      suggested_fix: z
        .string()
        .describe("Clear actionable guidance to resolve the violation."),
    }),
  ),
  feedback: z
    .string()
    .describe("A short summary of the audit for the agency or user."),
});

export type AuditLlmOutput = z.infer<typeof AuditLlmSchema>;

export type AuditViolation = AuditLlmOutput["violations"][number] & {
  /** Resolved from `rule_id`; null if the model cited an id we never supplied. */
  rule_text: string | null;
};

export type AuditStatus = "PASS" | "FAIL";

export interface AuditReport {
  status: AuditStatus;
  score: number;
  violations: AuditViolation[];
  feedback: string;
}

export type AuditFailureReason = RetrievalFailureReason | "LLM_PROVIDER_ERROR";

export interface AuditFailure {
  reason: AuditFailureReason;
  message: string;
}

export interface AuditMetadata {
  auditsRun: number;
  revisionsApplied: number;
  atomsEvaluated: number;
}

export interface AuditOptions {
  /**
   * If > 0, a failing draft is rewritten and re-audited up to this many times
   * (clamped to 3). Default 0: audit only.
   */
  maxRevisions?: number;
}

/**
 * An infrastructure failure is `ok: false`, never a fake report. A completed
 * audit (PASS or FAIL) is `ok: true`.
 */
export type AuditOutcome =
  | {
      ok: true;
      report: AuditReport;
      /** The revised draft that `report` was computed for, or null if unchanged. */
      revisedContent: string | null;
      atoms: Atom[];
      metadata: AuditMetadata;
    }
  | ({ ok: false } & AuditFailure);
