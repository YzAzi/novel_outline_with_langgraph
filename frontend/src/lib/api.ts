import type { CreateOutlineRequest, StoryNode, StoryProject } from "@/types/models"
import { useProjectStore } from "@/stores/project-store"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const { setLoading, setError } = useProjectStore.getState()

  setLoading(true)
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
    setLoading(false)
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
): Promise<StoryProject> {
  return request<StoryProject>("/api/sync_node", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, node }),
  })
}
