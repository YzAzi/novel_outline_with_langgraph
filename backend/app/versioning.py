from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from .knowledge_graph import KnowledgeGraph
from .models import StoryProject
from .world_knowledge import WorldDocument


class SnapshotType(str, Enum):
    AUTO = "auto"
    MANUAL = "manual"
    MILESTONE = "milestone"
    PRE_SYNC = "pre_sync"


class IndexSnapshot(BaseModel):
    version: int
    snapshot_type: SnapshotType
    name: str | None = None
    description: str | None = None
    story_project: StoryProject
    knowledge_graph: KnowledgeGraph
    world_documents: list[WorldDocument] = Field(default_factory=list)
    node_count: int
    entity_count: int
    created_at: datetime = Field(default_factory=datetime.utcnow)


class VersionDiff(BaseModel):
    nodes_added: list[str] = Field(default_factory=list)
    nodes_modified: list[str] = Field(default_factory=list)
    nodes_deleted: list[str] = Field(default_factory=list)
    entities_added: list[str] = Field(default_factory=list)
    entities_deleted: list[str] = Field(default_factory=list)
    relations_added: list[str] = Field(default_factory=list)
    relations_deleted: list[str] = Field(default_factory=list)
    words_added: int = 0
    words_removed: int = 0


@dataclass
class VersioningConfig:
    auto_snapshot_interval: int = 300
    major_change_threshold: int = 500
    max_auto_snapshots: int = 50
    compress_old_snapshots: bool = False
