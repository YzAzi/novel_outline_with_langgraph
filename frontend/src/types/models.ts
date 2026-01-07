export interface StoryNode {
  id: string
  title: string
  content: string
  narrative_order: number
  timeline_order: number
  location_tag: string
  characters: string[]
}

export interface CharacterProfile {
  id: string
  name: string
  tags: string[]
  bio: string
}

export interface StoryProject {
  id: string
  title: string
  world_view: string
  style_tags: string[]
  nodes: StoryNode[]
  characters: CharacterProfile[]
  created_at: string
  updated_at: string
}

export interface CreateOutlineRequest {
  world_view: string
  style_tags: string[]
  initial_prompt: string
}
