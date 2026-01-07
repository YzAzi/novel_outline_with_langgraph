import { create } from "zustand"

import type { StoryNode, StoryProject } from "@/types/models"

interface ProjectStore {
  currentProject: StoryProject | null
  selectedNodeId: string | null
  isLoading: boolean
  error: string | null

  setProject: (project: StoryProject) => void
  selectNode: (nodeId: string | null) => void
  updateNode: (node: StoryNode) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  currentProject: null,
  selectedNodeId: null,
  isLoading: false,
  error: null,

  setProject: (project) => set({ currentProject: project, error: null }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  updateNode: (node) => {
    const project = get().currentProject
    if (!project) {
      return
    }

    const exists = project.nodes.some((item) => item.id === node.id)
    const nodes = exists
      ? project.nodes.map((item) => (item.id === node.id ? node : item))
      : [...project.nodes, node]

    set({
      currentProject: {
        ...project,
        nodes,
        updated_at: new Date().toISOString(),
      },
    })
  },
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}))

export type { ProjectStore }
