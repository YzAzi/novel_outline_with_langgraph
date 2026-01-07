from __future__ import annotations

from collections import deque
from dataclasses import dataclass

from pydantic import BaseModel, Field

from .knowledge_graph import Entity, EntityType, KnowledgeGraph, Relation
from .models import StoryNode
from .node_indexer import NodeIndexer
from .world_knowledge import WorldKnowledgeManager


def _estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


def _node_summary(node: StoryNode) -> str:
    content = node.content.strip().replace("\n", " ")
    if len(content) > 120:
        content = f"{content[:117]}..."
    return f"{node.title}：{content}"


class RetrievalContext(BaseModel):
    relevant_nodes: list[StoryNode] = Field(default_factory=list)
    relevant_knowledge: list[str] = Field(default_factory=list)
    relevant_entities: list[Entity] = Field(default_factory=list)
    relevant_relations: list[Relation] = Field(default_factory=list)
    token_count: int = 0

    def to_prompt_text(self) -> str:
        nodes_text = "\n".join(
            f"- {node.id}: {_node_summary(node)}" for node in self.relevant_nodes
        )
        knowledge_text = "\n".join(
            f"- {snippet}" for snippet in self.relevant_knowledge
        )
        entities_text = "\n".join(
            f"- {entity.name} ({entity.type.value}): {entity.description}"
            for entity in self.relevant_entities
        )
        relations_text = "\n".join(
            f"- {relation.relation_name}: {relation.source_id} -> {relation.target_id}"
            for relation in self.relevant_relations
        )
        return (
            "【相关节点】\n"
            f"{nodes_text or '无'}\n\n"
            "【世界观知识】\n"
            f"{knowledge_text or '无'}\n\n"
            "【实体】\n"
            f"{entities_text or '无'}\n\n"
            "【关系】\n"
            f"{relations_text or '无'}"
        )


class CharacterContext(BaseModel):
    character: Entity
    relations: list[Relation] = Field(default_factory=list)
    related_characters: list[Entity] = Field(default_factory=list)
    appearances: list[StoryNode] = Field(default_factory=list)
    background_knowledge: list[str] = Field(default_factory=list)


class EventContext(BaseModel):
    related_nodes: list[StoryNode] = Field(default_factory=list)
    related_entities: list[Entity] = Field(default_factory=list)
    related_relations: list[Relation] = Field(default_factory=list)
    background_knowledge: list[str] = Field(default_factory=list)


@dataclass
class _RankedItem:
    score: int
    kind: str
    value: object


