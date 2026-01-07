import logging
import time

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .graph import run_drafting_workflow, run_sync_workflow
from .models import CreateOutlineRequest, HealthResponse, StoryProject, SyncNodeRequest

PROJECT_STORE: dict[str, StoryProject] = {}

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
def create_outline(payload: CreateOutlineRequest):
    project = run_drafting_workflow(payload)
    PROJECT_STORE[project.id] = project
    return project


@app.post(
    "/api/sync_node",
    response_model=StoryProject,
    status_code=status.HTTP_200_OK,
)
def sync_node(payload: SyncNodeRequest):
    project = PROJECT_STORE.get(payload.project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    updated_project = run_sync_workflow(project, payload.node)
    PROJECT_STORE[updated_project.id] = updated_project
    return updated_project


@app.get(
    "/api/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
)
def health():
    return {"status": "ok", "version": "0.1.0"}
