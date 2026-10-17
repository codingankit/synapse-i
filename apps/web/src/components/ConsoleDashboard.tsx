"use client";

import {
  useActionState,
  useState,
  useTransition,
  useRef,
  useCallback,
} from "react";
import { Layers } from "lucide-react";
import type { AuditReport } from "@synapse/core/audit";
import {
  handleIngestion,
  runAudit,
  getMemoryStatus,
  clearMemory,
} from "@/actions";
import { IngestionCard } from "@/components/IngestionCard";
import { ExecutionTestbench } from "@/components/ExecutionTestbench";
import { AuditFeedback } from "@/components/AuditFeedback";
import { ConfirmClearModal } from "@/components/ConfirmClearModal";
import type { ActionState, ConsoleDashboardProps } from "@/types";

export function ConsoleDashboard({ initialMemory }: ConsoleDashboardProps) {
  const [isAuditing, startAudit] = useTransition();
  const [isClearing, startClearing] = useTransition();
  const [hasMemory, setHasMemory] = useState<boolean>(initialMemory.hasMemory);
  const [ruleCount, setRuleCount] = useState<number>(initialMemory.count || 0);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [content, setContent] = useState("");
  const [auditResults, setAuditResults] = useState<AuditReport | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshMemory = useCallback(async () => {
    const status = await getMemoryStatus();
    setHasMemory(status.hasMemory);
    setRuleCount(status.count || 0);
  }, []);

  const [ingestState, ingestAction, isUploading] = useActionState<ActionState, FormData>(
    async (_prevState: ActionState, formData: FormData) => {
      const result = await handleIngestion(formData);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (result.success) {
        await refreshMemory();
      }
      return result;
    },
    { success: false, fileName: null, error: null },
  );

  const showError = Boolean(ingestState.error && dismissedError !== ingestState.error);

  const confirmClear = () => {
    if (isAuditing || isClearing) return;
    setShowClearConfirm(false);
    startClearing(async () => {
      const res = await clearMemory();
      if (res.success) {
        setHasMemory(false);
        setRuleCount(0);
        setAuditResults(null);
      }
    });
  };

  const triggerAudit = () => {
    if (!content.trim() || isAuditing || isClearing) return;

    startAudit(async () => {
      const response = await runAudit(content.trim());
      if (response.success && response.report) {
        setAuditResults(response.report);
      }
    });
  };

  return (
    <main className="min-h-screen lg:h-screen w-full bg-slate-50 text-slate-900 font-sans flex flex-col overflow-y-auto lg:overflow-hidden antialiased selection:bg-indigo-100 selection:text-indigo-900">
      {/* NAVBAR */}
      <header className="h-16 sm:h-18 border-b border-slate-200 bg-white/90 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between shrink-0 z-20 shadow-xs">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 block leading-none">
              SYNAPSE
            </span>
            <span className="text-[10px] sm:text-xs text-slate-500 font-semibold tracking-wider uppercase mt-1 block">
              Brand Governance Console
            </span>
          </div>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 min-h-0">
        <div className="lg:col-span-7 flex flex-col h-auto lg:h-full bg-slate-50/50 min-h-0">
          <IngestionCard
            hasMemory={hasMemory}
            ruleCount={ruleCount}
            isClearing={isClearing}
            isAuditing={isAuditing}
            isUploading={isUploading}
            showError={showError}
            errorMessage={ingestState.error}
            fileInputRef={fileInputRef}
            onClearClick={() => setShowClearConfirm(true)}
            onDismissError={() => setDismissedError(ingestState.error ?? null)}
            ingestAction={ingestAction}
          />

          <ExecutionTestbench
            hasMemory={hasMemory}
            content={content}
            isAuditing={isAuditing}
            isClearing={isClearing}
            onChangeContent={setContent}
            onClearContent={() => setContent("")}
            onTriggerAudit={triggerAudit}
          />
        </div>

        <AuditFeedback
          auditResults={auditResults}
          isAuditing={isAuditing}
          onClearAudit={() => setAuditResults(null)}
        />
      </div>

      {showClearConfirm && (
        <ConfirmClearModal
          ruleCount={ruleCount}
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={confirmClear}
        />
      )}
    </main>
  );
}
