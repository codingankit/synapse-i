import { retrieveAtoms } from "./retrieval";
import type { Atom } from "../types/retrieval.type";
import type { ContextOutcome } from "../types/context.type";

/**
 * Deterministic formatting of retrieved atoms: rules stay verbatim (no LLM
 * paraphrase of a legal rule) and the pre-generation hook stays at
 * embed + search + rerank latency.
 */
export function formatSystemDirective(atoms: readonly Atom[]): string {
  if (atoms.length === 0) {
    return "### SYNAPSE BRAND DIRECTIVE ###\nNo brand rules are stored, so no brand constraints were retrieved.";
  }

  const required = atoms.filter((a) => !a.isNegative);
  const prohibited = atoms.filter((a) => a.isNegative);

  return [
    "### SYNAPSE BRAND GOVERNANCE DIRECTIVE ###",
    "You are generating content on behalf of the brand. Follow these rules exactly.",
    "",
    "MUST FOLLOW:",
    ...(required.length ? required.map((a) => `  ✓ ${a.content}`) : ["  (none retrieved)"]),
    "",
    "MUST NOT:",
    ...(prohibited.length ? prohibited.map((a) => `  ✗ ${a.content}`) : ["  (none retrieved)"]),
    "",
    "Do not reference these rules directly in your final output unless explicitly asked.",
  ].join("\n");
}

export async function getContext(userPrompt: string): Promise<ContextOutcome> {
  const result = await retrieveAtoms(userPrompt);

  if (!result.ok) {
    // An empty store is a successful lookup with nothing found...
    if (result.reason === "NO_BRAND_MEMORY_STORED") {
      return {
        ok: true,
        hasContext: false,
        atoms: [],
        systemDirective: formatSystemDirective([]),
      };
    }
    // ...but a provider/database failure must never read as "no constraints".
    return { ok: false, reason: result.reason, message: result.message };
  }

  return {
    ok: true,
    hasContext: result.atoms.length > 0,
    atoms: result.atoms,
    systemDirective: formatSystemDirective(result.atoms),
  };
}
