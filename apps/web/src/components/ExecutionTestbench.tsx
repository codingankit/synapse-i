"use client";

import { ExecutionTestbenchProps } from "@/types";
import { RotateCcw, Loader2, Sparkles } from "lucide-react";

export function ExecutionTestbench({
  hasMemory,
  content,
  isAuditing,
  isClearing,
  onChangeContent,
  onClearContent,
  onTriggerAudit,
}: ExecutionTestbenchProps) {
  return (
    <div className="flex-1 p-4 sm:p-6 flex flex-col min-h-100 lg:min-h-0 bg-slate-50/60">
      <div className="flex items-center justify-between mb-3 sm:mb-4 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <span className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-indigo-50 text-indigo-600 text-xs sm:text-sm font-bold flex items-center justify-center">
            2
          </span>
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-800">
            Execution Testbench
          </h2>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="text-[10px] sm:text-xs text-slate-500 font-mono font-medium">
            {content.length} chars
          </span>
          {content && (
            <button
              onClick={onClearContent}
              disabled={!hasMemory || isAuditing || isClearing}
              className="text-[10px] sm:text-xs text-slate-500 hover:text-slate-900 font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="relative flex-1 flex flex-col min-h-0">
        {!hasMemory && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-100/60 backdrop-blur-[2px] rounded-2xl border border-dashed border-slate-300 p-4">
            <div className="bg-white/90 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl shadow-sm border border-slate-200/80 text-[11px] sm:text-xs font-semibold text-slate-700 flex items-center gap-2 text-center">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              Ingest brand guidelines to unlock testbench
            </div>
          </div>
        )}

        <div
          className={`flex-1 flex flex-col min-h-0 transition-all duration-200 ${
            !hasMemory ? "opacity-40 pointer-events-none select-none" : ""
          }`}
        >
          <textarea
            className="w-full flex-1 min-h-45 sm:min-h-55 lg:min-h-0 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 text-sm sm:text-base text-slate-800 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none resize-none placeholder:text-slate-400 leading-relaxed font-sans shadow-xs transition-all"
            placeholder="Paste generated copy, campaign text, or prompt outputs here to run real-time policy cross-examination against memory..."
            value={content}
            onChange={(e) => onChangeContent(e.target.value)}
            disabled={!hasMemory}
          />

          <button
            onClick={onTriggerAudit}
            disabled={!hasMemory || !content.trim() || isAuditing || isClearing}
            className="mt-4 sm:mt-5 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 sm:py-4 px-5 sm:px-6 rounded-2xl transition-all disabled:opacity-40 flex items-center justify-center gap-2.5 sm:gap-3 text-sm sm:text-base shrink-0 shadow-md shadow-indigo-600/15 active:scale-[0.99] cursor-pointer"
          >
            {isAuditing ? (
              <>
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                <span>Auditing Policy Compliance...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
                <span>Run Governance Cross-Examination</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
