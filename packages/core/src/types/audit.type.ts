import z from "zod";
import { Annotation } from "@langchain/langgraph";
import type { RetrievalError } from "./retrieval.type";

export const ViolationSchema = z.object({
  rule_violated: z
    .string()
    .describe("The specific brand rule or memory atom violated."),
  reason: z
    .string()
    .describe("Explanation of why the proposed content violates this rule."),
  suggested_fix: z
    .string()
    .describe("Clear actionable guidance to resolve the violation."),
});

export const AuditReportSchema = z.object({
  status: z.enum(["PASS", "FAIL", "UNAUDITED"]),
  score: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Compliance score from 0 to 100, where 100 is perfect and 0 is total failure.",
    ),
  violations: z.array(ViolationSchema),
  feedback: z
    .string()
    .describe("A summary of the audit for the agency or user."),
});

export type AuditViolation = z.infer<typeof ViolationSchema>;
export type AuditReport = z.infer<typeof AuditReportSchema>;

export const AuditStateAnnotation = Annotation.Root({
  content: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  retrievedAtoms: Annotation<string[]>({
    reducer: (x, y) => (y.length > 0 ? y : x),
    default: () => [],
  }),
  retrievalError: Annotation<RetrievalError | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  report: Annotation<AuditReport | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  iteration: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
});

export type AuditState = typeof AuditStateAnnotation.State;
