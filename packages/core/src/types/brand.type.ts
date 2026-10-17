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
