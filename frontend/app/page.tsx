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
import {
  createVersion,
  getModelConfig,
  updateModelConfig,
  updateProjectTitle,
} from "@/src/lib/api"
import { useWebsocket } from "@/src/hooks/use-websocket"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
  const [modelConfig, setModelConfig] = useState<{
    drafting: string
    sync: string
    extraction: string
    baseUrl: string
    hasDefaultKey: boolean
    hasDraftingKey: boolean
    hasSyncKey: boolean
    hasExtractionKey: boolean
  } | null>(null)
  const [modelDialogOpen, setModelDialogOpen] = useState(false)
  const [isSavingModels, setIsSavingModels] = useState(false)
  const [modelForm, setModelForm] = useState({
    baseUrl: "",
    defaultKey: "",
    drafting: "",
    draftingKey: "",
    sync: "",
    syncKey: "",
    extraction: "",
    extractionKey: "",
  })

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
    const controller = new AbortController()
    getModelConfig({ signal: controller.signal })
      .then((config) => {
        const nextConfig = {
          baseUrl: config.base_url ?? "",
          drafting: config.drafting_model,
          sync: config.sync_model,
          extraction: config.extraction_model,
          hasDefaultKey: Boolean(config.has_default_key),
          hasDraftingKey: Boolean(config.has_drafting_key),
          hasSyncKey: Boolean(config.has_sync_key),
          hasExtractionKey: Boolean(config.has_extraction_key),
        }
        setModelConfig(nextConfig)
        setModelForm((prev) => ({
          ...prev,
          baseUrl: nextConfig.baseUrl,
          drafting: nextConfig.drafting,
          sync: nextConfig.sync,
          extraction: nextConfig.extraction,
        }))
      })
      .catch(() => null)
    return () => controller.abort()
  }, [])

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

  const handleModelFieldChange = (
    key:
      | "baseUrl"
      | "defaultKey"
      | "drafting"
      | "draftingKey"
      | "sync"
      | "syncKey"
      | "extraction"
      | "extractionKey",
    value: string
  ) => {
    setModelForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSaveModels = async () => {
    setIsSavingModels(true)
    try {
      const updated = await updateModelConfig({
        base_url: modelForm.baseUrl.trim() || null,
        default_api_key: modelForm.defaultKey.trim() || null,
        drafting_api_key: modelForm.draftingKey.trim() || null,
        sync_api_key: modelForm.syncKey.trim() || null,
        extraction_api_key: modelForm.extractionKey.trim() || null,
        drafting_model: modelForm.drafting.trim() || null,
        sync_model: modelForm.sync.trim() || null,
        extraction_model: modelForm.extraction.trim() || null,
      })
      const nextConfig = {
        baseUrl: updated.base_url ?? "",
        drafting: updated.drafting_model,
        sync: updated.sync_model,
        extraction: updated.extraction_model,
        hasDefaultKey: Boolean(updated.has_default_key),
        hasDraftingKey: Boolean(updated.has_drafting_key),
        hasSyncKey: Boolean(updated.has_sync_key),
        hasExtractionKey: Boolean(updated.has_extraction_key),
      }
      setModelConfig(nextConfig)
      setModelForm((prev) => ({
        ...prev,
        baseUrl: nextConfig.baseUrl,
        defaultKey: "",
        drafting: nextConfig.drafting,
        draftingKey: "",
        sync: nextConfig.sync,
        syncKey: "",
        extraction: nextConfig.extraction,
        extractionKey: "",
      }))
      setModelDialogOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新模型失败"
      setError(message)
    } finally {
      setIsSavingModels(false)
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
          <div className="flex min-w-[220px] flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
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
            {modelConfig ? (
              <div className="text-[11px] text-slate-500">
                模型：大纲 {modelConfig.drafting} · 同步 {modelConfig.sync} · 抽取{" "}
                {modelConfig.extraction}
              </div>
            ) : null}
          </div>
          <div className="flex flex-1 items-center justify-between gap-3 lg:justify-end">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="outline">大纲视图</TabsTrigger>
                <TabsTrigger value="relations">角色关系</TabsTrigger>
                <TabsTrigger value="knowledge">世界观设定</TabsTrigger>
              </TabsList>
            </Tabs>
            <Dialog open={modelDialogOpen} onOpenChange={setModelDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  模型设置
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>模型设置</DialogTitle>
                <DialogDescription>
                    留空并保存可恢复为默认模型配置，API Key 不会回显。
                </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                  <div>
                    <div className="text-xs text-slate-500">请求地址</div>
                    <Input
                      value={modelForm.baseUrl}
                      onChange={(event) =>
                        handleModelFieldChange("baseUrl", event.target.value)
                      }
                      placeholder="例如 https://api.openai.com/v1"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">默认 API Key</div>
                    <Input
                      type="password"
                      value={modelForm.defaultKey}
                      onChange={(event) =>
                        handleModelFieldChange("defaultKey", event.target.value)
                      }
                      placeholder={
                        modelConfig?.hasDefaultKey ? "已配置（不回显）" : "填写默认 Key"
                      }
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">大纲生成</div>
                    <Input
                      value={modelForm.drafting}
                      onChange={(event) =>
                        handleModelFieldChange("drafting", event.target.value)
                      }
                      placeholder="例如 gpt-4o"
                    />
                    <Input
                      className="mt-2"
                      type="password"
                      value={modelForm.draftingKey}
                      onChange={(event) =>
                        handleModelFieldChange("draftingKey", event.target.value)
                      }
                      placeholder={
                        modelConfig?.hasDraftingKey ? "已配置 Key（不回显）" : "可选 Key 覆盖"
                      }
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">同步分析</div>
                    <Input
                      value={modelForm.sync}
                      onChange={(event) =>
                        handleModelFieldChange("sync", event.target.value)
                      }
                      placeholder="例如 gpt-4o-mini"
                    />
                    <Input
                      className="mt-2"
                      type="password"
                      value={modelForm.syncKey}
                      onChange={(event) =>
                        handleModelFieldChange("syncKey", event.target.value)
                      }
                      placeholder={
                        modelConfig?.hasSyncKey ? "已配置 Key（不回显）" : "可选 Key 覆盖"
                      }
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">实体抽取</div>
                    <Input
                      value={modelForm.extraction}
                      onChange={(event) =>
                        handleModelFieldChange("extraction", event.target.value)
                      }
                      placeholder="例如 gpt-4o-mini"
                    />
                    <Input
                      className="mt-2"
                      type="password"
                      value={modelForm.extractionKey}
                      onChange={(event) =>
                        handleModelFieldChange("extractionKey", event.target.value)
                      }
                      placeholder={
                        modelConfig?.hasExtractionKey ? "已配置 Key（不回显）" : "可选 Key 覆盖"
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setModelForm({
                        baseUrl: "",
                        defaultKey: "",
                        drafting: "",
                        draftingKey: "",
                        sync: "",
                        syncKey: "",
                        extraction: "",
                        extractionKey: "",
                      })
                    }}
                    disabled={isSavingModels}
                  >
                    清空
                  </Button>
                  <Button onClick={handleSaveModels} disabled={isSavingModels}>
                    {isSavingModels ? "保存中..." : "保存"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
