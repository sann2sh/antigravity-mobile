import os
import stat
from typing import List, Dict, Any, Optional
from datetime import datetime

class FilesystemManager:
    def __init__(self, default_workspace: Optional[str] = None):
        self.workspace = default_workspace or os.getcwd()

    def get_workspace(self) -> str:
        return self.workspace

    def set_workspace(self, path: str) -> bool:
        expanded = os.path.expanduser(path)
        if os.path.isdir(expanded):
            self.workspace = os.path.abspath(expanded)
            return True
        return False

    def list_dir(self, target_path: Optional[str] = None) -> Dict[str, Any]:
        path = os.path.expanduser(target_path) if target_path else self.workspace
        path = os.path.abspath(path)

        if not os.path.exists(path):
            raise FileNotFoundError(f"Path not found: {path}")
        if not os.path.isdir(path):
            raise NotADirectoryError(f"Not a directory: {path}")

        parent = os.path.dirname(path) if path != "/" else None

        items: List[Dict[str, Any]] = []
        try:
            with os.scandir(path) as it:
                for entry in it:
                    try:
                        info = entry.stat(follow_symlinks=False)
                        is_dir = entry.is_dir(follow_symlinks=False)
                        items.append({
                            "name": entry.name,
                            "path": entry.path,
                            "is_dir": is_dir,
                            "size": info.st_size if not is_dir else 0,
                            "mtime": datetime.fromtimestamp(info.st_mtime).isoformat(),
                            "is_hidden": entry.name.startswith("."),
                        })
                    except (PermissionError, FileNotFoundError):
                        continue
        except PermissionError:
            raise PermissionError(f"Permission denied reading {path}")

        # Sort: directories first, then alphabetically
        items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

        return {
            "current_path": path,
            "parent_path": parent,
            "items": items,
        }

    def read_file(self, file_path: str, max_lines: int = 1000) -> Dict[str, Any]:
        path = os.path.abspath(os.path.expanduser(file_path))
        if not os.path.exists(path):
            raise FileNotFoundError(f"File not found: {path}")
        if os.path.isdir(path):
            raise IsADirectoryError(f"Target is a directory: {path}")

        size = os.path.getsize(path)
        # Check binary file
        is_binary = False
        try:
            with open(path, "rb") as f:
                chunk = f.read(1024)
                if b"\x00" in chunk:
                    is_binary = True
        except Exception:
            is_binary = True

        if is_binary:
            return {
                "path": path,
                "name": os.path.basename(path),
                "is_binary": True,
                "size": size,
                "content": "[Binary file cannot be displayed]",
            }

        lines = []
        truncated = False
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i >= max_lines:
                    truncated = True
                    break
                lines.append(line)

        return {
            "path": path,
            "name": os.path.basename(path),
            "is_binary": False,
            "size": size,
            "line_count": len(lines),
            "truncated": truncated,
            "content": "".join(lines),
        }

    def write_file(self, file_path: str, content: str) -> Dict[str, Any]:
        path = os.path.abspath(os.path.expanduser(file_path))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"path": path, "size": os.path.getsize(path), "success": True}
