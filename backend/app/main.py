import logging
import time

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .crud import create_project, delete_project, get_project, list_projects, update_project
from .database import get_session, init_db
from .graph import run_drafting_workflow, run_sync_workflow
from .models import (
    CreateOutlineRequest,
    HealthResponse,
    ProjectSummary,
    StoryProject,
    SyncNodeRequest,
)

logger = logging.getLogger(__name__)

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
    project = await run_in_threadpool(run_drafting_workflow, payload)
    await create_project(session, project)
    return project


@app.post(
    "/api/sync_node",
    response_model=StoryProject,
    status_code=status.HTTP_200_OK,
)
async def sync_node(
    payload: SyncNodeRequest,
    session: AsyncSession = Depends(get_session),
):
    project = await get_project(session, payload.project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    updated_project = await run_in_threadpool(run_sync_workflow, project, payload.node)
    await update_project(session, updated_project.id, updated_project)
    return updated_project


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
    deleted = await delete_project(session, project_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return {"deleted": True}


@app.get(
    "/api/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
)
def health():
    return {"status": "ok", "version": "0.1.0"}
