from __future__ import annotations

import json
from contextlib import contextmanager
import fcntl
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel

from .chunking import ChunkConfig, ChunkingStrategy, chunk_text
from .vectorstore import SearchResult, add_documents, delete_by_ids, search_similar


class WorldDocument(BaseModel):
    id: str
    project_id: str
    title: str
    category: str
    content: str
    chunks: list[str] = []
    created_at: datetime
    updated_at: datetime


class WorldKnowledgeBase(BaseModel):
    project_id: str
    documents: list[WorldDocument]
    total_chunks: int
    total_characters: int


def _default_chunking_config() -> ChunkConfig:
    return ChunkConfig(strategy=ChunkingStrategy.PARAGRAPH)


def _now() -> datetime:
    return datetime.utcnow()


def _storage_dir() -> Path:
    directory = Path(__file__).resolve().parent.parent / "data" / "world_knowledge"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _project_file(project_id: str) -> Path:
    return _storage_dir() / f"{project_id}.json"


@contextmanager
def _file_lock(path: Path):
    lock_path = path.with_suffix(f"{path.suffix}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a", encoding="utf-8") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def _load_project_documents(project_id: str) -> list[WorldDocument]:
    path = _project_file(project_id)
    with _file_lock(path):
        if not path.exists():
            return []
        data = json.loads(path.read_text(encoding="utf-8"))
        return [WorldDocument.model_validate(item) for item in data]


def _save_project_documents(project_id: str, documents: list[WorldDocument]) -> None:
    path = _project_file(project_id)
    payload = [doc.model_dump(mode="json") for doc in documents]
    with _file_lock(path):
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )


def _find_document(doc_id: str) -> tuple[str, list[WorldDocument], WorldDocument] | None:
    for path in _storage_dir().glob("*.json"):
        project_id = path.stem
        documents = _load_project_documents(project_id)
        for document in documents:
            if document.id == doc_id:
                return project_id, documents, document
    return None


def _build_chunk_metadata(
    project_id: str,
    doc: WorldDocument,
    chunk_index: int,
    start_index: int,
    end_index: int,
) -> dict:
    return {
        "project_id": project_id,
        "document_id": doc.id,
        "title": doc.title,
        "category": doc.category,
        "chunk_index": chunk_index,
        "start_index": start_index,
        "end_index": end_index,
    }


def _split_markdown_sections(markdown_content: str) -> list[tuple[str, str]]:
    if not markdown_content.strip():
        return []

    lines = markdown_content.splitlines()
    sections: list[tuple[str, list[str]]] = []
    current_title = "未命名世界观"
    current_lines: list[str] = []

    for line in lines:
        if line.startswith("# "):
            if current_lines:
                sections.append((current_title, current_lines))
                current_lines = []
            current_title = line[2:].strip() or "未命名世界观"
        else:
            current_lines.append(line)

    sections.append((current_title, current_lines))
    return [(title, "\n".join(body).strip()) for title, body in sections]


