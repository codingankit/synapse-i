import type { Atom, RetrievalFailureReason } from "./retrieval.type";

export type ContextOutcome =
  | {
      ok: true;
      /** False only when retrieval succeeded and the memory store is empty. */
      hasContext: boolean;
      atoms: Atom[];
      systemDirective: string;
    }
  | {
      ok: false;
      reason: Exclude<RetrievalFailureReason, "NO_BRAND_MEMORY_STORED">;
      message: string;
    };
