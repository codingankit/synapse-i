"use client";

import { ConfirmClearModalProps } from "@/types";
import { Trash2 } from "lucide-react";

export function ConfirmClearModal({
  ruleCount,
  onCancel,
  onConfirm,
}: ConfirmClearModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 transition-all">
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-150">
        <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 mb-4 sm:mb-5 shadow-inner">
          <Trash2 className="w-7 h-7 sm:w-8 sm:h-8" />
        </div>

        <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
          Clear Memory Index?
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-2 leading-relaxed">
          This will permanently purge all {ruleCount} indexed brand rules from
          Database. You will need to upload a new Brand Bible PDF.
        </p>

        <div className="flex items-center gap-3 w-full mt-6 sm:mt-7">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 sm:py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs sm:text-sm hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 sm:py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs sm:text-sm shadow-md shadow-rose-600/20 transition-all active:scale-[0.98] cursor-pointer"
          >
            Yes, Delete
          </button>
        </div>
      </div>
    </div>
  );
}