class GraphRetriever:
    def __init__(
        self,
        knowledge_graph: KnowledgeGraph,
        node_indexer: NodeIndexer,
        world_knowledge: WorldKnowledgeManager,
    ):
        self._graph = knowledge_graph
        self._node_indexer = node_indexer
        self._world_knowledge = world_knowledge

    async def retrieve_context(
        self,
        query: str,
        project_id: str,
        max_tokens: int = 4000,
    ) -> RetrievalContext:
        nodes = await self._node_indexer.search_related_nodes(
            project_id=project_id,
            query=query,
            top_k=10,
        )
        knowledge_hits = await self._world_knowledge.search_knowledge(
            project_id=project_id,
            query=query,
            top_k=10,
        )
        knowledge_texts = [result.content for result in knowledge_hits]

        entity_hits = self._match_entities(query)
        relation_hits = self._match_relations(entity_hits)
        relation_layers, entity_layers = self._expand_relations(entity_hits, depth=2)

        context = RetrievalContext(
            relevant_nodes=nodes,
            relevant_knowledge=knowledge_texts,
            relevant_entities=entity_hits + entity_layers,
            relevant_relations=relation_hits + relation_layers,
        )
        return self._truncate_context(
            context,
            max_tokens,
            direct_entity_ids={entity.id for entity in entity_hits},
            relation_layers=relation_layers,
            entity_layers=entity_layers,
        )

    async def get_character_context(
        self,
        character_id: str,
        depth: int = 2,
    ) -> CharacterContext:
        entity = self._find_entity(character_id)
        if not entity:
            raise ValueError("Character not found")

        related_relations, related_entities = self._traverse_relations(
            character_id, depth=depth
        )
        related_characters = [
            item
            for item in related_entities
            if item.type == EntityType.CHARACTER and item.id != character_id
        ]

        appearances = await self._node_indexer.search_by_character(
            project_id=self._graph.project_id,
            character_id=character_id,
        )
        background = await self._world_knowledge.search_knowledge(
            project_id=self._graph.project_id,
            query=entity.name,
            top_k=5,
        )
        return CharacterContext(
            character=entity,
            relations=related_relations,
            related_characters=related_characters,
            appearances=appearances,
            background_knowledge=[item.content for item in background],
        )

    async def get_event_context(
        self,
        event_description: str,
    ) -> EventContext:
        nodes = await self._node_indexer.search_related_nodes(
            project_id=self._graph.project_id,
            query=event_description,
            top_k=8,
        )
        knowledge_hits = await self._world_knowledge.search_knowledge(
            project_id=self._graph.project_id,
            query=event_description,
            top_k=6,
        )
        entities = self._match_entities(event_description)
        relations = self._match_relations(entities)
        return EventContext(
            related_nodes=nodes,
            related_entities=entities,
            related_relations=relations,
            background_knowledge=[item.content for item in knowledge_hits],
        )

    async def find_path(
        self,
        entity_a_id: str,
        entity_b_id: str,
    ) -> list[Relation]:
        if entity_a_id == entity_b_id:
            return []

        adjacency = self._build_adjacency()
        visited = {entity_a_id}
        queue = deque([(entity_a_id, [])])

        while queue:
            current, path = queue.popleft()
            for relation in adjacency.get(current, []):
                next_id = relation.target_id if relation.source_id == current else relation.source_id
                if next_id in visited:
                    continue
                next_path = [*path, relation]
                if next_id == entity_b_id:
                    return next_path
                visited.add(next_id)
                queue.append((next_id, next_path))
        return []

    def _find_entity(self, entity_id: str) -> Entity | None:
        for entity in self._graph.entities:
            if entity.id == entity_id:
                return entity
        return None

    def _match_entities(self, query: str) -> list[Entity]:
        query_lower = query.lower()
        results = []
        for entity in self._graph.entities:
            if entity.name.lower() in query_lower:
                results.append(entity)
                continue
            if any(alias.lower() in query_lower for alias in entity.aliases):
                results.append(entity)
        return results

    def _match_relations(self, entities: list[Entity]) -> list[Relation]:
        entity_ids = {entity.id for entity in entities}
        return [
            relation
            for relation in self._graph.relations
            if relation.source_id in entity_ids or relation.target_id in entity_ids
        ]

    def _expand_relations(
        self,
        entities: list[Entity],
        depth: int,
    ) -> tuple[list[Relation], list[Entity]]:
        adjacency = self._build_adjacency()
        entity_ids = {entity.id for entity in entities}
        visited = set(entity_ids)
        queue = deque([(entity_id, 0) for entity_id in entity_ids])
        relations: list[Relation] = []
        related_entities: list[Entity] = []

        while queue:
            current, level = queue.popleft()
            if level >= depth:
                continue
            for relation in adjacency.get(current, []):
                next_id = relation.target_id if relation.source_id == current else relation.source_id
                relations.append(relation)
                if next_id not in visited:
                    visited.add(next_id)
                    entity = self._find_entity(next_id)
                    if entity:
                        related_entities.append(entity)
                    queue.append((next_id, level + 1))

        direct_relations = self._match_relations(entities)
        relations = [rel for rel in relations if rel not in direct_relations]
        related_entities = [ent for ent in related_entities if ent not in entities]
        return relations, related_entities

    def _traverse_relations(
        self,
        root_id: str,
        depth: int,
    ) -> tuple[list[Relation], list[Entity]]:
        adjacency = self._build_adjacency()
        visited = {root_id}
        queue = deque([(root_id, 0)])
        relations: list[Relation] = []
        entities: list[Entity] = []

        while queue:
            current, level = queue.popleft()
            if level >= depth:
                continue
            for relation in adjacency.get(current, []):
                next_id = relation.target_id if relation.source_id == current else relation.source_id
                relations.append(relation)
                if next_id not in visited:
                    visited.add(next_id)
                    entity = self._find_entity(next_id)
                    if entity:
                        entities.append(entity)
                    queue.append((next_id, level + 1))
        return relations, entities

    def _build_adjacency(self) -> dict[str, list[Relation]]:
        adjacency: dict[str, list[Relation]] = {}
        for relation in self._graph.relations:
            adjacency.setdefault(relation.source_id, []).append(relation)
            adjacency.setdefault(relation.target_id, []).append(relation)
        return adjacency

    def _truncate_context(
        self,
        context: RetrievalContext,
        max_tokens: int,
        direct_entity_ids: set[str] | None = None,
        relation_layers: list[Relation] | None = None,
        entity_layers: list[Entity] | None = None,
    ) -> RetrievalContext:
        direct_entity_ids = direct_entity_ids or set()
        relation_layers = relation_layers or []
        entity_layers = entity_layers or []
        layer_entity_ids = {entity.id for entity in entity_layers}
        ranked: list[_RankedItem] = []
        for node in context.relevant_nodes:
            ranked.append(_RankedItem(3, "node", node))
        for knowledge in context.relevant_knowledge:
            ranked.append(_RankedItem(2, "knowledge", knowledge))
        for entity in context.relevant_entities:
            if entity.id in direct_entity_ids:
                score = 3
            elif entity.id in layer_entity_ids:
                score = 2
            else:
                score = 1
            ranked.append(_RankedItem(score, "entity", entity))
        for relation in context.relevant_relations:
            score = 2 if relation in relation_layers else 3
            ranked.append(_RankedItem(score, "relation", relation))

        ranked.sort(key=lambda item: item.score, reverse=True)

        nodes: list[StoryNode] = []
        knowledge: list[str] = []
        entities: list[Entity] = []
        relations: list[Relation] = []
        tokens = 0

        def add_item(item: _RankedItem) -> None:
            nonlocal tokens
            if item.kind == "node":
                text = _node_summary(item.value)
                cost = _estimate_tokens(text)
                if tokens + cost <= max_tokens:
                    nodes.append(item.value)
                    tokens += cost
            elif item.kind == "knowledge":
                cost = _estimate_tokens(item.value)
                if tokens + cost <= max_tokens:
                    knowledge.append(item.value)
                    tokens += cost
            elif item.kind == "entity":
                text = f"{item.value.name} {item.value.description}"
                cost = _estimate_tokens(text)
                if tokens + cost <= max_tokens:
                    entities.append(item.value)
                    tokens += cost
            elif item.kind == "relation":
                text = f"{item.value.relation_name} {item.value.description}"
                cost = _estimate_tokens(text)
                if tokens + cost <= max_tokens:
                    relations.append(item.value)
                    tokens += cost

        for item in ranked:
            add_item(item)
            if tokens >= max_tokens:
                break

        return RetrievalContext(
            relevant_nodes=nodes,
            relevant_knowledge=knowledge,
            relevant_entities=entities,
            relevant_relations=relations,
            token_count=tokens,
        )
