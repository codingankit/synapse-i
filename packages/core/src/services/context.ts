import { START, END, StateGraph } from "@langchain/langgraph";
import { embed, rerank, generateText, Output } from "ai";
import {
  voyageEmbeddingModel,
  voyageRerankingModel,
  geminiAuditModel,
} from "../lib/models";
import { contextSystemPrompt } from "../lib/prompts";
import { supabase } from "../lib/supabase";
import {
  type ContextState,
  type ContextReport,
  ContextStateAnnotation,
  ContextReportSchema,
} from "../types/context.type";

export async function contextRetrievalNode(state: ContextState) {
  let embedding: number[] = [];

  try {
    const embedResult = await embed({
      model: voyageEmbeddingModel,
      value: state.userPrompt,
      maxRetries: 2,
    });
    embedding = embedResult.embedding;
  } catch (embedErr: any) {
    console.error("[ContextEngine] Embedding generation failed:", embedErr);
    return {
      retrievedAtoms: [],
      retrievalError: {
        type: "EMBEDDING_PROVIDER_ERROR" as const,
        message: embedErr?.message || "Failed to embed prompt.",
      },
    };
  }

  const { data: nodes, error: rpcError } = await supabase.rpc(
    "match_hybrid_synapse",
    {
      query_text: state.userPrompt,
      query_embedding: embedding,
      match_count: 20,
      filter: {},
      rrf_k: 60,
    },
  );

  if (rpcError) {
    console.error("[ContextEngine] Hybrid RPC failed:", rpcError.message);
    return {
      retrievedAtoms: [],
      retrievalError: {
        type: "DATABASE_RPC_ERROR" as const,
        message: `Supabase RPC error: ${rpcError.message}`,
      },
    };
  }

  if (!nodes?.length) {
    return {
      retrievedAtoms: [],
      retrievalError: {
        type: "NO_BRAND_MEMORY_STORED" as const,
        message: "No brand memory atoms matched this user prompt.",
      },
    };
  }

  const documents: string[] = nodes.map((row: any) =>
    typeof row.content === "string" ? row.content : JSON.stringify(row.content),
  );

  try {
    const { rerankedDocuments } = await rerank({
      model: voyageRerankingModel,
      query: state.userPrompt,
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

    return {
      retrievedAtoms,
      retrievalError: null,
    };
  } catch (rerankErr: any) {
    console.error(
      "[ContextEngine] Reranking failed, falling back to top 10 raw nodes:",
      rerankErr,
    );
    return {
      retrievedAtoms: documents.slice(0, 10),
      retrievalError: null,
    };
  }
}

export async function contextSynthesisNode(state: ContextState) {
  if (!state.retrievedAtoms.length) {
    const errType = state.retrievalError?.type || "NO_BRAND_MEMORY_STORED";
    let guidance =
      "No specific brand memory rules found for this query. Follow general best practices.";

    if (errType === "EMBEDDING_PROVIDER_ERROR") {
      guidance =
        "Embedding provider temporarily unavailable. Proceeding without contextual rule retrieval.";
    } else if (errType === "DATABASE_RPC_ERROR") {
      guidance =
        "Database retrieval failed due to an RPC error. Proceeding with standard generation.";
    }

    const fallbackReport: ContextReport = {
      hasConstraints: false,
      toneAndVoice: "Standard professional brand voice.",
      mandatoryRules: [],
      forbiddenElements: [],
      executionGuidance: guidance,
    };

    return {
      report: fallbackReport,
      systemDirective:
        "### SYNAPSE BRAND DIRECTIVE ###\nNo active policy constraints apply. Proceed with standard generation.",
    };
  }

  try {
    const { output: report } = await generateText({
      model: geminiAuditModel,
      maxRetries: 2,
      output: Output.object({
        schema: ContextReportSchema,
      }),
      system: contextSystemPrompt,
      prompt: `
        BRAND MEMORY ATOMS:
        ${state.retrievedAtoms.map((atom, i) => `[Atom ${i + 1}] ${atom}`).join("\n")}

        PROPOSED USER PROMPT:
        ${state.userPrompt}
      `,
    });

    const systemDirective = formatSystemDirective(report);

    return {
      report,
      systemDirective,
    };
  } catch (err: any) {
    console.error("[ContextEngine] Gemini Context Synthesis call failed:", err);

    const fallbackReport: ContextReport = {
      hasConstraints: false,
      toneAndVoice: "Standard professional brand voice.",
      mandatoryRules: [],
      forbiddenElements: [],
      executionGuidance:
        "LLM Provider temporarily unavailable (503/High Demand). Proceeding without active brand synthesis.",
    };

    return {
      report: fallbackReport,
      systemDirective:
        "### SYNAPSE BRAND DIRECTIVE ###\nContext synthesis unavailable due to upstream model demand. Proceed with standard generation.",
    };
  }
}

function formatSystemDirective(report: ContextReport): string {
  if (!report.hasConstraints) {
    return "### SYNAPSE BRAND DIRECTIVE ###\nNo specific policy constraints apply. Proceed with standard generation.";
  }

  return [
    "### SYNAPSE BRAND GOVERNANCE DIRECTIVE ###",
    "You are generating content on behalf of the brand. Execute the prompt strictly adhering to these rules:\n",
    `TONE & VOICE: ${report.toneAndVoice}`,
    "",
    "MANDATORY RULES:",
    ...report.mandatoryRules.map((rule) => `  ✓ ${rule}`),
    "",
    "FORBIDDEN ELEMENTS:",
    ...report.forbiddenElements.map((item) => `  ✗ ${item}`),
    "",
    `EXECUTION STRATEGY: ${report.executionGuidance}`,
    "==================================================",
    "INSTRUCTION TO MODEL: Adhere to all directives above. Do not reference internal rules directly in your final output unless explicitly asked.",
  ].join("\n");
}

export async function getContext(userPrompt: string) {
  const workflow = new StateGraph(ContextStateAnnotation)
    .addNode("retrieve", contextRetrievalNode)
    .addNode("synthesize", contextSynthesisNode)
    .addEdge(START, "retrieve")
    .addEdge("retrieve", "synthesize")
    .addEdge("synthesize", END);

  const app = workflow.compile();

  const finalState = await app.invoke({
    userPrompt,
    retrievedAtoms: [],
    retrievalError: null,
    report: null,
    systemDirective: "",
  });

  return {
    success: true,
    hasContext: finalState.report?.hasConstraints ?? false,
    ruleCount: finalState.retrievedAtoms.length,
    retrievalError: finalState.retrievalError,
    report: finalState.report,
    retrievedAtoms: finalState.retrievedAtoms,
    systemDirective: finalState.systemDirective,
  };
}
