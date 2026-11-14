import os
import pty
import fcntl
import termios
import struct
import signal
import asyncio
from fastapi import WebSocket, WebSocketDisconnect

class PTYSession:
    def __init__(self, websocket: WebSocket, cwd: str, rows: int = 24, cols: int = 80):
        self.websocket = websocket
        self.cwd = cwd
        self.rows = rows
        self.cols = cols
        self.master_fd = None
        self.child_pid = None
        self.loop = asyncio.get_event_loop()
        self.is_running = False

    def resize(self, rows: int, cols: int):
        self.rows = rows
        self.cols = cols
        if self.master_fd is not None:
            try:
                winsize = struct.pack("HHHH", rows, cols, 0, 0)
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
            except Exception as e:
                print(f"Error resizing pty: {e}")

    async def start(self):
        self.master_fd, slave_fd = pty.openpty()

        # Set initial window size
        self.resize(self.rows, self.cols)

        # Fork child process
        pid = os.fork()
        if pid == 0:
            # Child process
            os.close(self.master_fd)
            os.setsid()

            # Duplicate slave_fd to stdin, stdout, stderr
            os.dup2(slave_fd, 0)
            os.dup2(slave_fd, 1)
            os.dup2(slave_fd, 2)
            if slave_fd > 2:
                os.close(slave_fd)

            # Change to target directory
            try:
                if os.path.isdir(self.cwd):
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
            self.is_running = True

            # Set master_fd to non-blocking
            flags = fcntl.fcntl(self.master_fd, fcntl.F_GETFL)
            fcntl.fcntl(self.master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

            # Register reader with asyncio event loop
            self.loop.add_reader(self.master_fd, self._on_pty_read)

            try:
                # Listen for messages from WebSocket (from phone)
                while self.is_running:
                    msg = await self.websocket.receive_json()
                    mtype = msg.get("type")
                    if mtype == "input":
                        data = msg.get("data", "")
                        if self.master_fd is not None:
                            os.write(self.master_fd, data.encode("utf-8"))
                    elif mtype == "resize":
                        r = msg.get("rows", 24)
                        c = msg.get("cols", 80)
                        self.resize(r, c)
            except (WebSocketDisconnect, asyncio.CancelledError):
                pass
            finally:
                self.close()

    def _on_pty_read(self):
        if not self.is_running or self.master_fd is None:
            return
        try:
            data = os.read(self.master_fd, 4096)
            if not data:
                self.close()
                return
            text = data.decode("utf-8", errors="replace")
            # Schedule sending text over websocket
            asyncio.ensure_future(
                self.websocket.send_json({"type": "output", "data": text})
            )
        except (BlockingIOError, InterruptedError):
            pass
        except Exception as e:
            self.close()

    def close(self):
        if not self.is_running:
            return
        self.is_running = False

        if self.master_fd is not None:
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
                os.kill(self.child_pid, signal.SIGTERM)
                os.waitpid(self.child_pid, os.WNOHANG)
            except Exception:
                pass
            self.child_pid = None
