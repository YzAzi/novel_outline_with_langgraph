export interface CharacterGraphNode {
  id: string
  name: string
  bio?: string
  tags?: string[]
  story_node_ids?: string[]
}

export interface CharacterGraphLink {
  source: string
  target: string
  relation?: string
}

export interface CharacterGraphResponse {
  nodes: CharacterGraphNode[]
  links: CharacterGraphLink[]
}
