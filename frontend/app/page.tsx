"use client"

import { useEffect, useState } from "react"

import { CreateDialog } from "@/components/create-dialog"
import { NodeEditor } from "@/components/node-editor"
import { StoryVisualizer } from "@/components/story-visualizer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useProjectStore } from "@/src/stores/project-store"

const DEFAULT_TITLE = "未命名项目"

export default function Home() {
  const { currentProject, isLoading, error, setError, setProject } = useProjectStore()
  const [layoutDirection, setLayoutDirection] = useState<"horizontal" | "vertical">("horizontal")
  const [activeTab, setActiveTab] = useState("outline")
  const [title, setTitle] = useState(DEFAULT_TITLE)

  useEffect(() => {
    setTitle(currentProject?.title ?? DEFAULT_TITLE)
  }, [currentProject])

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
    if (currentProject) {
      setProject({ ...currentProject, title: value, updated_at: new Date().toISOString() })
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-4 lg:flex-nowrap">
          <div className="flex min-w-[220px] flex-1 items-center gap-2">
            <Input
              value={title}
              onChange={(event) => handleTitleChange(event.target.value)}
              className="text-lg font-semibold"
            />
            <Button variant="ghost" size="sm">
              保存
            </Button>
          </div>
          <div className="flex flex-1 items-center justify-between gap-3 lg:justify-end">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="outline">大纲视图</TabsTrigger>
                <TabsTrigger value="relations">角色关系</TabsTrigger>
              </TabsList>
            </Tabs>
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
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-white text-sm text-muted-foreground">
                  角色关系视图即将上线。
                </div>
              )}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={40} minSize={25}>
            <div className="h-full pl-2">
              <NodeEditor />
            </div>
          </ResizablePanel>
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
    </div>
  )
}
