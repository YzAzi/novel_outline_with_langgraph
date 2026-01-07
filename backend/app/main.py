import asyncio
import logging
import time
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .crud import create_project, delete_project, get_project, list_projects, update_project
from .database import get_session, init_db
from .conflict_detector import ConflictDetector, SyncNodeResponse
from .graph import run_drafting_workflow, run_sync_workflow
from .knowledge_graph import load_graph, save_graph
from .models import (
    CreateOutlineRequest,
    HealthResponse,
    KnowledgeDocumentRequest,
    KnowledgeImportRequest,
    KnowledgeSearchRequest,
    KnowledgeUpdateRequest,
    ProjectStatsResponse,
    ProjectSummary,
    StoryProject,
    SyncNodeRequest,
    VersionCreateRequest,
    VersionUpdateRequest,
)
from .index_sync import SyncResult
from .node_indexer import NodeIndexer
from .sync_strategy import DEFAULT_SYNC_CONFIG, SyncMode, SyncQueue, build_default_sync_manager
from .vectorstore import SearchResult
from .world_knowledge import WorldKnowledgeBase, WorldDocument, WorldKnowledgeManager
from .graph_editor import GraphEditor
from .notifier import EventNotifier
from .websocket_manager import ConnectionManager, WSMessageType
from .version_manager import VersionManager
from .versioning import SnapshotType, VersionDiff, IndexSnapshot

logger = logging.getLogger(__name__)

index_sync_manager = build_default_sync_manager()
sync_queue = SyncQueue(DEFAULT_SYNC_CONFIG, index_sync_manager=index_sync_manager)
conflict_detector = ConflictDetector()
world_knowledge_manager = WorldKnowledgeManager()
ws_manager = ConnectionManager()
notifier = EventNotifier(ws_manager)
version_manager = VersionManager()

app = FastAPI(
    title="Novel Outline Service",
    description="FastAPI service for drafting and syncing story outlines.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup() -> None:
    await init_db()
    asyncio.create_task(version_manager.auto_snapshot_loop())


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start_time) * 1000
    logger.info("%s %s %.2fms", request.method, request.url.path, duration_ms)
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": exc.__class__.__name__, "detail": str(exc)},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.__class__.__name__, "detail": str(exc.detail)},
    )


@app.post(
    "/api/create_outline",
    response_model=StoryProject,
    status_code=status.HTTP_200_OK,
)
async def create_outline(
    payload: CreateOutlineRequest,
    session: AsyncSession = Depends(get_session),
):
    if payload.base_project_id:
        base_project = await get_project(session, payload.base_project_id)
        if base_project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Base project not found",
            )
    project = await run_drafting_workflow(payload)
    await create_project(session, project)
    return project


@app.post(
    "/api/sync_node",
    response_model=SyncNodeResponse,
    status_code=status.HTTP_200_OK,
)
async def sync_node(
    payload: SyncNodeRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, payload.project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )

    await notifier.notify_sync_progress(
        payload.project_id, "started", {"node_id": payload.node.id}
    )

    old_node = next(
        (node for node in project.nodes if node.id == payload.node.id),
        None,
    )

    await version_manager.create_pre_sync_snapshot_if_needed(
        project=project,
        old_node=old_node,
        new_node=payload.node,
    )
    updated_project = await run_sync_workflow(project, payload.node)
    await update_project(session, updated_project.id, updated_project)

    updated_node = next(
        (node for node in updated_project.nodes if node.id == payload.node.id),
        payload.node,
    )

    await notifier.notify_node_updated(
        payload.project_id,
        updated_node.model_dump(),
        updated_by="user",
    )

    sync_result = SyncResult(success=True, vector_updated=False, graph_updated=False)

    async def sync_graph_background() -> None:
        nonlocal sync_result
        try:
            if DEFAULT_SYNC_CONFIG.graph_sync_mode == SyncMode.IMMEDIATE:
                current_graph = load_graph(payload.project_id)
                sync_result = await index_sync_manager.sync_node_update(
                    project_id=payload.project_id,
                    old_node=old_node,
                    new_node=updated_node,
                    current_graph=current_graph,
                )
                save_graph(current_graph)
                await notifier.notify_graph_updated(
                    payload.project_id, sync_result.model_dump()
                )
            else:
                if DEFAULT_SYNC_CONFIG.vector_sync_mode == SyncMode.IMMEDIATE:
                    await index_sync_manager.node_indexer.index_node(
                        payload.project_id, updated_node
                    )
                    sync_result.vector_updated = True
                if DEFAULT_SYNC_CONFIG.graph_sync_mode in (
                    SyncMode.DEBOUNCED,
                    SyncMode.BATCH,
                ):
                    await sync_queue.enqueue(
                        payload.project_id,
                        updated_node,
                        old_node=old_node,
                    )
                    results = await sync_queue.process_ready()
                    if results:
                        await notifier.notify_graph_updated(
                            payload.project_id,
                            {"updates": [result.model_dump() for result in results]},
                        )
            await notifier.notify_sync_progress(
                payload.project_id, "completed", {"node_id": payload.node.id}
            )
        except Exception as exc:
            await notifier.notify_sync_progress(
                payload.project_id,
                "failed",
                {"error": str(exc), "node_id": payload.node.id},
            )

    def schedule_background_task() -> None:
        asyncio.create_task(sync_graph_background())

    background_tasks.add_task(schedule_background_task)
    graph_snapshot = load_graph(payload.project_id)
    conflicts = await conflict_detector.detect_conflicts(
        project=updated_project,
        graph=graph_snapshot,
        modified_node=updated_node,
    )
    if conflicts:
        await notifier.notify_conflict_detected(
            payload.project_id, [conflict.model_dump() for conflict in conflicts]
        )
    return SyncNodeResponse(
        project=updated_project,
        sync_result=sync_result,
        conflicts=conflicts,
    )


