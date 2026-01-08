"use client"

import { useEffect, useState } from "react"

import { CreateDialog } from "@/components/create-dialog"
import { CharacterGraph } from "@/components/character-graph"
import { ConflictAlert } from "@/components/conflict-alert"
import { KnowledgeWorkspace } from "@/components/knowledge-workspace"
import { ProjectList } from "@/components/project-list"
import { NodeEditor } from "@/components/node-editor"
import { StoryVisualizer } from "@/components/story-visualizer"
import { SyncIndicator } from "@/components/sync-indicator"
import { VersionHistory } from "@/components/version-history"
import { createVersion, updateProjectTitle } from "@/src/lib/api"
import { useWebsocket } from "@/src/hooks/use-websocket"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useProjectStore } from "@/src/stores/project-store"

const DEFAULT_TITLE = "未命名项目"

export default function Home() {
  const {
    currentProject,
    isLoading,
    error,
    loadProjects,
    saveStatus,
    setError,
    setProject,
    setProjectTitle,
  } = useProjectStore()
  const [layoutDirection, setLayoutDirection] = useState<"horizontal" | "vertical">("horizontal")
  const [activeTab, setActiveTab] = useState("outline")
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [versionOpen, setVersionOpen] = useState(false)
  const [isSavingTitle, setIsSavingTitle] = useState(false)

  useWebsocket(currentProject?.id ?? null)

  useEffect(() => {
    setTitle(currentProject?.title ?? DEFAULT_TITLE)
  }, [currentProject])

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        setVersionOpen(true)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        if (!currentProject) {
          return
        }
        const name = `手动快照 ${new Date().toLocaleString()}`
        try {
          await createVersion(currentProject.id, { name, type: "manual" })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "创建快照失败"
          setError(message)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [currentProject, setError])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    const updateDirection = () => {
      setLayoutDirection(window.innerWidth < 1024 ? "vertical" : "horizontal")
    }
    updateDirection()
    window.addEventListener("resize", updateDirection)
    return () => window.removeEventListener("resize", updateDirection)
  }, [])

  const handleTitleChange = (value: string) => {
    setTitle(value)
  }

  const handleSaveTitle = async () => {
    if (!currentProject) {
      return
    }
    const nextTitle = title.trim()
    if (!nextTitle) {
      setError("项目标题不能为空")
      return
    }
    setIsSavingTitle(true)
    try {
      const updated = await updateProjectTitle(currentProject.id, { title: nextTitle })
      setProject(updated)
      setTitle(updated.title)
      setProjectTitle(updated.id, updated.title, updated.updated_at)
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存项目标题失败"
      setError(message)
    } finally {
      setIsSavingTitle(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-4 lg:flex-nowrap">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setDrawerOpen(true)}
          >
            ☰
          </Button>
          <div className="flex min-w-[220px] flex-1 items-center gap-2">
            <Input
              value={title}
              onChange={(event) => handleTitleChange(event.target.value)}
              className="text-lg font-semibold"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveTitle}
              disabled={isSavingTitle}
            >
              {isSavingTitle ? "保存中..." : "保存"}
            </Button>
            <div className="text-xs text-muted-foreground">
              {saveStatus === "saving"
                ? "保存中..."
                : saveStatus === "saved"
                  ? "已保存"
                  : null}
            </div>
            <SyncIndicator />
          </div>
          <div className="flex flex-1 items-center justify-between gap-3 lg:justify-end">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="outline">大纲视图</TabsTrigger>
                <TabsTrigger value="relations">角色关系</TabsTrigger>
                <TabsTrigger value="knowledge">世界观设定</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVersionOpen(true)}
            >
              版本历史
            </Button>
            <CreateDialog />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col px-4 py-6">
        <ResizablePanelGroup direction={layoutDirection} className="mx-auto w-full max-w-6xl flex-1">
          <ResizablePanel defaultSize={60} minSize={30}>
            <div className="h-full pr-2">
              {activeTab === "outline" ? (
                <StoryVisualizer />
              ) : activeTab === "relations" ? (
                <CharacterGraph />
              ) : (
                <KnowledgeWorkspace />
              )}
            </div>
          </ResizablePanel>
          {activeTab === "knowledge" ? null : (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={40} minSize={25}>
                <div className="h-full pl-2">
                  <NodeEditor />
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </main>

      {isLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-full bg-white px-4 py-2 text-sm font-medium shadow">
            正在生成大纲...
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow">
          <span className="text-red-600">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>
            关闭
          </Button>
        </div>
      ) : null}

      <ConflictAlert />
      <VersionHistory open={versionOpen} onClose={() => setVersionOpen(false)} />

      {drawerOpen ? (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-80 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-semibold">项目列表</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDrawerOpen(false)}
              >
                关闭
              </Button>
            </div>
            <ProjectList />
          </aside>
        </div>
      ) : null}
    </div>
  )
}
