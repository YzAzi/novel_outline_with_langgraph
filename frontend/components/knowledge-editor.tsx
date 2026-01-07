"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"

import "@uiw/react-md-editor/dist/mdeditor.css"
import "@uiw/react-markdown-preview/dist/markdown.css"

import type { WorldDocument } from "@/src/types/models"
import { Button } from "@/components/ui/button"

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false })

type KnowledgeEditorProps = {
  document: WorldDocument | null
  onSave: (content: string) => Promise<void>
}

export function KnowledgeEditor({ document, onSave }: KnowledgeEditorProps) {
  const [value, setValue] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setValue(document?.content ?? "")
  }, [document?.id])

  const title = document?.title ?? "未选择文档"
  const category = document?.category ?? "--"

  const preview = useMemo(() => {
    return value.trim() ? null : (
      <div className="rounded-md border border-dashed bg-slate-50 px-4 py-6 text-sm text-muted-foreground">
        请输入或编辑世界观内容，右侧将实时预览。
      </div>
    )
  }, [value])

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-white text-sm text-muted-foreground">
        选择左侧文档开始编辑
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-xs text-slate-500">分类：{category}</div>
      </div>

      <div className="flex-1 overflow-hidden rounded-xl border bg-white p-4 shadow-sm">
        <div data-color-mode="light" className="h-full">
          <MDEditor
            height={520}
            value={value}
            onChange={(val) => setValue(val ?? "")}
          />
        </div>
        {preview}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={async () => {
            setIsSaving(true)
            try {
              await onSave(value)
            } finally {
              setIsSaving(false)
            }
          }}
          disabled={isSaving}
        >
          {isSaving ? "保存中..." : "保存并分块"}
        </Button>
      </div>
    </div>
  )
}