@app.get(
    "/api/projects",
    response_model=list[ProjectSummary],
    status_code=status.HTTP_200_OK,
)
async def list_project_records(
    session: AsyncSession = Depends(get_session),
):
    return await list_projects(session)


@app.get(
    "/api/projects/{project_id}",
    response_model=StoryProject,
    status_code=status.HTTP_200_OK,
)
async def get_project_record(
    project_id: str,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return project


@app.delete(
    "/api/projects/{project_id}",
    status_code=status.HTTP_200_OK,
)
async def delete_project_record(
    project_id: str,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    deleted = await delete_project(session, project_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    if project:
        node_indexer = NodeIndexer()
        for node in project.nodes:
            await node_indexer.remove_node(project_id, node.id)
    return {"deleted": True}


@app.post(
    "/api/projects/{project_id}/knowledge",
    response_model=WorldDocument,
    status_code=status.HTTP_200_OK,
)
async def create_world_document(
    project_id: str,
    payload: KnowledgeDocumentRequest,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return await world_knowledge_manager.add_document(
        project_id=project_id,
        title=payload.title,
        category=payload.category,
        content=payload.content,
    )


@app.get(
    "/api/projects/{project_id}/knowledge",
    response_model=WorldKnowledgeBase,
    status_code=status.HTTP_200_OK,
)
async def get_world_knowledge_base(
    project_id: str,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return await world_knowledge_manager.get_knowledge_base(project_id)


@app.get(
    "/api/projects/{project_id}/knowledge/{doc_id}",
    response_model=WorldDocument,
    status_code=status.HTTP_200_OK,
)
async def get_world_document(
    project_id: str,
    doc_id: str,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    document = await world_knowledge_manager.get_document(project_id, doc_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )
    return document


@app.put(
    "/api/projects/{project_id}/knowledge/{doc_id}",
    response_model=WorldDocument,
    status_code=status.HTTP_200_OK,
)
async def update_world_document(
    project_id: str,
    doc_id: str,
    payload: KnowledgeUpdateRequest,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    try:
        return await world_knowledge_manager.update_document_in_project(
            project_id=project_id,
            doc_id=doc_id,
            content=payload.content,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )


@app.delete(
    "/api/projects/{project_id}/knowledge/{doc_id}",
    status_code=status.HTTP_200_OK,
)
async def delete_world_document(
    project_id: str,
    doc_id: str,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    await world_knowledge_manager.delete_document_in_project(project_id, doc_id)
    return {"deleted": True}


@app.post(
    "/api/projects/{project_id}/knowledge/import",
    response_model=list[WorldDocument],
    status_code=status.HTTP_200_OK,
)
async def import_world_knowledge(
    project_id: str,
    payload: KnowledgeImportRequest,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return await world_knowledge_manager.import_from_markdown(
        project_id=project_id,
        markdown_content=payload.markdown_content,
    )


@app.post(
    "/api/projects/{project_id}/knowledge/search",
    response_model=list[SearchResult],
    status_code=status.HTTP_200_OK,
)
async def search_world_knowledge(
    project_id: str,
    payload: KnowledgeSearchRequest,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return await world_knowledge_manager.search_knowledge(
        project_id=project_id,
        query=payload.query,
        categories=payload.categories,
        top_k=payload.top_k or 10,
    )


@app.post(
    "/api/projects/{project_id}/knowledge/upload",
    response_model=list[WorldDocument],
    status_code=status.HTTP_200_OK,
)
async def upload_world_knowledge(
    project_id: str,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )

    filename = file.filename or ""
    if not (filename.endswith(".md") or filename.endswith(".txt")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type"
        )

    content = (await file.read()).decode("utf-8")
    if filename.endswith(".md"):
        documents = await world_knowledge_manager.import_from_markdown(
            project_id=project_id,
            markdown_content=content,
        )
    else:
        title = Path(filename).stem or "未命名世界观"
        document = await world_knowledge_manager.add_document(
            project_id=project_id,
            title=title,
            category="general",
            content=content,
        )
        documents = [document]
    return documents


@app.get(
    "/api/projects/{project_id}/stats",
    response_model=ProjectStatsResponse,
    status_code=status.HTTP_200_OK,
)
async def get_project_stats(
    project_id: str,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    knowledge_base = await world_knowledge_manager.get_knowledge_base(project_id)
    graph_snapshot = load_graph(project_id)
    return ProjectStatsResponse(
        total_nodes=len(project.nodes),
        total_characters=len(project.characters),
        total_knowledge_docs=len(knowledge_base.documents),
        total_words=knowledge_base.total_characters,
        graph_entities=len(graph_snapshot.entities),
        graph_relations=len(graph_snapshot.relations),
    )


@app.get(
    "/api/projects/{project_id}/versions",
    response_model=list[dict],
    status_code=status.HTTP_200_OK,
)
async def list_project_versions(
    project_id: str,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return await version_manager.list_versions(project_id)


@app.get(
    "/api/projects/{project_id}/versions/{version}",
    response_model=IndexSnapshot,
    status_code=status.HTTP_200_OK,
)
async def get_project_version(
    project_id: str,
    version: int,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    try:
        snapshot = await version_manager.load_snapshot(project_id, version)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    return snapshot


@app.get(
    "/api/projects/{project_id}/versions/{from_ver}/diff/{to_ver}",
    response_model=VersionDiff,
    status_code=status.HTTP_200_OK,
)
async def compare_project_versions(
    project_id: str,
    from_ver: int,
    to_ver: int,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return await version_manager.compare_versions(project_id, from_ver, to_ver)


@app.post(
    "/api/projects/{project_id}/versions",
    response_model=IndexSnapshot,
    status_code=status.HTTP_200_OK,
)
async def create_project_version(
    project_id: str,
    payload: VersionCreateRequest,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    snapshot_type = SnapshotType.MANUAL
    if payload.type:
        try:
            snapshot_type = SnapshotType(payload.type)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid snapshot type")
    graph = load_graph(project_id)
    return await version_manager.create_snapshot(
        project=project,
        graph=graph,
        snapshot_type=snapshot_type,
        name=payload.name,
        description=payload.description,
    )


@app.post(
    "/api/projects/{project_id}/versions/{version}/restore",
    response_model=StoryProject,
    status_code=status.HTTP_200_OK,
)
async def restore_project_version(
    project_id: str,
    version: int,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    try:
        restored_project, restored_graph = await version_manager.restore_snapshot(project_id, version)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    await update_project(session, restored_project.id, restored_project)
    save_graph(restored_graph)
    return restored_project


@app.delete(
    "/api/projects/{project_id}/versions/{version}",
    status_code=status.HTTP_200_OK,
)
async def delete_project_version(
    project_id: str,
    version: int,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    try:
        await version_manager.delete_version(project_id, version)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {"deleted": True}


@app.put(
    "/api/projects/{project_id}/versions/{version}",
    response_model=IndexSnapshot,
    status_code=status.HTTP_200_OK,
)
async def update_project_version(
    project_id: str,
    version: int,
    payload: VersionUpdateRequest,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    snapshot_type = SnapshotType.MILESTONE if payload.promote_to_milestone else None
    try:
        snapshot = await version_manager.update_version_metadata(
            project_id=project_id,
            version=version,
            name=payload.name,
            snapshot_type=snapshot_type,
            description=payload.description,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    return snapshot


@app.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str):
    await ws_manager.connect(project_id, websocket)

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(30)
            try:
                await websocket.send_json({"type": WSMessageType.PING.value, "payload": {}})
            except Exception:
                break

    heartbeat_task = asyncio.create_task(heartbeat())

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")
            if message_type == WSMessageType.PONG.value:
                continue
            if message_type == WSMessageType.PING.value:
                await websocket.send_json({"type": WSMessageType.PONG.value, "payload": {}})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        heartbeat_task.cancel()
        ws_manager.disconnect(project_id, websocket)


@app.put(
    "/api/projects/{project_id}/graph/entities/{entity_id}",
    response_model=dict,
    status_code=status.HTTP_200_OK,
)
async def update_graph_entity(
    project_id: str,
    entity_id: str,
    payload: dict,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    graph = load_graph(project_id)
    editor = GraphEditor(graph)
    try:
        entity = await editor.update_entity(entity_id, payload)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found"
        )
    save_graph(graph)
    return entity.model_dump()


@app.delete(
    "/api/projects/{project_id}/graph/entities/{entity_id}",
    response_model=dict,
    status_code=status.HTTP_200_OK,
)
async def delete_graph_entity(
    project_id: str,
    entity_id: str,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    graph = load_graph(project_id)
    editor = GraphEditor(graph)
    try:
        stats = await editor.delete_entity(entity_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found"
        )
    save_graph(graph)
    return stats


@app.post(
    "/api/projects/{project_id}/graph/entities/{entity_id}/merge",
    response_model=dict,
    status_code=status.HTTP_200_OK,
)
async def merge_graph_entities(
    project_id: str,
    entity_id: str,
    payload: dict,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    target_id = payload.get("into_id")
    if not target_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing into_id",
        )
    graph = load_graph(project_id)
    editor = GraphEditor(graph)
    try:
        entity = await editor.merge_entities(entity_id, target_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        )
    save_graph(graph)
    return entity.model_dump()


@app.get(
    "/api/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
)
def health():
    return {"status": "ok", "version": "0.1.0"}
