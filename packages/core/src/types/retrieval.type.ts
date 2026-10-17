import z from "zod";

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
