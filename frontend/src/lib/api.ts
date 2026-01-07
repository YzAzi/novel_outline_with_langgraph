import type { CharacterGraphResponse } from "@/src/types/character-graph"
import type { CreateOutlineRequest, ProjectSummary, StoryNode, StoryProject } from "@/types/models"
import { useProjectStore } from "@/stores/project-store"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

async function request<T>(
  path: string,
  options: RequestInit,
  config: { showLoading?: boolean } = {},
): Promise<T> {
  const { setLoading, setError } = useProjectStore.getState()
  const shouldSetLoading = config.showLoading !== false

  if (shouldSetLoading) {
    setLoading(true)
  }
  setError(null)

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      ...options,
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null)
      const detail = errorPayload?.detail ?? `Request failed with ${response.status}`
      throw new Error(detail)
    }

    return (await response.json()) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    setError(message)
    throw error
  } finally {
    if (shouldSetLoading) {
      setLoading(false)
    }
  }
}

export async function createOutline(
  payload: CreateOutlineRequest,
): Promise<StoryProject> {
  return request<StoryProject>("/api/create_outline", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function syncNode(
  projectId: string,
  node: StoryNode,
  options: { signal?: AbortSignal } = {},
): Promise<StoryProject> {
  return request<StoryProject>(
    "/api/sync_node",
    {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, node }),
      signal: options.signal,
    },
    { showLoading: false },
  )
}

export async function getCharacterGraph(
  projectId?: string,
  options: { signal?: AbortSignal } = {},
): Promise<CharacterGraphResponse> {
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""
  return request<CharacterGraphResponse>(
    `/api/character_graph${query}`,
    {
      method: "GET",
      signal: options.signal,
    },
    { showLoading: false },
  )
}

export async function getProjects(
  options: { signal?: AbortSignal } = {},
): Promise<ProjectSummary[]> {
  return request<ProjectSummary[]>(
    "/api/projects",
    {
      method: "GET",
      signal: options.signal,
    },
    { showLoading: false },
  )
}

export async function getProject(
  projectId: string,
  options: { signal?: AbortSignal } = {},
): Promise<StoryProject> {
  return request<StoryProject>(
    `/api/projects/${encodeURIComponent(projectId)}`,
    {
      method: "GET",
      signal: options.signal,
    },
    { showLoading: false },
  )
}

export async function deleteProject(
  projectId: string,
  options: { signal?: AbortSignal } = {},
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}`,
    {
      method: "DELETE",
      signal: options.signal,
    },
    { showLoading: false },
  )
}
