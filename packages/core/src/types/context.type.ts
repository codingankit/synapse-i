import z from "zod";
import { Annotation } from "@langchain/langgraph";
import type { RetrievalError } from "./retrieval.type";

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
