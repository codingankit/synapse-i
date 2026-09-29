import { google } from "@ai-sdk/google";
import { createVoyage } from "voyage-ai-provider";
import type { LanguageModel, EmbeddingModel, RerankingModel } from "ai";

export const voyage = createVoyage({
  apiKey: process.env.VOYAGE_API_KEY,
});

export const voyageEmbeddingModel: EmbeddingModel = voyage.textEmbeddingModel(
  process.env.VOYAGE_EMBEDDING_MODEL ?? "voyage-4-lite",
);

export const voyageRerankingModel: RerankingModel = voyage.rerankingModel(
  process.env.VOYAGE_RERANKING_MODEL ?? "rerank-2.5-lite",
);

export const geminiExtractionModel: LanguageModel = google(
  process.env.GEMINI_EXTRACTION_MODEL ?? "gemini-3.5-flash",
);

export const geminiAuditModel: LanguageModel = google(
  process.env.GEMINI_AUDIT_MODEL ?? "gemini-3.5-flash",
);
