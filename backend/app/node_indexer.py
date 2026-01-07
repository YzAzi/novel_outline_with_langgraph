from __future__ import annotations

from typing import Iterable

from .crud import get_project
from .database import AsyncSessionLocal
from .models import StoryNode, StoryProject
from .vectorstore import add_documents, delete_by_ids, search_similar


def _doc_id(project_id: str, node_id: str) -> str:
    return f"{project_id}:{node_id}"


def _node_text(node: StoryNode) -> str:
    parts = [node.title.strip(), node.content.strip()]
    return "\n\n".join(part for part in parts if part)


def _node_metadata(project_id: str, node: StoryNode) -> dict:
    return {
        "project_id": project_id,
        "node_id": node.id,
        "timeline_order": node.timeline_order,
        "location_tag": node.location_tag,
        "characters": node.characters,
    }


async def _load_project(project_id: str) -> StoryProject | None:
    async with AsyncSessionLocal() as session:
        return await get_project(session, project_id)


class NodeIndexer:
    async def index_project(self, project: StoryProject) -> int:
        if not project.nodes:
            return 0

        documents = [_node_text(node) for node in project.nodes]
        metadatas = [_node_metadata(project.id, node) for node in project.nodes]
        ids = [_doc_id(project.id, node.id) for node in project.nodes]
        await add_documents("story_nodes", documents, metadatas, ids)
        return len(project.nodes)

    async def index_node(self, project_id: str, node: StoryNode) -> None:
        await delete_by_ids("story_nodes", [_doc_id(project_id, node.id)])
        await add_documents(
            "story_nodes",
            [_node_text(node)],
            [_node_metadata(project_id, node)],
            [_doc_id(project_id, node.id)],
        )

    async def remove_node(self, project_id: str, node_id: str) -> None:
        await delete_by_ids("story_nodes", [_doc_id(project_id, node_id)])

    async def search_related_nodes(
        self,
        project_id: str,
        query: str,
        exclude_node_id: str | None = None,
        top_k: int = 10,
    ) -> list[StoryNode]:
        project = await _load_project(project_id)
        if not project:
            return []

        results = await search_similar(
            "story_nodes",
            query=query,
            top_k=top_k,
            filter_dict={"project_id": project_id},
        )
        nodes_by_id = {node.id: node for node in project.nodes}
        ordered: list[StoryNode] = []
        for result in results:
            node_id = result.metadata.get("node_id")
            if not node_id or node_id == exclude_node_id:
                continue
            node = nodes_by_id.get(node_id)
            if node:
                ordered.append(node)
        return ordered

    async def search_by_character(
        self,
        project_id: str,
        character_id: str,
    ) -> list[StoryNode]:
        project = await _load_project(project_id)
        if not project:
            return []
        return [
            node for node in project.nodes if character_id in (node.characters or [])
        ]

    async def search_by_timeline_range(
        self,
        project_id: str,
        start: float,
        end: float,
    ) -> list[StoryNode]:
        project = await _load_project(project_id)
        if not project:
            return []
        return [
            node
            for node in project.nodes
            if start <= node.timeline_order <= end
        ]
