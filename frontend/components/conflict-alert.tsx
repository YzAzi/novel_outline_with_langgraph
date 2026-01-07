"use client"

import { useProjectStore } from "@/src/stores/project-store"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ConflictAlert() {
  const { conflicts, clearConflicts, removeConflict } = useProjectStore()

  if (conflicts.length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[320px] space-y-2">
      <div className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-xs shadow">
        <span className="font-semibold text-slate-700">冲突提醒</span>
        <Button size="sm" variant="ghost" onClick={clearConflicts}>
          全部清除
        </Button>
      </div>
      {conflicts.map((conflict) => {
        const colorClass =
          conflict.severity === "error"
            ? "border-red-200 bg-red-50 text-red-700"
            : conflict.severity === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-blue-200 bg-blue-50 text-blue-700"
        return (
          <div
            key={conflict._id}
            className={cn("rounded-lg border px-3 py-2 text-xs shadow", colorClass)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold">{conflict.type}</div>
              <button
                type="button"
                className="text-[11px] text-slate-500"
                onClick={() => removeConflict(conflict._id)}
              >
                关闭
              </button>
            </div>
            <div className="mt-1">{conflict.description}</div>
            {conflict.suggestion ? (
              <div className="mt-1 text-[11px] text-slate-600">
                建议：{conflict.suggestion}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
