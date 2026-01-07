export type EntityType =
  | "character"
  | "location"
  | "item"
  | "event"
  | "organization"
  | "concept"

export interface CharacterGraphNode {
  id: string
  name: string
  type?: EntityType
  description?: string
  aliases?: string[]
  properties?: Record<string, unknown>
  source_refs?: string[]
}

export interface CharacterGraphLink {
  source: string
  target: string
  relation_type?: string
  relation_name?: string
  description?: string
}

export interface CharacterGraphResponse {
  nodes: CharacterGraphNode[]
  links: CharacterGraphLink[]
}
