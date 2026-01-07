"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"

import type { StoryNode } from "@/src/types/models"
import { syncNode } from "@/src/lib/api"
import { useDebounce } from "@/src/lib/use-debounce"
import { useProjectStore } from "@/src/stores/project-store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function NodeEditor() {
  const { currentProject, selectedNodeId, saveStatus, setSaveStatus, setProject } =
    useProjectStore()
  const selectedNode = useMemo(() => {
    if (!currentProject || !selectedNodeId) {
      return null
    }
    return currentProject.nodes.find((node) => node.id === selectedNodeId) ?? null
  }, [currentProject, selectedNodeId])

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [narrativeOrder, setNarrativeOrder] = useState("")
  const [timelineOrder, setTimelineOrder] = useState("")
  const [locationTag, setLocationTag] = useState("")
  const [characters, setCharacters] = useState<string[]>([])
  const [newCharacterNotice, setNewCharacterNotice] = useState<string | null>(null)

  const lastSavedRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const saveCounterRef = useRef(0)

  useEffect(() => {
    if (!selectedNode) {
      setTitle("")
      setContent("")
      setNarrativeOrder("")
      setTimelineOrder("")
      setLocationTag("")
      setCharacters([])
      setSaveStatus("idle")
      setNewCharacterNotice(null)
      lastSavedRef.current = null
      return
    }

    setTitle(selectedNode.title ?? "")
    setContent(selectedNode.content ?? "")
    setNarrativeOrder(String(selectedNode.narrative_order ?? 0))
    setTimelineOrder(String(selectedNode.timeline_order ?? 0))
    setLocationTag(selectedNode.location_tag ?? "")
    setCharacters(selectedNode.characters ?? [])
    setSaveStatus("idle")
    setNewCharacterNotice(null)
    lastSavedRef.current = JSON.stringify({
      title: selectedNode.title ?? "",
      content: selectedNode.content ?? "",
      narrativeOrder: String(selectedNode.narrative_order ?? 0),
      timelineOrder: String(selectedNode.timeline_order ?? 0),
      locationTag: selectedNode.location_tag ?? "",
      characters: selectedNode.characters ?? [],
    })
  }, [selectedNodeId, selectedNode])

  const formSnapshot = useMemo(
    () => ({
      title,
      content,
      narrativeOrder,
      timelineOrder,
      locationTag,
      characters,
    }),
    [title, content, narrativeOrder, timelineOrder, locationTag, characters]
  )

  const debouncedSnapshot = useDebounce(formSnapshot, 2000)
  const snapshotKey = useMemo(() => JSON.stringify(formSnapshot), [formSnapshot])

  useEffect(() => {
    if (saveStatus === "saving") {
      abortControllerRef.current?.abort()
    }
  }, [snapshotKey, saveStatus])

  const buildNodePayload = useCallback(
    (snapshot: typeof formSnapshot): StoryNode | null => {
      if (!selectedNode) {
        return null
      }

      const narrativeValue = Number.parseInt(snapshot.narrativeOrder, 10)
      const timelineValue = Number.parseFloat(snapshot.timelineOrder)

      return {
        ...selectedNode,
        title: snapshot.title.trim() || "未命名节点",
        content: snapshot.content,
        narrative_order: Number.isFinite(narrativeValue) ? narrativeValue : 0,
        timeline_order: Number.isFinite(timelineValue) ? timelineValue : 0,
        location_tag: snapshot.locationTag.trim() || "未标记",
        characters: snapshot.characters,
      }
    },
    [selectedNode]
  )

  const saveNode = useCallback(
    async (snapshot: typeof formSnapshot) => {
      if (!currentProject || !selectedNode) {
        return
      }

      const payload = buildNodePayload(snapshot)
      if (!payload) {
        return
      }

      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller
      saveCounterRef.current += 1
      const saveId = saveCounterRef.current

      setSaveStatus("saving")

      try {
        const nextProject = await syncNode(currentProject.id, payload, {
          signal: controller.signal,
        })
        if (saveCounterRef.current !== saveId) {
          return
        }

        const previousCharacterIds = new Set(
          currentProject.characters.map((item) => item.id)
        )
        const newCharacters = nextProject.characters.filter(
          (item) => !previousCharacterIds.has(item.id)
        )

        if (newCharacters.length > 0) {
          setNewCharacterNotice(
            `新增角色：${newCharacters.map((item) => item.name).join("、")}`
          )
        } else {
          setNewCharacterNotice(null)
        }

        setProject(nextProject)
        lastSavedRef.current = JSON.stringify(snapshot)
        setSaveStatus("saved")
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }
        setSaveStatus("idle")
      }
    },
    [buildNodePayload, currentProject, selectedNode, setProject, setSaveStatus]
  )

  useEffect(() => {
    if (!selectedNode) {
      return
    }
    if (lastSavedRef.current === JSON.stringify(debouncedSnapshot)) {
      return
    }
    saveNode(debouncedSnapshot)
  }, [debouncedSnapshot, saveNode, selectedNode])

  const handleManualSave = useCallback(() => {
    if (!selectedNode) {
      return
    }
    saveNode(formSnapshot)
  }, [formSnapshot, saveNode, selectedNode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        handleManualSave()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleManualSave])

  const handleCharacterToggle = (characterId: string) => {
    abortControllerRef.current?.abort()
    setCharacters((prev) =>
      prev.includes(characterId)
        ? prev.filter((id) => id !== characterId)
        : [...prev, characterId]
    )
    setSaveStatus("idle")
  }

  const handleChange =
    (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      abortControllerRef.current?.abort()
      setter(event.target.value)
      setSaveStatus("idle")
    }

  if (!selectedNode) {
    return (
      <Card id="node-editor" tabIndex={-1} className="h-full outline-none">
        <CardHeader>
          <CardTitle>节点编辑</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          点击左侧节点进行编辑
        </CardContent>
      </Card>
    )
  }

  const characterOptions = currentProject?.characters ?? []

  return (
    <Card id="node-editor" tabIndex={-1} className="h-full outline-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>节点编辑</CardTitle>
          <div className="text-xs text-muted-foreground">
            {saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "已保存" : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {newCharacterNotice ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {newCharacterNotice}
          </div>
        ) : null}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="node-title">
            标题
          </label>
          <Input id="node-title" value={title} onChange={handleChange(setTitle)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="node-content">
            内容梗概
          </label>
          <Textarea
            id="node-content"
            rows={8}
            value={content}
            onChange={handleChange(setContent)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="narrative-order">
              叙事顺序
            </label>
            <Input
              id="narrative-order"
              type="number"
              value={narrativeOrder}
              onChange={handleChange(setNarrativeOrder)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="timeline-order">
              时间轴位置
            </label>
            <Input
              id="timeline-order"
              type="number"
              step="0.1"
              value={timelineOrder}
              onChange={handleChange(setTimelineOrder)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="location-tag">
            泳道标签
          </label>
          <Input
            id="location-tag"
            value={locationTag}
            onChange={handleChange(setLocationTag)}
            placeholder="例如：港口、旧城区"
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">涉及角色</p>
          {characterOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无角色可选</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {characterOptions.map((character) => (
                <label key={character.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={characters.includes(character.id)}
                    onChange={() => handleCharacterToggle(character.id)}
                  />
                  {character.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={handleManualSave}>
            手动保存 (Ctrl+S)
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
