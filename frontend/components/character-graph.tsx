"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ForceGraph2D from "react-force-graph-2d"

import { getCharacterGraph } from "@/src/lib/api"
import { useProjectStore } from "@/src/stores/project-store"
import type {
  CharacterGraphLink,
  CharacterGraphNode,
  CharacterGraphResponse,
} from "@/src/types/character-graph"

const RELATION_COLORS: Record<string, string> = {
  ally: "#16a34a",
  friend: "#22c55e",
  rival: "#f97316",
  enemy: "#ef4444",
  family: "#0ea5e9",
  mentor: "#8b5cf6",
  lover: "#ec4899",
  unknown: "#94a3b8",
}

function getRelationColor(relation?: string) {
  if (!relation) {
    return RELATION_COLORS.unknown
  }
  if (RELATION_COLORS[relation]) {
    return RELATION_COLORS[relation]
  }
  let hash = 0
  for (let i = 0; i < relation.length; i += 1) {
    hash = relation.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 70% 45%)`
}

function buildNodeLabel(node: CharacterGraphNode) {
  const rows = [node.name]
  if (node.tags && node.tags.length > 0) {
    rows.push(`标签：${node.tags.join("、")}`)
  }
  if (node.bio) {
    rows.push(`简介：${node.bio}`)
  }
  return rows.join("\n")
}

export function CharacterGraph() {
  const { currentProject, setHighlightedNodes } = useProjectStore()
  const [graphData, setGraphData] = useState<CharacterGraphResponse>({
    nodes: [],
    links: [],
  })
  const graphDataRef = useRef(graphData)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    graphDataRef.current = graphData
  }, [graphData])

  const loadGraph = useCallback(async () => {
    if (!currentProject) {
      setGraphData({ nodes: [], links: [] })
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const hasData = graphDataRef.current.nodes.length > 0
    if (hasData) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }

    try {
      const response = await getCharacterGraph(currentProject.id, {
        signal: controller.signal,
      })
      setGraphData(response)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      setGraphData({ nodes: [], links: [] })
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [currentProject])

  useEffect(() => {
    loadGraph()
    return () => {
      abortRef.current?.abort()
    }
  }, [loadGraph, currentProject?.updated_at])

  const handleNodeClick = useCallback(
    (node: CharacterGraphNode) => {
      setHighlightedNodes(node.story_node_ids ?? [])
    },
    [setHighlightedNodes]
  )

  const handleBackgroundClick = useCallback(() => {
    setHighlightedNodes([])
  }, [setHighlightedNodes])

  const graphDataMemo = useMemo(() => {
    return {
      nodes: graphData.nodes,
      links: graphData.links,
    }
  }, [graphData.links, graphData.nodes])

  const drawLinkLabel = useCallback(
    (link: CharacterGraphLink, ctx: CanvasRenderingContext2D) => {
      const relation = link.relation
      if (!relation) {
        return
      }
      const source = link.source as CharacterGraphNode & { x?: number; y?: number }
      const target = link.target as CharacterGraphNode & { x?: number; y?: number }
      if (source?.x == null || source?.y == null || target?.x == null || target?.y == null) {
        return
      }

      const x = (source.x + target.x) / 2
      const y = (source.y + target.y) / 2
      ctx.save()
      ctx.font = "12px sans-serif"
      ctx.fillStyle = "#475569"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(relation, x, y)
      ctx.restore()
    },
    []
  )

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-white text-sm text-muted-foreground">
        先生成大纲，再查看角色关系。
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border bg-white text-sm text-muted-foreground">
        正在加载角色关系...
      </div>
    )
  }

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-white text-sm text-muted-foreground">
        暂无角色关系数据
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-hidden rounded-xl border bg-white">
      {isRefreshing ? (
        <div className="absolute right-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1 text-xs text-slate-500 shadow">
          更新中...
        </div>
      ) : null}
      <ForceGraph2D
        graphData={graphDataMemo}
        nodeAutoColorBy="id"
        nodeLabel={buildNodeLabel}
        nodeRelSize={6}
        nodeCanvasObject={(node, ctx) => {
          const graphNode = node as CharacterGraphNode & { x?: number; y?: number }
          if (graphNode.x == null || graphNode.y == null) {
            return
          }
          ctx.save()
          ctx.font = "12px sans-serif"
          ctx.fillStyle = "#0f172a"
          ctx.textAlign = "center"
          ctx.textBaseline = "top"
          ctx.fillText(graphNode.name, graphNode.x, graphNode.y + 8)
          ctx.restore()
        }}
        linkColor={(link) => getRelationColor((link as CharacterGraphLink).relation)}
        linkWidth={1.8}
        linkDirectionalParticles={0}
        linkCanvasObject={drawLinkLabel}
        linkCanvasObjectMode={() => "after"}
        onNodeClick={(node) => handleNodeClick(node as CharacterGraphNode)}
        onBackgroundClick={handleBackgroundClick}
        cooldownTicks={100}
      />
    </div>
  )
}
