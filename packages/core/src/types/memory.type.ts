export interface MemoryStatus {
  hasMemory: boolean;
  count: number;
}

export type MemoryClearResult =
  | { success: true }
  | { success: false; error: string };
