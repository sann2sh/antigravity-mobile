import os
import secrets
import socket
import subprocess
import sys
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from fs_manager import FilesystemManager
from conv_manager import ConversationManager
from agent_runner import AgentRunner
from pty_terminal import PTYManager
from hub_client import HubClient
import push_manager

MOBILETERMINAL_TOKEN = os.environ.get("MOBILETERMINAL_TOKEN", "").strip()


@asynccontextmanager
async def lifespan(app: FastAPI):
    push_manager.start_watcher(hub_client, conv_manager)
    try:
        yield
    finally:
        await push_manager.stop_watcher()


app = FastAPI(title="Antigravity Mobile Companion", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _extract_http_token(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return request.query_params.get("token", "").strip()


def _is_ws_authorized(websocket: WebSocket) -> bool:
    if not MOBILETERMINAL_TOKEN:
        return True
    token = websocket.query_params.get("token", "").strip()
    return bool(token) and secrets.compare_digest(token, MOBILETERMINAL_TOKEN)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method != "OPTIONS" and MOBILETERMINAL_TOKEN and request.url.path.startswith("/api/"):
        if request.url.path == "/api/health":
            return await call_next(request)
        token = _extract_http_token(request)
        if not token or not secrets.compare_digest(token, MOBILETERMINAL_TOKEN):
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


_env_workspace = os.environ.get("DEFAULT_WORKSPACE", "").strip()
_default_workspace = None
if _env_workspace:
    _expanded = os.path.expanduser(_env_workspace)
    if os.path.isdir(_expanded):
        _default_workspace = os.path.abspath(_expanded)

fs_manager = FilesystemManager(default_workspace=_default_workspace)
conv_manager = ConversationManager()
agent_runner = AgentRunner()
pty_manager = PTYManager()
hub_client = HubClient()

# Models
class WorkspaceRequest(BaseModel):
    path: str

class QuickCommandRequest(BaseModel):
    command: str
    cwd: Optional[str] = None

class CreateTerminalSessionRequest(BaseModel):
    cwd: Optional[str] = None
    name: Optional[str] = None

class FileWriteRequest(BaseModel):
    path: str
    content: str

class CreateEntryRequest(BaseModel):
    path: str
    is_dir: bool = False

class AgentSendRequest(BaseModel):
    conversation_id: Optional[str] = None
    prompt: str
    workspace: Optional[str] = None
    model: Optional[str] = None

class AgentStopRequest(BaseModel):
    conversation_id: str

class PermissionRequest(BaseModel):
    conversation_id: str
    trajectory_id: str
    step_index: int
    allow: bool
    scope: str = "PERMISSION_SCOPE_ONCE"

class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str

class PushSubscribeRequest(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys
    expirationTime: Optional[float] = None

class PushUnsubscribeRequest(BaseModel):
    endpoint: str

def get_tailscale_ip() -> Optional[str]:
    try:
        res = subprocess.run(["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=1)
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return None

# Health & Auth
@app.get("/api/health")
def health_check():
    return {"status": "ok", "auth_required": bool(MOBILETERMINAL_TOKEN)}

@app.get("/api/auth/check")
def auth_check():
    return {"authenticated": True, "auth_required": bool(MOBILETERMINAL_TOKEN)}

# System
@app.get("/api/system/status")
def system_status():
    return {
        "hostname": socket.gethostname(),
        "tailscale_ip": get_tailscale_ip(),
        "active_workspace": fs_manager.get_workspace(),
        "user": os.environ.get("USER", "user"),
        "hub_connected": hub_client.get_active_hub() is not None,
    }

# Filesystem
@app.get("/api/fs/current-workspace")
def get_current_workspace():
    return {"workspace": fs_manager.get_workspace()}

@app.post("/api/fs/set-workspace")
def set_workspace(req: WorkspaceRequest):
    success = fs_manager.set_workspace(req.path)
    if not success:
        raise HTTPException(status_code=400, detail=f"Directory invalid or not found: {req.path}")
    return {"workspace": fs_manager.get_workspace(), "success": True}

@app.get("/api/fs/list")
def list_directory(path: Optional[str] = Query(None)):
    try:
        return fs_manager.list_dir(path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/fs/read")
def read_file_content(path: str = Query(...), max_lines: int = Query(1000)):
    try:
        return fs_manager.read_file(path, max_lines)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/fs/write")
def write_file_content(req: FileWriteRequest):
    try:
        return fs_manager.write_file(req.path, req.content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/fs/create")
def create_fs_entry(req: CreateEntryRequest):
    try:
        return fs_manager.create_entry(req.path, req.is_dir)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Conversations (Live Hub + SQLite history)
@app.get("/api/conversations")
async def list_conversations(limit: int = Query(50), search: Optional[str] = Query(None)):
    live_convs = []
    seen_ids = set()
    try:
        if not search:
            live_convs = await hub_client.list_conversations()
            seen_ids = {c["conversation_id"] for c in live_convs}
    except Exception:
        pass

    db_convs = conv_manager.list_conversations(limit, search)
    merged = list(live_convs)
    for c in db_convs:
        if c["conversation_id"] not in seen_ids:
            merged.append(c)
    return merged[:limit]

@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    artifacts = []
    try:
        db_detail = conv_manager.get_conversation_details(conv_id)
        artifacts = db_detail.get("artifacts", [])
    except Exception:
        db_detail = None

    try:
        live_detail = await hub_client.get_conversation_steps(conv_id, limit=80)
        if live_detail and live_detail.get("steps"):
            live_detail["artifacts"] = artifacts
            return live_detail
    except Exception:
        pass

    if db_detail:
        return db_detail
    raise HTTPException(status_code=404, detail="Conversation not found")

@app.get("/api/conversations/{conv_id}/artifacts/{artifact_name}")
def get_artifact(conv_id: str, artifact_name: str):
    try:
        content = conv_manager.read_artifact(conv_id, artifact_name)
        return {"name": artifact_name, "content": content}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Artifact not found")

# Direct Live Hub Agent Actions (Instant & synced with laptop IDE)
@app.get("/api/agent/models")
async def get_agent_models():
    try:
        return await hub_client.get_models()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agent/send")
async def send_agent_prompt(req: AgentSendRequest):
    try:
        ws = req.workspace or fs_manager.get_workspace()
        res = await hub_client.send_message(req.conversation_id, req.prompt, ws, req.model)
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agent/stop")
async def stop_agent(req: AgentStopRequest):
    try:
        res = await hub_client.stop_agent(req.conversation_id)
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agent/permission")
async def handle_agent_permission(req: PermissionRequest):
    try:
        res = await hub_client.handle_interaction(
            cascade_id=req.conversation_id,
            trajectory_id=req.trajectory_id,
            step_index=req.step_index,
            allow=req.allow,
            scope=req.scope,
        )
        return {"success": True, "result": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Web Push Notifications
@app.get("/api/push/vapid-public-key")
def get_vapid_public_key():
    return {"public_key": push_manager.get_public_key()}

@app.post("/api/push/subscribe")
def subscribe_push(req: PushSubscribeRequest):
    try:
        sub = push_manager.add_subscription(req.model_dump())
        return {"success": True, "subscription": sub}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/push/unsubscribe")
def unsubscribe_push(req: PushUnsubscribeRequest):
    removed = push_manager.remove_subscription(req.endpoint)
    return {"success": True, "removed": removed}

@app.post("/api/push/test")
async def test_push_notification():
    sent = await push_manager.send_push_to_all({
        "title": "Antigravity Mobile",
        "body": "Push notifications are active.",
    })
    return {"sent": sent}

# Quick command runner
@app.post("/api/terminal/quick-run")
async def quick_run_command(req: QuickCommandRequest):
    cwd = req.cwd or fs_manager.get_workspace()
    result = await agent_runner.execute_quick_command(req.command, cwd)
    return result

# Persistent PTY Terminal Sessions
@app.get("/api/terminal/sessions")
def list_terminal_sessions():
    return {"sessions": pty_manager.list_sessions()}

@app.post("/api/terminal/sessions")
async def create_terminal_session(req: Optional[CreateTerminalSessionRequest] = None):
    cwd = (req.cwd if req and req.cwd else None) or fs_manager.get_workspace()
    name = req.name if req else None
    session = pty_manager.create_session(cwd=cwd, name=name)
    return session.to_dict()

@app.delete("/api/terminal/sessions/{session_id}")
def delete_terminal_session(session_id: str):
    deleted = pty_manager.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Terminal session not found")
    return {"success": True}

# WebSocket for interactive PTY Terminal
@app.websocket("/ws/terminal")
async def websocket_terminal(websocket: WebSocket, rows: int = 24, cols: int = 80):
    if not _is_ws_authorized(websocket):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    session_id = websocket.query_params.get("session_id")
    cwd = websocket.query_params.get("cwd") or fs_manager.get_workspace()
    session = pty_manager.get_or_create_default(
        session_id=session_id,
        cwd=cwd,
        rows=rows,
        cols=cols,
    )
    await pty_manager.attach_websocket(session.id, websocket)

# WebSocket for Agent Streaming (CLI fallback)
@app.websocket("/ws/agent")
async def websocket_agent(websocket: WebSocket):
    if not _is_ws_authorized(websocket):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("type")
            if action == "prompt":
                prompt_text = data.get("prompt", "")
                conv_id = data.get("conversation_id")
                workspace = data.get("workspace") or fs_manager.get_workspace()
                mode = data.get("mode", "auto")
                skip_perms = data.get("skip_permissions", False)

                async for event in agent_runner.run_prompt_stream(
                    prompt=prompt_text,
                    conversation_id=conv_id,
                    workspace=workspace,
                    mode=mode,
                    skip_permissions=skip_perms
                ):
                    await websocket.send_json(event)

                await websocket.send_json({"event": "stream_end"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"event": "error", "message": str(e)})
        except Exception:
            pass

# Serve built frontend if exists
dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(dist_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(dist_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_dir, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
