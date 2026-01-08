from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

from .knowledge_graph import Entity, EntityType, KnowledgeGraph
from .models import StoryNode, StoryProject


class ConflictType(str, Enum):
    TIMELINE_INCONSISTENCY = "timeline"
    CHARACTER_CONTRADICTION = "character"
    RELATION_CONFLICT = "relation"
    WORLD_RULE_VIOLATION = "world_rule"


class Conflict(BaseModel):
    type: ConflictType
    severity: str
    description: str
    node_ids: list[str] = Field(default_factory=list)
    entity_ids: list[str] = Field(default_factory=list)
    suggestion: str | None = None


class ConflictDetector:
    async def detect_conflicts(
        self,
        project: StoryProject,
        graph: KnowledgeGraph,
        modified_node: StoryNode,
    ) -> list[Conflict]:
        conflicts: list[Conflict] = []
        conflicts.extend(await self.check_timeline_consistency(project.nodes))

        character_entities = [
            entity for entity in graph.entities if entity.type == EntityType.CHARACTER
        ]
        for character in character_entities:
            mentions = self._find_character_mentions(character, project.nodes)
            if mentions:
                conflicts.extend(
                    await self.check_character_consistency(character, mentions)
                )
        return conflicts

    async def check_timeline_consistency(
        self,
        nodes: list[StoryNode],
    ) -> list[Conflict]:
        if len(nodes) < 2:
            return []

        sorted_nodes = sorted(nodes, key=lambda node: node.narrative_order)
        conflicts: list[Conflict] = []
        for previous, current in zip(sorted_nodes, sorted_nodes[1:]):
            if current.timeline_order < previous.timeline_order:
                conflicts.append(
                    Conflict(
                        type=ConflictType.TIMELINE_INCONSISTENCY,
                        severity="warning",
                        description=(
                            f"叙事顺序 {current.narrative_order} 的时间线早于上一节点，"
                            "可能存在时间线逆序。"
                        ),
                        node_ids=[previous.id, current.id],
                        suggestion="请检查时间轴位置是否需要调整。",
                    )
                )
        return conflicts

    async def check_character_consistency(
        self,
        character: Entity,
        mentions: list[StoryNode],
    ) -> list[Conflict]:
        death_keywords = ["死亡", "死去", "身亡", "葬", "牺牲"]
        alive_keywords = ["出现", "现身", "活着", "归来", "重逢"]

        death_nodes: list[StoryNode] = []
        alive_nodes: list[StoryNode] = []
        for node in mentions:
            content = node.content
            if any(keyword in content for keyword in death_keywords):
                death_nodes.append(node)
            if any(keyword in content for keyword in alive_keywords):
                alive_nodes.append(node)

        if not death_nodes or not alive_nodes:
            return []

        earliest_death = min(death_nodes, key=lambda node: node.timeline_order)
        conflicting_nodes = [
            node
            for node in alive_nodes
            if node.timeline_order > earliest_death.timeline_order
        ]

        if not conflicting_nodes:
            return []

        return [
            Conflict(
                type=ConflictType.CHARACTER_CONTRADICTION,
                severity="warning",
                description=(
                    f"角色 {character.name} 在时间线 {earliest_death.timeline_order} "
                    "之后仍有出场记录，可能与死亡描述冲突。"
                ),
                node_ids=[earliest_death.id] + [node.id for node in conflicting_nodes],
                entity_ids=[character.id],
                suggestion="若角色复活或为回忆情节，请在节点说明中标注。",
            )
        ]

    def _find_character_mentions(
        self,
        character: Entity,
        nodes: list[StoryNode],
    ) -> list[StoryNode]:
        mentions: list[StoryNode] = []
        name = character.name.lower()
        aliases = [alias.lower() for alias in character.aliases]
        for node in nodes:
            if character.id in node.characters:
                mentions.append(node)
                continue
            content = node.content.lower()
            if name in content or any(alias in content for alias in aliases):
                mentions.append(node)
        return mentions


class SyncNodeResponse(BaseModel):
    project: StoryProject
    sync_result: "SyncResult"
    conflicts: list[Conflict] = Field(default_factory=list)
    sync_status: str = "pending"


from .index_sync import SyncResult  # noqa: E402

SyncNodeResponse.model_rebuild()
