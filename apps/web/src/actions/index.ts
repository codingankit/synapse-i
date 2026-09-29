"use server";

import {
  clearMemoryCore,
  getMemoryStatusCore,
  ingestBrandBible,
  runAuditCore,
} from "@synapse/core";
import { revalidatePath } from "next/cache";

export async function handleIngestion(formData: FormData): Promise<any> {
  const file = formData.get("brandBible") as File;
  if (!file) throw new Error("No file found");

  const buffer = Buffer.from(await file.arrayBuffer());

  return await ingestBrandBible(buffer, file.name);
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

export async function runAudit(content: string): Promise<any> {
  return await runAuditCore(content);
}
