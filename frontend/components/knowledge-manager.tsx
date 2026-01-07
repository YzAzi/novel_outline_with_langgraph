"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import type { SearchResult, WorldDocument, WorldKnowledgeBase } from "@/src/types/models"
import {
  deleteWorldDocument,
  getProjectStats,
  getWorldKnowledgeBase,
  searchWorldKnowledge,
} from "@/src/lib/api"
import { useProjectStore } from "@/src/stores/project-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type KnowledgeManagerProps = {
  onSelectDocument: (doc: WorldDocument | null) => void
  selectedDocumentId: string | null
  refreshSignal: number
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value)
}

function highlightText(text: string, query: string) {
  if (!query.trim()) {
    return text
  }
  const parts = text.split(new RegExp(`(${query})`, "gi"))
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={index} className="rounded bg-yellow-200 px-1">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  )
}

export function KnowledgeManager({
  onSelectDocument,
  selectedDocumentId,
  refreshSignal,
}: KnowledgeManagerProps) {
  const { currentProject } = useProjectStore()
  const [knowledgeBase, setKnowledgeBase] = useState<WorldKnowledgeBase | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({})
  const [stats, setStats] = useState<{
    total_words: number
    total_knowledge_docs: number
    total_chunks: number
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  const loadKnowledge = useCallback(async () => {
    if (!currentProject) {
      setKnowledgeBase(null)
      setSearchResults(null)
      setStats(null)
      return
    }
    setIsLoading(true)
    try {
      const [base, projectStats] = await Promise.all([
        getWorldKnowledgeBase(currentProject.id),
        getProjectStats(currentProject.id),
      ])
      setKnowledgeBase(base)
      setStats({
        total_words: projectStats.total_words,
        total_knowledge_docs: projectStats.total_knowledge_docs,
        total_chunks: base.total_chunks,
      })
    } finally {
      setIsLoading(false)
    }
  }, [currentProject])

  useEffect(() => {
    loadKnowledge()
  }, [loadKnowledge, refreshSignal])

  const handleSearch = useCallback(async () => {
    if (!currentProject) {
      return
    }
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    setIsSearching(true)
    try {
      const results = await searchWorldKnowledge(currentProject.id, {
        query: searchQuery,
      })
      setSearchResults(results)
    } finally {
      setIsSearching(false)
    }
  }, [currentProject, searchQuery])

  const docs = knowledgeBase?.documents ?? []
  const sortedDocs = useMemo(() => {
    return [...docs].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  }, [docs])

  const handleDelete = async (doc: WorldDocument) => {
    if (!currentProject) {
      return
    }
    await deleteWorldDocument(currentProject.id, doc.id)
    if (selectedDocumentId === doc.id) {
      onSelectDocument(null)
    }
    loadKnowledge()
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">知识库概览</div>
        <div className="mt-2 grid grid-cols-3 gap-3 text-xs text-slate-500">
          <div>
            总字数
            <div className="text-sm font-semibold text-slate-900">
              {stats ? formatNumber(stats.total_words) : "--"}
            </div>
          </div>
          <div>
            文档数
            <div className="text-sm font-semibold text-slate-900">
              {stats ? formatNumber(stats.total_knowledge_docs) : "--"}
            </div>
          </div>
          <div>
            分块数
            <div className="text-sm font-semibold text-slate-900">
              {stats ? formatNumber(stats.total_chunks) : "--"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索世界观知识..."
          />
          <Button size="sm" onClick={handleSearch} disabled={isSearching}>
            {isSearching ? "搜索中..." : "搜索"}
          </Button>
        </div>
        {searchResults ? (
          <div className="mt-3 space-y-2">
            {searchResults.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无匹配结果</div>
            ) : (
              searchResults.map((result) => {
                const docId = (result.metadata as { document_id?: string })
                  ?.document_id
                const doc = sortedDocs.find((item) => item.id === docId) ?? null
                return (
                  <div
                    key={result.id}
                    className="rounded-md border border-dashed p-2 text-xs text-slate-600"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-500">
                        {doc?.title ?? "未命名文档"}
                      </div>
                      {doc ? (
                        <button
                          type="button"
                          className="text-[11px] text-blue-600"
                          onClick={() => onSelectDocument(doc)}
                        >
                          打开
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-1">
                      {highlightText(result.content, searchQuery)}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border bg-white shadow-sm">
        <div className="border-b px-4 py-3 text-sm font-semibold text-slate-900">
          世界观文档
        </div>
        {isLoading ? (
          <div className="px-4 py-6 text-xs text-muted-foreground">加载中...</div>
        ) : sortedDocs.length === 0 ? (
          <div className="px-4 py-6 text-xs text-muted-foreground">
            暂无世界观文档，请上传或新建。
          </div>
        ) : (
          <div className="divide-y">
            {sortedDocs.map((doc) => {
              const isExpanded = expandedDocs[doc.id]
              const isSelected = doc.id === selectedDocumentId
              return (
                <div key={doc.id} className="px-4 py-3">
                  <button
                    type="button"
                    className={`w-full text-left ${isSelected ? "text-blue-600" : "text-slate-900"}`}
                    onClick={() => onSelectDocument(doc)}
                  >
                    <div className="text-sm font-semibold">{doc.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>分类：{doc.category}</span>
                      <span>字数：{doc.content.length}</span>
                      <span>分块：{doc.chunks.length}</span>
                    </div>
                  </button>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setExpandedDocs((prev) => ({
                          ...prev,
                          [doc.id]: !isExpanded,
                        }))
                      }
                    >
                      {isExpanded ? "收起内容" : "展开内容"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(doc)}
                    >
                      删除
                    </Button>
                  </div>
                  {isExpanded ? (
                    <div className="mt-2 rounded-md border border-dashed bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      {highlightText(doc.content, searchQuery)}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
