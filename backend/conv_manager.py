import os
import sqlite3
import json
from typing import List, Dict, Any, Optional

class ConversationManager:
    def __init__(self):
        self.base_dir = os.path.expanduser("~/.gemini/antigravity")
        self.db_path = os.path.join(self.base_dir, "conversation_summaries.db")
        self.brain_dir = os.path.join(self.base_dir, "brain")

    def list_conversations(self, limit: int = 50, search: Optional[str] = None) -> List[Dict[str, Any]]:
        if not os.path.exists(self.db_path):
            return []

        try:
            con = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
            con.row_factory = sqlite3.Row
            cur = con.cursor()

            if search:
                query = """
                    SELECT conversation_id, title, preview, step_count, last_modified_time, workspace_uris, status, agent_name
                    FROM conversation_summaries
                    WHERE title LIKE ? OR preview LIKE ?
                    ORDER BY last_modified_time DESC
                    LIMIT ?;
                """
                cur.execute(query, (f"%{search}%", f"%{search}%", limit))
            else:
                query = """
                    SELECT conversation_id, title, preview, step_count, last_modified_time, workspace_uris, status, agent_name
                    FROM conversation_summaries
                    ORDER BY last_modified_time DESC
                    LIMIT ?;
                """
                cur.execute(query, (limit,))

            rows = cur.fetchall()
            results = []
            for r in rows:
                title = r["title"] or "Untitled Conversation"
                results.append({
                    "conversation_id": r["conversation_id"],
                    "title": title,
                    "preview": r["preview"],
                    "step_count": r["step_count"],
                    "last_modified_time": r["last_modified_time"],
                    "workspace_uris": r["workspace_uris"],
                    "status": r["status"],
                    "agent_name": r["agent_name"],
                })
            con.close()
            return results
        except Exception as e:
            print(f"Error querying conversation db: {e}")
            return []

    def get_conversation_details(self, conv_id: str) -> Dict[str, Any]:
        conv_folder = os.path.join(self.brain_dir, conv_id)
        if not os.path.exists(conv_folder):
            raise FileNotFoundError(f"Conversation {conv_id} not found in brain directory")

        # 1. Read transcript
        transcript_path = os.path.join(conv_folder, ".system_generated", "logs", "transcript.jsonl")
        steps = []
        pending_permissions = []

        if os.path.exists(transcript_path):
            try:
                with open(transcript_path, "r", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            step = json.loads(line)
                            steps.append(step)
                        except json.JSONDecodeError:
                            continue
            except Exception as e:
                print(f"Error reading transcript: {e}")

        # Check for pending permissions or active tool calls
        for step in reversed(steps):
            tool_calls = step.get("tool_calls", [])
            for tc in tool_calls:
                # Check for permission or confirm flags
                name = tc.get("name") or (tc.get("tool_calls") and tc["tool_calls"].get("name"))
                if name in ["ask_permission", "ask_question", "ask_custom_permission"]:
                    pending_permissions.append({
                        "step_index": step.get("step_index"),
                        "tool": name,
                        "args": tc.get("args") or tc.get("parameters"),
                    })

        # 2. Collect artifacts (.md files in conv_folder)
        artifacts = []
        try:
            for fname in os.listdir(conv_folder):
                if fname.startswith("."):
                    continue
                fpath = os.path.join(conv_folder, fname)
                if os.path.isfile(fpath) and fname.endswith((".md", ".html", ".txt", ".json")):
                    size = os.path.getsize(fpath)
                    artifacts.append({
                        "name": fname,
                        "path": fpath,
                        "size": size,
                    })
        except Exception as e:
            print(f"Error listing artifacts: {e}")

        return {
            "conversation_id": conv_id,
            "step_count": len(steps),
            "steps": steps,
            "artifacts": artifacts,
            "pending_permissions": pending_permissions,
        }

    def read_artifact(self, conv_id: str, artifact_name: str) -> str:
        # Sanitize artifact name
        clean_name = os.path.basename(artifact_name)
        fpath = os.path.join(self.brain_dir, conv_id, clean_name)
        if not os.path.exists(fpath):
            raise FileNotFoundError(f"Artifact {clean_name} not found")
        with open(fpath, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

