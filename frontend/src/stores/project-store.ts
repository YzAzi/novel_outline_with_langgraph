import { create } from "zustand"

import { deleteProject, getProject, getProjects } from "@/src/lib/api"
import type { ProjectSummary, StoryNode, StoryProject } from "@/types/models"

interface ProjectStore {
  currentProject: StoryProject | null
  selectedNodeId: string | null
  highlightedNodeIds: string[]
  projects: ProjectSummary[]
  saveStatus: "idle" | "saving" | "saved"
  isLoading: boolean
  error: string | null

  setProject: (project: StoryProject) => void
  selectNode: (nodeId: string | null) => void
  setHighlightedNodes: (nodeIds: string[]) => void
  setSaveStatus: (status: "idle" | "saving" | "saved") => void
  loadProjects: () => Promise<void>
  loadProject: (projectId: string) => Promise<void>
  removeProject: (projectId: string) => Promise<void>
  updateNode: (node: StoryNode) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  currentProject: null,
  selectedNodeId: null,
  highlightedNodeIds: [],
  projects: [],
  saveStatus: "idle",
  isLoading: false,
  error: null,

  setProject: (project) =>
    set({
      currentProject: project,
      error: null,
      highlightedNodeIds: [],
      saveStatus: "idle",
    }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setHighlightedNodes: (nodeIds) => set({ highlightedNodeIds: nodeIds }),
  setSaveStatus: (status) => set({ saveStatus: status }),
  loadProjects: async () => {
    const { setError } = get()
    try {
      const projects = await getProjects()
      set({ projects })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      setError(message)
    }
  },
  loadProject: async (projectId) => {
    const { setError } = get()
    try {
      const project = await getProject(projectId)
      set({
        currentProject: project,
        selectedNodeId: null,
        highlightedNodeIds: [],
        saveStatus: "idle",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      setError(message)
    }
  },
  removeProject: async (projectId) => {
    const { currentProject, setError } = get()
    try {
      await deleteProject(projectId)
      set((state) => ({
        projects: state.projects.filter((project) => project.id !== projectId),
        currentProject:
          currentProject?.id === projectId ? null : state.currentProject,
        selectedNodeId:
          currentProject?.id === projectId ? null : state.selectedNodeId,
        highlightedNodeIds:
          currentProject?.id === projectId ? [] : state.highlightedNodeIds,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      setError(message)
    }
  },
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
