import { generateText, Output, embedMany } from "ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { geminiExtractionModel, voyageEmbeddingModel } from "../lib/models";
import { extractionSystemPrompt } from "../lib/prompts";
import { mapWithConcurrency } from "../lib/concurrency";
import { supabase, SUPABASE_TABLE } from "../lib/supabase";
import { parseBrandBible } from "../services/parser";
import {
  type IngestResult,
  type BrandRuleItem,
  BrandRuleSchema,
  IngestionError,
} from "../types/ingest.type";

const CHUNK_SIZE_CHARS = 8000;
const EXTRACTION_CONCURRENCY = 3;
const EMBED_BATCH_SIZE = 30;
const DB_BATCH_SIZE = 50;

type ExtractedRule = BrandRuleItem & { chunk_index: number };

// Splits on markdown headers first, then paragraphs, so rules stay with their section.
const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
  chunkSize: CHUNK_SIZE_CHARS,
  chunkOverlap: 0,
});

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!"'`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same rule extracted from two chunks (or repeated in the bible) is stored once. */
function dedupeRules(rules: ExtractedRule[]): ExtractedRule[] {
  const seen = new Set<string>();
  const unique: ExtractedRule[] = [];
  for (const rule of rules) {
    const key = [rule.is_negative, normalize(rule.context), normalize(rule.rule)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(rule);
  }
  return unique;
}

/** `Type` is embedded so both the reranker and the audit LLM can see prohibitions. */
function formatAtom(rule: BrandRuleItem): string {
  const type = rule.is_negative ? "PROHIBITION" : "REQUIREMENT";
  return `[Type: ${type}] [Category: ${rule.category}] [Context: ${rule.context}] Rule: ${rule.rule}`;
}

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

  let extracted: ExtractedRule[];
  try {
    const chunks = await splitter.splitText(markdownText);
    console.log(`[Ingest] Split into ${chunks.length} chunk(s)`);

    // All-or-nothing: a failed chunk fails the ingest instead of silently dropping rules.
    const perChunk = await mapWithConcurrency(
      chunks,
      EXTRACTION_CONCURRENCY,
      async (chunk, chunkIndex) => {
        const { output } = await generateText({
          model: geminiExtractionModel,
          maxRetries: 2,
          system: extractionSystemPrompt,
          output: Output.object({ schema: BrandRuleSchema }),
          prompt: chunk,
        });
        return (output.rules ?? []).map((r) => ({ ...r, chunk_index: chunkIndex }));
      },
    );

    extracted = perChunk.flat();
  } catch (llmErr: any) {
    console.error("[Ingest] LLM rule extraction failed:", llmErr);
    return {
      success: false,
      error: `Failed to extract brand rules: ${llmErr?.message || "LLM provider error"}`,
      stage: "EXTRACTION_FAILURE",
    };
  }

  const rules = dedupeRules(extracted);

  if (!rules.length) {
    return {
      success: false,
      error: "No actionable brand rule atoms were identified in this document.",
      stage: "NO_RULES_FOUND",
    };
  }
  console.log(
    `[Ingest] Extracted ${extracted.length} rule atoms, ${rules.length} after dedupe`,
  );

  const formattedValues = rules.map(formatAtom);

  const embeddings: number[][] = [];

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

  if (embeddings.length !== rules.length) {
    return {
      success: false,
      error: `Embedding mismatch: Expected ${rules.length} vectors, got ${embeddings.length}`,
      stage: "EMBEDDING_MISMATCH",
    };
  }

  console.log(
    `[Ingest] Generated ${embeddings.length} embeddings (dim: ${embeddings[0]?.length ?? "unknown"})`,
  );

  const ingestedAt = new Date().toISOString();
  const rows = rules.map((rule, i) => ({
    content: formattedValues[i],
    metadata: {
      ...rule, // category, rule, context, is_negative, source_quote, chunk_index
      source_file: fileName,
      ingested_at: ingestedAt,
    },
    embedding: embeddings[i],
  }));

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
