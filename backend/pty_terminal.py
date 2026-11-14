import os
import pty
import fcntl
import termios
import struct
import signal
import asyncio
import codecs
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import WebSocket, WebSocketDisconnect

MAX_BUFFER_CHARS = 65536  # ~64KB rolling output buffer


class PTYSession:
    def __init__(
        self,
        session_id: str,
        name: str,
        cwd: str,
        rows: int = 24,
        cols: int = 80,
    ):
        self.id = session_id
        self.name = name
        self.cwd = cwd
        self.rows = rows
        self.cols = cols
        self.created_at = datetime.now(timezone.utc).isoformat()

        self.master_fd: Optional[int] = None
        self.child_pid: Optional[int] = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.alive: bool = False

        self.websocket: Optional[WebSocket] = None
        self._ws_lock = asyncio.Lock()
        self._output_buffer: str = ""
        self._decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "cwd": self.cwd,
            "alive": self.is_alive(),
            "created_at": self.created_at,
        }

    def is_alive(self) -> bool:
        if not self.alive or self.child_pid is None:
            return False
        try:
            pid, _ = os.waitpid(self.child_pid, os.WNOHANG)
            if pid != 0:
                self._cleanup_pty()
                return False
        except ChildProcessError:
            self._cleanup_pty()
            return False
        except Exception:
            pass
        return self.alive

    def resize(self, rows: int, cols: int):
        if rows <= 0 or cols <= 0:
            return
        self.rows = rows
        self.cols = cols
        if self.master_fd is not None:
            try:
                winsize = struct.pack("HHHH", rows, cols, 0, 0)
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
            except Exception as e:
                print(f"Error resizing pty {self.id}: {e}")

    def start(self, loop: Optional[asyncio.AbstractEventLoop] = None):
        if self.alive:
            return
        self.loop = loop or asyncio.get_running_loop()
        self.master_fd, slave_fd = pty.openpty()

        # Set initial window size
        self.resize(self.rows, self.cols)

        pid = os.fork()
        if pid == 0:
            # Child process
            os.close(self.master_fd)
            os.setsid()

            # Set controlling terminal
            try:
                fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
            except Exception:
                pass

            # Duplicate slave_fd to stdin, stdout, stderr
            os.dup2(slave_fd, 0)
            os.dup2(slave_fd, 1)
            os.dup2(slave_fd, 2)
            if slave_fd > 2:
                os.close(slave_fd)

            # Change to target directory
            try:
                if self.cwd and os.path.isdir(self.cwd):
                    os.chdir(self.cwd)
            except Exception:
                pass

            # Environment
            env = os.environ.copy()
            env["TERM"] = "xterm-256color"
            env["COLORTERM"] = "truecolor"

            shell = env.get("SHELL", "/bin/bash")
            os.execvpe(shell, [shell, "-l"], env)
        else:
            # Parent process
            os.close(slave_fd)
            self.child_pid = pid
            self.alive = True

            # Set master_fd to non-blocking
            flags = fcntl.fcntl(self.master_fd, fcntl.F_GETFL)
            fcntl.fcntl(self.master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

            # Register reader with asyncio event loop
            self.loop.add_reader(self.master_fd, self._on_pty_read)

    def _append_buffer(self, text: str):
        if not text:
            return
        self._output_buffer += text
        if len(self._output_buffer) > MAX_BUFFER_CHARS:
            self._output_buffer = self._output_buffer[-MAX_BUFFER_CHARS:]

    def _on_pty_read(self):
        if not self.alive or self.master_fd is None:
            return
        try:
            data = os.read(self.master_fd, 4096)
            if not data:
                self._cleanup_pty()
                return
            text = self._decoder.decode(data, final=False)
            if text:
                self._append_buffer(text)
                ws = self.websocket
                if ws is not None and self.loop is not None:
                    self.loop.create_task(self._send_to_ws(ws, text))
        except (BlockingIOError, InterruptedError):
            pass
        except OSError:
            # EIO when slave PTY closes on shell exit
            self._cleanup_pty()
        except Exception:
            self._cleanup_pty()

    async def _send_to_ws(self, ws: WebSocket, text: str):
        async with self._ws_lock:
            if self.websocket is not ws:
                return
            try:
                await ws.send_json({"type": "output", "data": text})
            except Exception:
                if self.websocket is ws:
                    self.websocket = None

    async def attach_websocket(self, websocket: WebSocket):
        if not self.alive and self.master_fd is None:
            self.start()

        async with self._ws_lock:
            old_ws = self.websocket
            self.websocket = websocket
            if old_ws is not None and old_ws is not websocket:
                try:
                    await old_ws.close(code=1000, reason="Reattached from another client")
                except Exception:
                    pass
            if self._output_buffer:
                try:
                    await websocket.send_json({"type": "output", "data": self._output_buffer})
                except Exception:
                    if self.websocket is websocket:
                        self.websocket = None
                    return

        try:
            while self.websocket is websocket:
                msg = await websocket.receive_json()
                mtype = msg.get("type")
                if mtype == "input":
                    data = msg.get("data", "")
                    if data and self.master_fd is not None and self.alive:
                        os.write(self.master_fd, data.encode("utf-8"))
                elif mtype == "resize":
                    r = int(msg.get("rows", 24))
                    c = int(msg.get("cols", 80))
                    self.resize(r, c)
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass
        except Exception:
            pass
        finally:
            # Detach websocket only; keep PTY alive in background
            if self.websocket is websocket:
                self.websocket = None

    def _cleanup_pty(self):
        self.alive = False
        if self.master_fd is not None:
            if self.loop is not None:
                try:
                    self.loop.remove_reader(self.master_fd)
                except Exception:
                    pass
            try:
                os.close(self.master_fd)
            except Exception:
                pass
            self.master_fd = None

        if self.child_pid is not None:
            try:
                os.waitpid(self.child_pid, os.WNOHANG)
            except Exception:
                pass

    def close(self):
        self.alive = False
        if self.master_fd is not None:
            if self.loop is not None:
                try:
                    self.loop.remove_reader(self.master_fd)
                except Exception:
                    pass
            try:
                os.close(self.master_fd)
            except Exception:
                pass
            self.master_fd = None

        if self.child_pid is not None:
            pid = self.child_pid
            self.child_pid = None
            try:
                os.killpg(pid, signal.SIGTERM)
            except Exception:
                try:
                    os.kill(pid, signal.SIGTERM)
                except Exception:
                    pass
            try:
                os.waitpid(pid, os.WNOHANG)
            except Exception:
                pass

        if self.websocket is not None:
            ws = self.websocket
            self.websocket = None
            if self.loop is not None and self.loop.is_running():
                async def _close_ws():
                    try:
                        await ws.close(code=1000, reason="Session closed")
                    except Exception:
                        pass
                self.loop.create_task(_close_ws())


class PTYManager:
    def __init__(self):
        self.sessions: Dict[str, PTYSession] = {}
        self._counter: int = 0

    def list_sessions(self) -> List[dict]:
        return [s.to_dict() for s in self.sessions.values()]

    def get_session(self, session_id: str) -> Optional[PTYSession]:
        return self.sessions.get(session_id)

    def create_session(
        self,
        cwd: str,
        name: Optional[str] = None,
        rows: int = 24,
        cols: int = 80,
    ) -> PTYSession:
        self._counter += 1
        session_id = uuid.uuid4().hex[:8]
        session_name = name.strip() if name and name.strip() else f"Terminal {self._counter}"
        session = PTYSession(
            session_id=session_id,
            name=session_name,
            cwd=cwd,
            rows=rows,
            cols=cols,
        )
        session.start()
        self.sessions[session_id] = session
        return session

    def delete_session(self, session_id: str) -> bool:
        session = self.sessions.pop(session_id, None)
        if session is None:
            return False
        session.close()
        return True

    def get_or_create_default(
        self,
        session_id: Optional[str],
        cwd: str,
        rows: int = 24,
        cols: int = 80,
    ) -> PTYSession:
        if session_id and session_id in self.sessions:
            return self.sessions[session_id]
        if not session_id:
            for session in self.sessions.values():
                if session.is_alive():
                    return session
        return self.create_session(cwd=cwd, rows=rows, cols=cols)

    async def attach_websocket(self, session_id: str, websocket: WebSocket):
        session = self.sessions.get(session_id)
        if session is None:
            raise KeyError(f"Session {session_id} not found")
        await session.attach_websocket(websocket)
