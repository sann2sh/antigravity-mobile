import asyncio
import json
import os
import shutil
from typing import AsyncGenerator, Optional, Dict, Any

class AgentRunner:
    def __init__(self):
        self.agy_path = shutil.which("agy") or os.path.expanduser("~/.local/bin/agy")
        self.active_processes: Dict[str, asyncio.subprocess.Process] = {}

    async def _execute_agy(
        self,
        cmd: list,
        cwd: str,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
            env={**os.environ}
        )

        has_output = False
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            line_str = line.decode("utf-8", errors="replace").strip()
            if not line_str:
                continue

            has_output = True
            try:
                event = json.loads(line_str)
                yield event
            except json.JSONDecodeError:
                yield {"event": "raw_output", "text": line_str}

        await process.wait()

        if process.returncode != 0:
            stderr = await process.stderr.read()
            err_text = stderr.decode("utf-8", errors="replace").strip()
            if err_text:
                yield {"event": "error", "message": err_text}

    async def run_prompt_stream(
        self,
        prompt: str,
        conversation_id: Optional[str] = None,
        workspace: Optional[str] = None,
        mode: str = "auto",
        skip_permissions: bool = False
    ) -> AsyncGenerator[Dict[str, Any], None]:
        cwd = workspace if (workspace and os.path.isdir(workspace)) else os.getcwd()

        base_cmd = [self.agy_path, "-p", prompt, "--output-format", "stream-json"]
        if workspace and os.path.isdir(workspace):
            base_cmd.extend(["--add-dir", workspace])
        if mode in ["auto", "plan", "accept-edits"]:
            base_cmd.extend(["--mode", mode])
        if skip_permissions:
            base_cmd.append("--dangerously-skip-permissions")

        # Try with conversation_id first if provided
        first_attempt_cmd = list(base_cmd)
        if conversation_id and conversation_id != "new":
            first_attempt_cmd.extend(["--conversation", conversation_id])

        retry_without_conv = False
        async for event in self._execute_agy(first_attempt_cmd, cwd):
            if event.get("event") == "error" and "trajectory not found" in event.get("message", ""):
                retry_without_conv = True
                break
            yield event

        # If trajectory was not found in standalone CLI, launch fresh turn in the workspace
        if retry_without_conv:
            yield {"event": "raw_output", "text": "[Starting fresh agent session in current workspace]"}
            async for event in self._execute_agy(base_cmd, cwd):
                yield event

    async def execute_quick_command(self, command: str, cwd: Optional[str] = None) -> Dict[str, Any]:
        """Runs a one-off shell command and returns output (for quick command runner)."""
        run_cwd = cwd or os.getcwd()
        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=run_cwd
            )
            stdout, stderr = await process.communicate()
            return {
                "command": command,
                "cwd": run_cwd,
                "exit_code": process.returncode,
                "stdout": stdout.decode("utf-8", errors="replace"),
                "stderr": stderr.decode("utf-8", errors="replace"),
                "success": process.returncode == 0
            }
        except Exception as e:
            return {
                "command": command,
                "cwd": run_cwd,
                "exit_code": -1,
                "stdout": "",
                "stderr": str(e),
                "success": False
            }
