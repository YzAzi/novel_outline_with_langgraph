"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { exportProject, importProject } from "@/src/lib/api"
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
    setError,
    setProject,
  } = useProjectStore()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

  const handleExport = async (projectId: string, title: string) => {
    setExportingId(projectId)
    try {
      const data = await exportProject(projectId)
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${title || "project"}-${projectId}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      const message = error instanceof Error ? error.message : "导出失败"
      setError(message)
    } finally {
      setExportingId(null)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImport = async (file: File) => {
    setIsImporting(true)
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      const project = await importProject(payload)
      setProject(project)
      await loadProjects()
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败"
      setError(message)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
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
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="text-xs font-semibold text-slate-500">项目管理</div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                handleImport(file)
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleImportClick}
            disabled={isImporting}
          >
            {isImporting ? "导入中..." : "导入"}
          </Button>
        </div>
      </div>
      {sortedProjects.map((project) => {
        const isActive = project.id === currentProject?.id
        const isConfirming = confirmingId === project.id
        const isLoading = loadingId === project.id
        const isExporting = exportingId === project.id

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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleExport(project.id, project.title)}
                  disabled={isExporting}
                >
                  {isExporting ? "导出中..." : "导出"}
                </Button>
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
