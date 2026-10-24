import { embed, rerank } from "ai";
import { voyageEmbeddingModel, voyageRerankingModel } from "../lib/models";
import { supabase, SUPABASE_TABLE } from "../lib/supabase";
import { errorMessage } from "../lib/errors";
import type { Atom, RetrievalResult } from "../types/retrieval.type";

const HYBRID_MATCH_COUNT = 20;
const RRF_K = 60;
const RERANK_TOP_N = 10;
/** Upper bound on how many always-relevant rules we pull into the candidate pool. */
const PINNED_FETCH_LIMIT = 30;
/** Max pinned rules appended after the top-N even if the reranker ranked them lower. */
const PINNED_MAX_EXTRA = 5;

/**
 * Rules that must be considered for (almost) every query: prohibitions and
 * brand-wide ("Global") rules. Pure similarity search against a whole draft
 * misses these when the draft is not semantically close to them
 * (e.g. a legal disclaimer, or a banned-word list).
 *
 * `is_negative` / `context` live in the JSONB `metadata` column (see ingest).
 */
const PINNED_FILTER =
  "metadata->>is_negative.eq.true,metadata->>context.eq.Global";

interface MatchRow {
  id?: string | number | null;
  content: unknown;
  metadata?: Record<string, unknown> | null;
}

function toAtom(row: MatchRow, fallbackId: string): Atom {
  const content =
    typeof row.content === "string" ? row.content : JSON.stringify(row.content);
  const metadata = row.metadata ?? {};
  return {
    id: row.id != null ? String(row.id) : fallbackId,
    content,
    isNegative:
      metadata.is_negative === true || content.includes("[Type: PROHIBITION]"),
    metadata,
  };
}

/**
 * Hybrid (vector + full-text) search -> merge with pinned rules -> rerank.
 *
 * Expects the `match_hybrid_synapse` RPC to return rows with `id`, `content`
 * and `metadata`. Never throws; failures come back as `{ ok: false }`.
 */
export async function retrieveAtoms(query: string): Promise<RetrievalResult> {
  let embedding: number[];
  try {
    ({ embedding } = await embed({
      model: voyageEmbeddingModel,
      value: query,
      maxRetries: 2,
    }));
  } catch (err) {
    console.error("[Retrieval] Embedding failed:", err);
    return {
      ok: false,
      reason: "EMBEDDING_PROVIDER_ERROR",
      message: errorMessage(err, "Failed to generate query embeddings."),
    };
  }

  const [hybrid, pinned] = await Promise.all([
    supabase.rpc("match_hybrid_synapse", {
      query_text: query,
      query_embedding: embedding,
      match_count: HYBRID_MATCH_COUNT,
      filter: {},
      rrf_k: RRF_K,
    }),
    supabase
      .from(SUPABASE_TABLE)
      .select("id, content, metadata")
      .or(PINNED_FILTER)
      .limit(PINNED_FETCH_LIMIT),
  ]);

  if (hybrid.error) {
    console.error("[Retrieval] match_hybrid_synapse failed:", hybrid.error);
    return {
      ok: false,
      reason: "DATABASE_RPC_ERROR",
      message: `Supabase RPC error: ${hybrid.error.message}`,
    };
  }

  if (pinned.error) {
    // Degrade to similarity-only rather than failing the whole request.
    console.warn("[Retrieval] Pinned-rule query failed:", pinned.error.message);
  }

  const hybridRows = (hybrid.data ?? []) as MatchRow[];
  const pinnedRows = (pinned.data ?? []) as MatchRow[];

  if (hybridRows.length === 0 && pinnedRows.length === 0) {
    return {
      ok: false,
      reason: "NO_BRAND_MEMORY_STORED",
      message: "No brand memory atoms are stored.",
    };
  }

  const hybridAtoms = hybridRows.map((r, i) => toAtom(r, `h${i}`));
  const pinnedAtoms = pinnedRows.map((r, i) => toAtom(r, `p${i}`));

  // Dedupe by content: also collapses atoms that were ingested twice.
  const pool = new Map<string, Atom>();
  for (const atom of [...hybridAtoms, ...pinnedAtoms]) {
    if (!pool.has(atom.content)) pool.set(atom.content, atom);
  }
  const candidates = [...pool.values()];
  const pinnedContents = new Set(pinnedAtoms.map((a) => a.content));

  try {
    const { ranking } = await rerank({
      model: voyageRerankingModel,
      query,
      documents: candidates.map((a) => a.content),
      topN: candidates.length,
      maxRetries: 2,
    });

    const ranked = ranking
      .map((r) => candidates[r.originalIndex])
      .filter((a): a is Atom => a !== undefined);

    const top = ranked.slice(0, RERANK_TOP_N);
    const extras = ranked
      .slice(RERANK_TOP_N)
      .filter((a) => pinnedContents.has(a.content))
      .slice(0, PINNED_MAX_EXTRA);

    return { ok: true, atoms: [...top, ...extras] };
  } catch (err) {
    console.error("[Retrieval] Rerank failed, using hybrid order:", err);

    const hybridContents = new Set(hybridAtoms.map((a) => a.content));
    const top = candidates
      .filter((a) => hybridContents.has(a.content))
      .slice(0, RERANK_TOP_N);
    const topContents = new Set(top.map((a) => a.content));
    const extras = candidates
      .filter(
        (a) => pinnedContents.has(a.content) && !topContents.has(a.content),
      )
      .slice(0, PINNED_MAX_EXTRA);

    return { ok: true, atoms: [...top, ...extras] };
  }
}
