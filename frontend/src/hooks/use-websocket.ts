"use client"

import { useEffect, useRef } from "react"

import type { Conflict, StoryNode } from "@/src/types/models"
import { WebSocketClient } from "@/src/lib/websocket"
import { useProjectStore } from "@/src/stores/project-store"

type NodeUpdatedPayload = { node?: StoryNode }

export function useWebsocket(projectId: string | null) {
  const clientRef = useRef<WebSocketClient | null>(null)
  const {
    addConflict,
    clearConflicts,
    setSyncStatus,
    setWsStatus,
    updateGraphFromServer,
    updateNodeFromServer,
  } = useProjectStore()

  useEffect(() => {
    if (!projectId) {
      clientRef.current?.disconnect()
      return
    }

    if (!clientRef.current) {
      clientRef.current = new WebSocketClient()
    }

    clearConflicts()
    const client = clientRef.current
    client.connect(projectId)

    const unsubscribeStatus = client.onStatus((status) => {
      setWsStatus(status)
    })

    const unsubscribeNode = client.on("node_updated", (payload) => {
      const data = payload as NodeUpdatedPayload
      if (data?.node) {
        updateNodeFromServer(data.node)
      }
    })

    const unsubscribeGraph = client.on("graph_updated", (payload) => {
      updateGraphFromServer(payload)
    })

    const unsubscribeConflict = client.on("conflict_detected", (payload) => {
      const data = payload as { conflicts?: Conflict[] }
      if (data?.conflicts) {
        data.conflicts.forEach((conflict) => addConflict(conflict))
      }
    })

    const unsubscribeSyncStart = client.on("sync_started", () => {
      setSyncStatus("syncing")
    })

    const unsubscribeSyncCompleted = client.on("sync_completed", () => {
      setSyncStatus("completed")
    })

    const unsubscribeSyncFailed = client.on("sync_failed", () => {
      setSyncStatus("failed")
    })

    return () => {
      unsubscribeNode()
      unsubscribeGraph()
      unsubscribeConflict()
      unsubscribeSyncStart()
      unsubscribeSyncCompleted()
      unsubscribeSyncFailed()
      unsubscribeStatus()
      client.disconnect()
    }
  }, [
    addConflict,
    clearConflicts,
    projectId,
    setSyncStatus,
    setWsStatus,
    updateGraphFromServer,
    updateNodeFromServer,
  ])
}
