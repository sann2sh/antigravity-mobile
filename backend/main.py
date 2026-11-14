import os
import socket
import subprocess
from typing import Optional, Dict, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from fs_manager import FilesystemManager
from conv_manager import ConversationManager
from agent_runner import AgentRunner
from pty_terminal import PTYSession

app = FastAPI(title="Antigravity Mobile Companion", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

fs_manager = FilesystemManager()
conv_manager = ConversationManager()
agent_runner = AgentRunner()

# Models
class WorkspaceRequest(BaseModel):
    path: str

class QuickCommandRequest(BaseModel):
    command: str
    cwd: Optional[str] = None

class FileWriteRequest(BaseModel):
    path: str
    content: str

def get_tailscale_ip() -> Optional[str]:
    try:
        res = subprocess.run(["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=1)
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return None

# System
@app.get("/api/system/status")
def system_status():
    return {
        "hostname": socket.gethostname(),
        "tailscale_ip": get_tailscale_ip(),
        "active_workspace": fs_manager.get_workspace(),
        "user": os.environ.get("USER", "user"),
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

# Conversations
@app.get("/api/conversations")
def list_conversations(limit: int = Query(50), search: Optional[str] = Query(None)):
    return conv_manager.list_conversations(limit, search)

@app.get("/api/conversations/{conv_id}")
def get_conversation(conv_id: str):
    try:
        return conv_manager.get_conversation_details(conv_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/conversations/{conv_id}/artifacts/{artifact_name}")
def get_artifact(conv_id: str, artifact_name: str):
    try:
        content = conv_manager.read_artifact(conv_id, artifact_name)
        return {"name": artifact_name, "content": content}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Artifact not found")

# Quick command runner
@app.post("/api/terminal/quick-run")
async def quick_run_command(req: QuickCommandRequest):
    cwd = req.cwd or fs_manager.get_workspace()
    result = await agent_runner.execute_quick_command(req.command, cwd)
    return result

# WebSocket for interactive PTY Terminal
@app.websocket("/ws/terminal")
async def websocket_terminal(websocket: WebSocket, rows: int = 24, cols: int = 80):
    await websocket.accept()
    session = PTYSession(websocket, fs_manager.get_workspace(), rows=rows, cols=cols)
    await session.start()

# WebSocket for Agent Streaming
@app.websocket("/ws/agent")
async def websocket_agent(websocket: WebSocket):
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
