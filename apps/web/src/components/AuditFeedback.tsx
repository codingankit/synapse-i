"use client";

import { AuditFeedbackProps } from "@/types";
import {
  FileText,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Trash2,
} from "lucide-react";

export function AuditFeedback({
  auditResults,
  isAuditing = false,
  onClearAudit,
}: AuditFeedbackProps) {
  const isPassing = (auditResults?.score ?? 0) >= 80;

  return (
    <div className="lg:col-span-5 flex flex-col h-auto lg:h-full bg-white min-h-112.5 lg:min-h-0">
      {/* HEADER */}
      <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <span className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-indigo-50 text-indigo-600 text-xs sm:text-sm font-bold flex items-center justify-center">
            3
          </span>
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-800">
            Audit Feedback
          </h2>
        </div>

        {auditResults && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClearAudit}
              disabled={isAuditing}
              className="px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          </div>
        )}
      </div>

      {/* EMPTY STATE */}
      {!auditResults ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 text-center space-y-3 sm:space-y-4 bg-slate-50/30 min-h-75 lg:min-h-0">
          <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-400">
            <FileText className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div className="max-w-sm">
            <p className="text-sm sm:text-base font-semibold text-slate-800">
              No active audit results
            </p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
              Run an audit on your input text to view detailed compliance scores
              and policy checks.
            </p>
          </div>
        </div>
      ) : (
        /* AUDIT FEEDBACK BODY */
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/30">
          {/* SCORE BANNER */}
          <div className="p-5 sm:p-7 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-2xs">
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Compliance Score
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-4xl sm:text-5xl font-black tracking-tight ${
                    isPassing ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {auditResults.score ?? 0}%
                </span>
                <span className="text-xs sm:text-sm text-slate-400 font-semibold">
                  / 100%
                </span>
              </div>
            </div>

            <div
              className={`p-3 sm:p-4 rounded-2xl border shadow-xs ${
                isPassing
                  ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                  : "bg-rose-50 border-rose-200 text-rose-600"
              }`}
            >
              {isPassing ? (
                <ShieldCheck className="w-7 h-7 sm:w-9 sm:h-9" />
              ) : (
                <ShieldAlert className="w-7 h-7 sm:w-9 sm:h-9" />
              )}
            </div>
          </div>

          {/* DETAILED FEEDBACK LIST */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-7 space-y-5 sm:space-y-7 custom-scrollbar">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
              <span className="text-[10px] sm:text-xs font-bold text-indigo-600 uppercase tracking-wider block mb-2">
                Executive Summary
              </span>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                {auditResults.feedback || "No feedback generated."}
              </p>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Detected Contradictions
                </span>
                <span
                  className={`text-[10px] sm:text-xs font-bold px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full border ${
                    auditResults.violations?.length
                      ? "bg-rose-50 text-rose-600 border-rose-200"
                      : "bg-emerald-50 text-emerald-600 border-emerald-200"
                  }`}
                >
                  {auditResults.violations?.length || 0} Found
                </span>
              </div>

              {Array.isArray(auditResults.violations) &&
              auditResults.violations.length > 0 ? (
                <div className="space-y-3.5 sm:space-y-4">
                  {auditResults.violations.map((v, i) => (
                    <div
                      key={i}
                      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 sm:space-y-3.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                        <span className="text-[10px] sm:text-xs font-bold text-rose-600 uppercase tracking-wider truncate">
                          Rule: {v.rule_violated}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                        {v.reason}
                      </p>

                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 sm:p-4">
                        <span className="text-[10px] sm:text-xs text-indigo-600 font-bold uppercase tracking-wider block mb-1">
                          Suggested Fix
                        </span>
                        <p className="text-xs sm:text-sm text-slate-800 font-medium italic leading-relaxed">
                          &ldquo;{v.suggested_fix}&rdquo;
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 sm:p-5 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center gap-3 text-xs sm:text-sm text-emerald-800 font-semibold">
                  <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 shrink-0" />
                  <span>
                    Input complies fully with all indexed brand policies.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
