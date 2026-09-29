import { START, END, StateGraph } from "@langchain/langgraph";
import { embed, rerank, generateText, Output } from "ai";
import {
  voyageEmbeddingModel,
  voyageRerankingModel,
  geminiAuditModel,
} from "../lib/models";
import { auditSystemPrompt } from "../lib/prompts";
import { supabase } from "../lib/supabase";
import {
  type AuditState,
  AuditStateAnnotation,
  AuditReportSchema,
} from "../types";

export async function retrievalNode(state: AuditState) {
  let embedding: number[] = [];

  try {
    const embedResult = await embed({
      model: voyageEmbeddingModel,
      value: state.content,
      maxRetries: 2,
    });
    embedding = embedResult.embedding;
    console.log(`Query embedding dim: ${embedding.length}`);
  } catch (embedErr: any) {
    console.error("Embedding generation failed in retrievalNode:", embedErr);
    return {
      retrievedAtoms: [],
      retrievalError: {
        type: "EMBEDDING_PROVIDER_ERROR",
        message: embedErr?.message || "Failed to generate query embeddings.",
      },
    };
  }

  const { data: nodes, error: rpcError } = await supabase.rpc(
    "match_hybrid_synapse",
    {
      query_text: state.content,
      query_embedding: embedding,
      match_count: 20,
      filter: {},
      rrf_k: 60,
    },
  );

  if (rpcError) {
    console.error(
      "match_hybrid_synapse RPC failed:",
      rpcError.message,
      rpcError.details ?? "",
      rpcError.hint ?? "",
    );
    return {
      retrievedAtoms: [],
      retrievalError: {
        type: "DATABASE_RPC_ERROR",
        message: `Supabase RPC error: ${rpcError.message}`,
      },
    };
  }

  console.log(`Retrieved ${nodes?.length ?? 0} nodes from Supabase`);

  if (!nodes?.length) {
    return {
      retrievedAtoms: [],
      retrievalError: {
        type: "NO_BRAND_MEMORY_STORED",
        message: "Database returned 0 records for this brand domain.",
      },
    };
  }

  const documents: string[] = nodes.map((row: any) =>
    typeof row.content === "string" ? row.content : JSON.stringify(row.content),
  );

  try {
    const { rerankedDocuments } = await rerank({
      model: voyageRerankingModel,
      query: state.content,
      documents: documents,
      topN: 10,
      maxRetries: 2,
    });

    const retrievedAtoms: string[] = rerankedDocuments.map((item: any) => {
      if (typeof item === "string") return item;
      if (typeof item.document === "string") return item.document;
      if (typeof item.text === "string") return item.text;
      return String(item);
    });

    console.log(`Reranked down to ${retrievedAtoms.length} atoms`);
    return { retrievedAtoms, retrievalError: null };
  } catch (rerankErr: any) {
    console.error(
      "Rerank failed, falling back to top-10 vector nodes:",
      rerankErr,
    );

    return {
      retrievedAtoms: documents.slice(0, 10),
      retrievalError: null,
    };
  }
}

export async function auditNode(
  state: AuditState & {
    retrievalError?: { type: string; message: string } | null;
  },
) {
  if (!state.retrievedAtoms.length) {
    const errType = state.retrievalError?.type || "NO_BRAND_MEMORY_STORED";
    console.warn(
      `auditNode received 0 atoms — Reason: ${errType}. Skipping Gemini call.`,
    );

    let ruleViolated = "Database Context Retrieval Failure";
    let reason =
      "No relevant brand guidelines, rules, or memory atoms were found in the database for this prompt.";
    let suggestedFix =
      "Verify that a Brand Bible has been ingested into Supabase.";

    if (errType === "EMBEDDING_PROVIDER_ERROR") {
      ruleViolated = "Embedding Service Unavailable";
      reason = `Voyage Embedding API failed: ${state.retrievalError?.message}`;
      suggestedFix =
        "Check Voyage API credentials, quota, or status and retry.";
    } else if (errType === "DATABASE_RPC_ERROR") {
      ruleViolated = "Database Execution Failure";
      reason = `Supabase RPC execution error: ${state.retrievalError?.message}`;
      suggestedFix =
        "Verify Supabase database migration and stored procedure match_hybrid_synapse signature.";
    }

    return {
      report: {
        status: "UNAUDITED" as const,
        score: 0,
        violations: [
          {
            rule_violated: ruleViolated,
            reason: reason,
            suggested_fix: suggestedFix,
          },
        ],
        feedback: `Audit skipped due to ${ruleViolated.toLowerCase()}. No constraints evaluated.`,
      },
      iteration: state.iteration + 1,
    };
  }

  console.log(`Auditing against ${state.retrievedAtoms.length} atoms`);

  try {
    const { output } = await generateText({
      model: geminiAuditModel,
      maxRetries: 2,
      output: Output.object({
        schema: AuditReportSchema,
      }),
      system: auditSystemPrompt,
      prompt: `
        BRAND MEMORY:
        ${state.retrievedAtoms.join("\n---\n")}

        PROPOSED CONTENT:
        ${state.content}
      `,
    });

    console.log(
      `Audit complete — score: ${output.score}, status: ${output.status}, violations: ${output.violations.length}`,
    );

    return { report: output, iteration: state.iteration + 1 };
  } catch (err: any) {
    console.error("Gemini Audit API call failed completely:", err);

    return {
      report: {
        status: "UNAUDITED" as const,
        score: 0,
        violations: [
          {
            rule_violated: "LLM Provider Unavailable",
            reason: `Gemini service error: ${err?.message || "High demand / 503 status"}`,
            suggested_fix: "Retry the audit request in a few moments.",
          },
        ],
        feedback:
          "Audit failed due to upstream model capacity limits or API timeouts. Please try again shortly.",
      },
      iteration: state.iteration + 1,
    };
  }
}

export async function runAuditCore(content: string) {
  const workflow = new StateGraph(AuditStateAnnotation)
    .addNode("retrieve", retrievalNode)
    .addNode("audit", auditNode)
    .addEdge(START, "retrieve")
    .addEdge("retrieve", "audit")
    .addEdge("audit", END);

  const app = workflow.compile();

  const finalState = await app.invoke({
    content,
    retrievedAtoms: [],
    report: null,
    iteration: 0,
  });

  return {
    success: true,
    report: finalState.report,
    metadata: {
      attempts: finalState.iteration,
      atomsEvaluated: finalState.retrievedAtoms.length,
    },
  };
}
