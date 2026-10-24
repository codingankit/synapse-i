"use server";

import { clearMemoryCore, getMemoryStatusCore } from "@synapse/core/memory";
import { ingestBrandBible } from "@synapse/core/ingest";
import { runAudit } from "@synapse/core/audit";
import { revalidatePath } from "next/cache";
import type { ActionState, AuditActionResult } from "@/types";

export async function handleIngestion(
  formData: FormData,
): Promise<ActionState> {
  const file = formData.get("brandBible") as File;
  if (!file) {
    return { success: false, error: "No file found" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const res = await ingestBrandBible(buffer, file.name);
  if (res.success) {
    return { success: true, fileName: res.fileName };
  }
  return { success: false, error: res.error };
}

export async function getMemoryStatus() {
  return await getMemoryStatusCore();
}

export async function clearMemory() {
  const result = await clearMemoryCore();
  if (result.success) {
    revalidatePath("/");
  }
  return result;
}

export async function runAuditContent(
  content: string,
): Promise<AuditActionResult> {
  const outcome = await runAudit(content);
  if (!outcome.ok) {
    return {
      ok: false,
      message: `Audit unavailable (${outcome.reason}): ${outcome.message}`,
    };
  }
  return { ok: true, report: outcome.report };
}
