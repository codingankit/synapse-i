import { START, END, StateGraph, Annotation } from "@langchain/langgraph";
import { generateText, Output } from "ai";
import { geminiAuditModel } from "../lib/models";
import {
  auditSystemPrompt,
  rewriteSystemPrompt,
  renderBrandRules,
  renderProposedContent,
} from "../lib/prompts";
import { errorMessage } from "../lib/errors";
import { retrieveAtoms } from "./retrieval";
import {
  AUDIT_PASS_THRESHOLD,
  AuditLlmSchema,
  type AuditFailure,
  type AuditOptions,
  type AuditOutcome,
  type AuditReport,
} from "../types/audit.type";
import type { Atom } from "../types/retrieval.type";

const MAX_REVISIONS_CAP = 3;

/** Last write wins; every field has an explicit default. */
function lastWrite<T>(init: () => T) {
  return Annotation<T>({ reducer: (_prev: T, next: T) => next, default: init });
}

const AuditState = Annotation.Root({
  /** The current draft. Replaced by each successful rewrite. */
  content: lastWrite<string>(() => ""),
  /** The draft that `report` was actually computed for. */
  auditedContent: lastWrite<string>(() => ""),
  atoms: lastWrite<Atom[]>(() => []),
  report: lastWrite<AuditReport | null>(() => null),
  /** Set only when no report could be produced at all. */
  failure: lastWrite<AuditFailure | null>(() => null),
  /** Number of completed audits. */
  iteration: lastWrite<number>(() => 0),
  maxRevisions: lastWrite<number>(() => 0),
  /** Set when the revise loop must stop (rewrite or re-audit failed). */
  halted: lastWrite<boolean>(() => false),
});

type State = typeof AuditState.State;
type Update = typeof AuditState.Update;

async function retrieveNode(state: State): Promise<Update> {
  const result = await retrieveAtoms(state.content);
  if (!result.ok) {
    return { failure: { reason: result.reason, message: result.message } };
  }
  return { atoms: result.atoms };
}

async function auditNode(state: State): Promise<Update> {
  try {
    const { output } = await generateText({
      model: geminiAuditModel,
      maxRetries: 2,
      output: Output.object({ schema: AuditLlmSchema }),
      system: auditSystemPrompt,
      prompt: [
        renderBrandRules(state.atoms),
        renderProposedContent(state.content),
      ].join("\n\n"),
    });

    // Prefer the bare rule text over the "[Type] [Category] [Context]" embedding string.
    const ruleById = new Map(
      state.atoms.map((a) => [
        a.id,
        typeof a.metadata.rule === "string" ? a.metadata.rule : a.content,
      ]),
    );
    const report: AuditReport = {
      // Derived here so status can never contradict score.
      status: output.score >= AUDIT_PASS_THRESHOLD ? "PASS" : "FAIL",
      score: output.score,
      feedback: output.feedback,
      violations: output.violations.map((v) => ({
        ...v,
        rule_text: ruleById.get(v.rule_id) ?? null,
      })),
    };

    console.log(
      `[Audit] #${state.iteration + 1} score=${report.score} status=${report.status} violations=${report.violations.length}`,
    );

    return {
      report,
      auditedContent: state.content,
      iteration: state.iteration + 1,
    };
  } catch (err) {
    console.error("[Audit] Gemini audit call failed:", err);
    // A failed re-audit keeps the previous report instead of discarding it.
    if (state.report) return { halted: true };
    return {
      failure: {
        reason: "LLM_PROVIDER_ERROR",
        message: errorMessage(err, "Audit model call failed."),
      },
    };
  }
}

async function rewriteNode(state: State): Promise<Update> {
  const report = state.report;
  if (!report) return { halted: true };

  const violations = report.violations
    .map(
      (v) =>
        `- [rule ${v.rule_id}] ${v.reason} Suggested fix: ${v.suggested_fix}`,
    )
    .join("\n");

  try {
    const { text } = await generateText({
      model: geminiAuditModel,
      maxRetries: 2,
      system: rewriteSystemPrompt,
      prompt: [
        renderBrandRules(state.atoms),
        `<violations>\n${violations}\n</violations>`,
        renderProposedContent(state.content),
      ].join("\n\n"),
    });

    const revised = text.trim();
    if (!revised) return { halted: true };
    return { content: revised };
  } catch (err) {
    console.error("[Audit] Rewrite failed:", err);
    return { halted: true };
  }
}

function routeAfterRetrieve(state: State): "audit" | typeof END {
  return state.failure ? END : "audit";
}

function routeAfterAudit(state: State): "rewrite" | typeof END {
  if (state.halted || !state.report) return END;
  if (state.report.status === "PASS") return END;
  // `iteration` counts audits, so maxRevisions=N allows N+1 audits.
  if (state.iteration > state.maxRevisions) return END;
  return "rewrite";
}

function routeAfterRewrite(state: State): "audit" | typeof END {
  return state.halted ? END : "audit";
}

/**
 * retrieve -> audit -> (FAIL and revisions left? rewrite -> audit ...) -> END
 * Compiled once at module scope.
 */
const auditGraph = new StateGraph(AuditState)
  .addNode("retrieve", retrieveNode)
  .addNode("audit", auditNode)
  .addNode("rewrite", rewriteNode)
  .addEdge(START, "retrieve")
  .addConditionalEdges("retrieve", routeAfterRetrieve, ["audit", END])
  .addConditionalEdges("audit", routeAfterAudit, ["rewrite", END])
  .addConditionalEdges("rewrite", routeAfterRewrite, ["audit", END])
  .compile();

export async function runAudit(
  content: string,
  options: AuditOptions = {},
): Promise<AuditOutcome> {
  const maxRevisions = Math.min(
    Math.max(Math.trunc(options.maxRevisions ?? 0), 0),
    MAX_REVISIONS_CAP,
  );

  const final = await auditGraph.invoke({ content, maxRevisions });

  if (!final.report) {
    const failure: AuditFailure = final.failure ?? {
      reason: "LLM_PROVIDER_ERROR",
      message: "Audit produced no report.",
    };
    return { ok: false, ...failure };
  }

  return {
    ok: true,
    report: final.report,
    revisedContent:
      final.auditedContent !== content ? final.auditedContent : null,
    atoms: final.atoms,
    metadata: {
      auditsRun: final.iteration,
      revisionsApplied: Math.max(final.iteration - 1, 0),
      atomsEvaluated: final.atoms.length,
    },
  };
}
