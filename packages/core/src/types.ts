import z from "zod";
import { Annotation } from "@langchain/langgraph";

export type IngestResult =
  | { success: true; fileName: string; atomsIngested: number }
  | { success: false; error: string; stage: string; code?: string };

export type IngestionErrorCode =
  | "PARSER_TIMEOUT"
  | "PARSER_PROVIDER_ERROR"
  | "PARSER_EMPTY_RESULT"
  | "INVALID_FILE_FORMAT"
  | "UNKNOWN_INGESTION_ERROR";

export class IngestionError extends Error {
  constructor(
    message: string,
    public code: IngestionErrorCode,
    public rawError?: any,
  ) {
    super(message);
    this.name = "IngestionError";
  }
}

export const BrandRuleItemSchema = z.object({
  category: z
    .string()
    .describe(
      "Category of the rule (e.g., Tone, Formatting, Claim, Legal, Visual).",
    ),
  rule: z.string().describe("The core actionable rule or constraint."),
  context: z
    .string()
    .describe("Background context explaining when or why this rule applies."),
  is_negative: z
    .boolean()
    .describe(
      "True if this specifies something prohibited (banned word, negative constraint).",
    ),
});

export const BrandRuleSchema = z.object({
  rules: z.array(BrandRuleItemSchema),
});

export type BrandRuleItem = z.infer<typeof BrandRuleItemSchema>;
export type BrandRule = z.infer<typeof BrandRuleSchema>;

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

export const RetrievalErrorSchema = z.object({
  type: z.enum([
    "EMBEDDING_PROVIDER_ERROR",
    "DATABASE_RPC_ERROR",
    "NO_BRAND_MEMORY_STORED",
    "UNKNOWN_RETRIEVAL_ERROR",
  ]),
  message: z.string(),
});

export type RetrievalError = z.infer<typeof RetrievalErrorSchema>;

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

export const ContextReportSchema = z.object({
  hasConstraints: z
    .boolean()
    .describe(
      "True if specific brand rules or memory constraints apply to the prompt.",
    ),
  toneAndVoice: z
    .string()
    .describe(
      "The target tone, voice, and stylistic directives extracted from memory.",
    ),
  mandatoryRules: z
    .array(z.string())
    .describe(
      "List of non-negotiable rules, claims, or phrasing that MUST be included or followed.",
    ),
  forbiddenElements: z
    .array(z.string())
    .describe(
      "List of restricted topics, banned words, or compliance violations to avoid.",
    ),
  executionGuidance: z
    .string()
    .describe(
      "Step-by-step actionable advice on how the model should write or construct the final output.",
    ),
});

export type ContextReport = z.infer<typeof ContextReportSchema>;

export const ContextStateAnnotation = Annotation.Root({
  userPrompt: Annotation<string>({
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
  report: Annotation<ContextReport | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  systemDirective: Annotation<string>({
    reducer: (x, y) => y || x,
    default: () => "",
  }),
});

export type ContextState = typeof ContextStateAnnotation.State;
