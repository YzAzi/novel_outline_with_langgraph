"use client"

import "@xyflow/react/dist/style.css"

import { useMemo, useCallback } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import dagre from "dagre"

import type { StoryNode } from "@/src/types/models"
import { useProjectStore } from "@/src/stores/project-store"
import { cn } from "@/lib/utils"

const NODE_WIDTH = 220
const NODE_HEIGHT = 120
const LANE_HEIGHT = 180
const TAG_COLORS = [
  "bg-amber-100 text-amber-900",
  "bg-sky-100 text-sky-900",
  "bg-emerald-100 text-emerald-900",
  "bg-rose-100 text-rose-900",
  "bg-lime-100 text-lime-900",
  "bg-orange-100 text-orange-900",
  "bg-teal-100 text-teal-900",
  "bg-fuchsia-100 text-fuchsia-900",
]

const defaultEdgeOptions = { type: "smoothstep", animated: false }

type StoryNodeData = {
  title: string
  locationTag: string
  colorClass: string
  highlight: boolean
}

type StoryFlowNode = Node<StoryNodeData, "storyNode">

function StoryNodeCard({ data, selected }: NodeProps<StoryFlowNode>) {
  return (
    <div
      className={cn(
        "w-[220px] rounded-lg border bg-white p-3 shadow-sm transition",
        selected
          ? "ring-2 ring-blue-500"
          : data.highlight
            ? "ring-2 ring-amber-400"
            : "hover:border-slate-300"
      )}
    >
      <div className="mb-2 text-sm font-semibold text-slate-900">{data.title}</div>
      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", data.colorClass)}>
        {data.locationTag}
      </span>
    </div>
  )
}

function getLocationTag(node: StoryNode) {
  const tag = node.location_tag?.trim()
  return tag && tag.length > 0 ? tag : "未标记"
}

function getTagColor(tag: string, lanes: string[]) {
  const index = lanes.indexOf(tag)
  return TAG_COLORS[index % TAG_COLORS.length]
}

function buildEdges(nodes: StoryNode[]): Edge[] {
  const sorted = [...nodes].sort((a, b) => a.narrative_order - b.narrative_order)
  const edges: Edge[] = []
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const source = sorted[i]
    const target = sorted[i + 1]
    edges.push({
      id: `edge-${source.id}-${target.id}`,
      source: source.id,
      target: target.id,
      type: "smoothstep",
    })
  }
  return edges
}

function buildLayoutEdges(nodes: StoryNode[]) {
  const sorted = [...nodes].sort((a, b) => a.timeline_order - b.timeline_order)
  const edges: Array<{ source: string; target: string }> = []
  for (let i = 0; i < sorted.length - 1; i += 1) {
    edges.push({ source: sorted[i].id, target: sorted[i + 1].id })
  }
  return edges
}

function buildLayout(
  storyNodes: StoryNode[],
  lanes: string[]
): { nodes: StoryFlowNode[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({
    rankdir: "LR",
    nodesep: 80,
    ranksep: 140,
  })

  storyNodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  })

  const layoutEdges = buildLayoutEdges(storyNodes)
  layoutEdges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  const laneMap = new Map<string, number>()
  lanes.forEach((tag, index) => laneMap.set(tag, index))

  const nodes: StoryFlowNode[] = storyNodes.map((node) => {
    const tag = getLocationTag(node)
    const laneIndex = laneMap.get(tag) ?? 0
    const dagreNode = dagreGraph.node(node.id)
    const x = dagreNode ? dagreNode.x - NODE_WIDTH / 2 : 0
    const y = laneIndex * LANE_HEIGHT + (LANE_HEIGHT - NODE_HEIGHT) / 2

    return {
      id: node.id,
      type: "storyNode",
      data: {
        title: node.title || "未命名节点",
        locationTag: tag,
        colorClass: getTagColor(tag, lanes),
        highlight: false,
      },
      position: { x, y },
    }
  })

  return { nodes, edges: buildEdges(storyNodes) }
}

export function StoryVisualizer() {
  const { currentProject, selectedNodeId, highlightedNodeIds, selectNode } = useProjectStore()
  const storyNodes = currentProject?.nodes ?? []
  const lanes = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    storyNodes.forEach((node) => {
      const tag = getLocationTag(node)
      if (!seen.has(tag)) {
        seen.add(tag)
        result.push(tag)
      }
    })
    return result.length > 0 ? result : ["未标记"]
  }, [storyNodes])

  const { nodes, edges } = useMemo(() => buildLayout(storyNodes, lanes), [storyNodes, lanes])

  const flowNodes = useMemo(() => {
    const highlighted = new Set(highlightedNodeIds)
    return nodes.map((node) => ({
      ...node,
      selected: node.id === selectedNodeId,
      data: {
        ...node.data,
        highlight: highlighted.has(node.id),
      },
    }))
  }, [nodes, highlightedNodeIds, selectedNodeId])

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id)
    },
    [selectNode]
  )

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id)
      document.getElementById("node-editor")?.focus()
    },
    [selectNode]
  )

  const nodeTypes = useMemo(() => ({ storyNode: StoryNodeCard }), [])

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-white text-sm text-muted-foreground">
        先创建大纲以查看节点布局。
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden rounded-xl border bg-white">
      <div className="flex w-[140px] shrink-0 flex-col border-r bg-slate-50">
        <div className="px-3 py-3 text-xs font-semibold text-slate-500">场景泳道</div>
        <div className="flex flex-1 flex-col">
          {lanes.map((lane, index) => (
            <div
              key={`${lane}-${index}`}
              className="flex items-center px-3 text-xs font-medium text-slate-600"
              style={{ height: LANE_HEIGHT }}
            >
              {lane}
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1">
        <ReactFlow
          nodes={flowNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          panOnScroll
          zoomOnScroll
          fitView
          minZoom={0.4}
          maxZoom={1.4}
          nodesDraggable={false}
        >
          <Background gap={24} size={1} />
          <Controls position="bottom-right" />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  )
}
