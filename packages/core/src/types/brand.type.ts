import z from "zod";

export const BrandRuleItemSchema = z.object({
  category: z
    .string()
    .describe(
      "Category of the rule (e.g., Tone, Formatting, Claim, Legal, Visual).",
    ),
  rule: z.string().describe("The core actionable rule or constraint."),
  context: z
    .string()
    .describe(
      "The platform or situation where this rule applies (e.g., Instagram, Print, Email). Use 'Global' if unspecified.",
    ),
  is_negative: z
    .boolean()
    .describe(
      "True if this specifies something prohibited (banned word, negative constraint).",
    ),
  source_quote: z
    .string()
    .describe(
      "A short verbatim excerpt (max ~200 chars) from the source text that this rule was derived from.",
    ),
});

export const BrandRuleSchema = z.object({
  rules: z.array(BrandRuleItemSchema),
});

export type BrandRuleItem = z.infer<typeof BrandRuleItemSchema>;
export type BrandRule = z.infer<typeof BrandRuleSchema>;
