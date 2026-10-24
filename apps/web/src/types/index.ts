import type { AuditReport } from "@synapse/core/audit";

export interface ActionState {
  success: boolean;
  fileName?: string | null;
  error?: string | null;
}

export type AuditActionResult =
  | { ok: true; report: AuditReport }
  | { ok: false; message: string };

export interface MemoryStatus {
  hasMemory: boolean;
  count: number;
}

export interface ConfirmClearModalProps {
  ruleCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export interface IngestionCardProps {
  hasMemory: boolean;
  ruleCount: number;
  isClearing: boolean;
  isAuditing: boolean;
  isUploading: boolean;
  showError: boolean;
  errorMessage?: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onClearClick: () => void;
  onDismissError: () => void;
  ingestAction: (payload: FormData) => void;
}

export interface ExecutionTestbenchProps {
  hasMemory: boolean;
  content: string;
  isAuditing: boolean;
  isClearing: boolean;
  onChangeContent: (value: string) => void;
  onClearContent: () => void;
  onTriggerAudit: () => void;
}

export interface AuditFeedbackProps {
  auditResults: AuditReport | null;
  errorMessage?: string | null;
  isAuditing: boolean;
  onClearAudit: () => void;
}

export interface ConsoleDashboardProps {
  initialMemory: MemoryStatus;
}
