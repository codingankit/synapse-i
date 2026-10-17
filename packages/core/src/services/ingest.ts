import { generateText, Output, embedMany } from "ai";
import { geminiExtractionModel, voyageEmbeddingModel } from "../lib/models";
import { extractionSystemPrompt } from "../lib/prompts";
import { supabase, SUPABASE_TABLE } from "../lib/supabase";
import { parseBrandBible } from "../services/parser";
import {
  type IngestResult,
  BrandRuleSchema,
  IngestionError,
} from "../types/ingest.type";

export async function ingestBrandBible(
  fileBuffer: Buffer,
  fileName: string,
): Promise<IngestResult> {
  let markdownText = "";

  try {
    markdownText = await parseBrandBible(fileBuffer, fileName);
    if (!markdownText || !markdownText.trim()) {
      return {
        success: false,
        error:
          "No readable markdown text could be extracted from the uploaded file.",
        stage: "PARSER_FAILURE",
      };
    }
    console.log(
      `[Ingest] Markdown recovered from ${fileName}: ${markdownText.length} chars`,
    );
  } catch (parseErr: any) {
    console.error("[Ingest] Document parsing failed:", parseErr);
    return {
      success: false,
      error: parseErr?.message || "Failed to parse document format.",
      stage: "PARSER_FAILURE",
      code:
        parseErr instanceof IngestionError
          ? parseErr.code
          : "PARSER_PROVIDER_ERROR",
    };
  }

  let output;
  try {
    const result = await generateText({
      model: geminiExtractionModel,
      maxRetries: 2,
      system: extractionSystemPrompt,
      output: Output.object({
        schema: BrandRuleSchema,
      }),
      prompt: markdownText,
    });
    output = result.output;
  } catch (llmErr: any) {
    console.error("[Ingest] LLM rule extraction failed:", llmErr);
    return {
      success: false,
      error: `Failed to extract brand rules: ${llmErr?.message || "LLM provider error"}`,
      stage: "EXTRACTION_FAILURE",
    };
  }

  if (!output.rules?.length) {
    return {
      success: false,
      error: "No actionable brand rule atoms were identified in this document.",
      stage: "NO_RULES_FOUND",
    };
  }
  console.log(`[Ingest] Extracted ${output.rules.length} rule atoms`);

  const formattedValues = output.rules.map(
    (r) => `[Category: ${r.category}] [Context: ${r.context}] Rule: ${r.rule}`,
  );

  let embeddings: number[][] = [];
  const EMBED_BATCH_SIZE = 30;

  try {
    for (let i = 0; i < formattedValues.length; i += EMBED_BATCH_SIZE) {
      const batchValues = formattedValues.slice(i, i + EMBED_BATCH_SIZE);
      const embedResult = await embedMany({
        model: voyageEmbeddingModel,
        maxRetries: 2,
        values: batchValues,
      });
      embeddings.push(...embedResult.embeddings);
    }
  } catch (embedErr: any) {
    console.error("[Ingest] Embedding generation failed:", embedErr);
    return {
      success: false,
      error: `Failed to generate embeddings: ${embedErr?.message || "Embedding provider error"}`,
      stage: "EMBEDDING_FAILURE",
    };
  }

  if (embeddings.length !== output.rules.length) {
    return {
      success: false,
      error: `Embedding mismatch: Expected ${output.rules.length} vectors, got ${embeddings.length}`,
      stage: "EMBEDDING_MISMATCH",
    };
  }

  console.log(
    `[Ingest] Generated ${embeddings.length} embeddings (dim: ${embeddings[0]?.length ?? "unknown"})`,
  );

  const rows = output.rules.map((rule, i) => ({
    content: formattedValues[i],
    metadata: {
      ...rule,
      source_file: fileName,
      ingested_at: new Date().toISOString(),
    },
    embedding: embeddings[i],
  }));

  const DB_BATCH_SIZE = 50;
  let totalInserted = 0;
  const insertedIds: string[] = []; // Tracking for rollback on failure

  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    const batch = rows.slice(i, i + DB_BATCH_SIZE);

    const { data, error, count } = await supabase
      .from(SUPABASE_TABLE)
      .insert(batch, { count: "exact" })
      .select("id");

    if (error) {
      console.error(
        `[Ingest] Supabase batch insert failed at offset ${i}:`,
        error.message,
      );

      if (insertedIds.length > 0) {
        console.warn(
          `[Ingest] Rolling back ${insertedIds.length} inserted records...`,
        );
        await supabase.from(SUPABASE_TABLE).delete().in("id", insertedIds);
      }

      return {
        success: false,
        error: `Database write failed at chunk ${Math.floor(i / DB_BATCH_SIZE) + 1}: ${error.message}`,
        stage: "DATABASE_WRITE_FAILURE",
      };
    }

    if (data) {
      insertedIds.push(...data.map((row: { id: string }) => row.id));
    }
    totalInserted += count ?? batch.length;
  }

  console.log(
    `[Ingest] Successfully inserted ${totalInserted} rows into ${SUPABASE_TABLE}`,
  );

  return {
    success: true,
    fileName,
    atomsIngested: totalInserted,
  };
}