class WorldKnowledgeManager:
    async def add_document(
        self,
        project_id: str,
        title: str,
        category: str,
        content: str,
        chunking_config: ChunkConfig | None = None,
    ) -> WorldDocument:
        config = chunking_config or _default_chunking_config()
        document = WorldDocument(
            id=str(uuid4()),
            project_id=project_id,
            title=title,
            category=category,
            content=content,
            chunks=[],
            created_at=_now(),
            updated_at=_now(),
        )

        chunks = chunk_text(
            content,
            config,
            source_metadata={"project_id": project_id, "document_id": document.id},
        )
        if chunks:
            document.chunks = [chunk.id for chunk in chunks]
            await add_documents(
                collection_name="world_knowledge",
                documents=[chunk.content for chunk in chunks],
                metadatas=[
                    _build_chunk_metadata(
                        project_id,
                        document,
                        index,
                        chunk.start_index,
                        chunk.end_index,
                    )
                    for index, chunk in enumerate(chunks)
                ],
                ids=[chunk.id for chunk in chunks],
            )

        documents = _load_project_documents(project_id)
        documents.append(document)
        _save_project_documents(project_id, documents)
        return document

    async def update_document(
        self,
        doc_id: str,
        content: str,
        chunking_config: ChunkConfig | None = None,
    ) -> WorldDocument:
        found = _find_document(doc_id)
        if not found:
            raise ValueError("Document not found")
        project_id, documents, document = found

        if document.chunks:
            await delete_by_ids("world_knowledge", document.chunks)

        config = chunking_config or _default_chunking_config()
        chunks = chunk_text(
            content,
            config,
            source_metadata={"project_id": project_id, "document_id": document.id},
        )

        document.content = content
        document.updated_at = _now()
        document.chunks = [chunk.id for chunk in chunks]

        if chunks:
            await add_documents(
                collection_name="world_knowledge",
                documents=[chunk.content for chunk in chunks],
                metadatas=[
                    _build_chunk_metadata(
                        project_id,
                        document,
                        index,
                        chunk.start_index,
                        chunk.end_index,
                    )
                    for index, chunk in enumerate(chunks)
                ],
                ids=[chunk.id for chunk in chunks],
            )

        for index, item in enumerate(documents):
            if item.id == doc_id:
                documents[index] = document
                break
        _save_project_documents(project_id, documents)
        return document

    async def delete_document(self, doc_id: str) -> None:
        found = _find_document(doc_id)
        if not found:
            return
        project_id, documents, document = found
        if document.chunks:
            await delete_by_ids("world_knowledge", document.chunks)
        documents = [item for item in documents if item.id != doc_id]
        _save_project_documents(project_id, documents)

    async def search_knowledge(
        self,
        project_id: str,
        query: str,
        categories: list[str] | None = None,
        top_k: int = 10,
    ) -> list[SearchResult]:
        filter_dict: dict | None
        if categories:
            filter_dict = {
                "$and": [
                    {"project_id": project_id},
                    {"category": {"$in": categories}},
                ]
            }
        else:
            filter_dict = {"project_id": project_id}
        return await search_similar(
            collection_name="world_knowledge",
            query=query,
            top_k=top_k,
            filter_dict=filter_dict,
        )

    async def get_knowledge_base(self, project_id: str) -> WorldKnowledgeBase:
        documents = _load_project_documents(project_id)
        total_chunks = sum(len(doc.chunks) for doc in documents)
        total_characters = sum(len(doc.content) for doc in documents)
        return WorldKnowledgeBase(
            project_id=project_id,
            documents=documents,
            total_chunks=total_chunks,
            total_characters=total_characters,
        )

    async def get_document(
        self,
        project_id: str,
        doc_id: str,
    ) -> WorldDocument | None:
        documents = _load_project_documents(project_id)
        for document in documents:
            if document.id == doc_id:
                return document
        return None

    async def update_document_in_project(
        self,
        project_id: str,
        doc_id: str,
        content: str,
        chunking_config: ChunkConfig | None = None,
    ) -> WorldDocument:
        documents = _load_project_documents(project_id)
        document = next((item for item in documents if item.id == doc_id), None)
        if document is None:
            raise ValueError("Document not found")

        if document.chunks:
            await delete_by_ids("world_knowledge", document.chunks)

        config = chunking_config or _default_chunking_config()
        chunks = chunk_text(
            content,
            config,
            source_metadata={"project_id": project_id, "document_id": document.id},
        )

        document.content = content
        document.updated_at = _now()
        document.chunks = [chunk.id for chunk in chunks]

        if chunks:
            await add_documents(
                collection_name="world_knowledge",
                documents=[chunk.content for chunk in chunks],
                metadatas=[
                    _build_chunk_metadata(
                        project_id,
                        document,
                        index,
                        chunk.start_index,
                        chunk.end_index,
                    )
                    for index, chunk in enumerate(chunks)
                ],
                ids=[chunk.id for chunk in chunks],
            )

        for index, item in enumerate(documents):
            if item.id == doc_id:
                documents[index] = document
                break
        _save_project_documents(project_id, documents)
        return document

    async def delete_document_in_project(
        self,
        project_id: str,
        doc_id: str,
    ) -> None:
        documents = _load_project_documents(project_id)
        document = next((item for item in documents if item.id == doc_id), None)
        if document is None:
            return
        if document.chunks:
            await delete_by_ids("world_knowledge", document.chunks)
        documents = [item for item in documents if item.id != doc_id]
        _save_project_documents(project_id, documents)

    async def import_from_markdown(
        self,
        project_id: str,
        markdown_content: str,
    ) -> list[WorldDocument]:
        sections = _split_markdown_sections(markdown_content)
        if not sections:
            return []

        documents: list[WorldDocument] = []
        for title, content in sections:
            if not content:
                continue
            document = await self.add_document(
                project_id=project_id,
                title=title,
                category="general",
                content=content,
            )
            documents.append(document)
        return documents
