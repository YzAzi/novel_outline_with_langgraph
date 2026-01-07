"use client"

import { useEffect, useMemo, useState } from "react"

import { useProjectStore } from "@/src/stores/project-store"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

export function ProjectList() {
  const {
    currentProject,
    loadProject,
    loadProjects,
    projects,
    removeProject,
  } = useProjectStore()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const sortedProjects = useMemo(() => {
    return [...projects].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  }, [projects])

  const handleLoad = async (projectId: string) => {
    setLoadingId(projectId)
    await loadProject(projectId)
    setLoadingId(null)
  }

  const handleDelete = async (projectId: string) => {
    await removeProject(projectId)
    setConfirmingId(null)
  }

  if (sortedProjects.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        暂无项目，点击“新建大纲”开始。
      </div>
    )
  }

  return (
    <div className="divide-y">
      {sortedProjects.map((project) => {
        const isActive = project.id === currentProject?.id
        const isConfirming = confirmingId === project.id
        const isLoading = loadingId === project.id

        return (
          <div key={project.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                className={cn(
                  "flex-1 text-left",
                  isActive ? "text-blue-600" : "text-slate-900"
                )}
                onClick={() => handleLoad(project.id)}
                disabled={isLoading}
              >
                <div className="text-sm font-semibold">
                  {project.title || "未命名项目"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(project.updated_at)}
                </div>
              </button>
              <div className="flex items-center gap-2">
                {isConfirming ? (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(project.id)}
                    >
                      确认删除
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmingId(null)}
                    >
                      取消
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmingId(project.id)}
                  >
                    删除
                  </Button>
                )}
              </div>
            </div>
            {isLoading ? (
              <div className="mt-2 text-xs text-muted-foreground">加载中...</div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
