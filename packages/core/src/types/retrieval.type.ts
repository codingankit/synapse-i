/**
 * A single brand-memory rule ("atom") as returned by retrieval.
 * `id` is the primary key of the row in the vector table and is what the
 * audit model cites when it reports a violation.
 */
export interface Atom {
  id: string;
  content: string;
  isNegative: boolean;
  metadata: Record<string, unknown>;
}

export type RetrievalFailureReason =
  | "EMBEDDING_PROVIDER_ERROR"
  | "DATABASE_RPC_ERROR"
  | "NO_BRAND_MEMORY_STORED";

/**
 * Retrieval never throws: callers must branch on `ok` so that an outage can
 * never be mistaken for "no rules apply".
 */
export type RetrievalResult =
  | { ok: true; atoms: Atom[] }
  | { ok: false; reason: RetrievalFailureReason; message: string };
