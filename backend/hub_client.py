import os
import json
from typing import Optional, Dict, Any, List
import httpx

class HubClient:
    def __init__(self):
        self.daemon_dir = os.path.expanduser("~/.gemini/antigravity/daemon")
        self.client = httpx.AsyncClient(timeout=30.0)

    def get_all_active_hubs(self) -> List[Dict[str, Any]]:
        hubs: List[Dict[str, Any]] = []
        if not os.path.exists(self.daemon_dir):
            return hubs
        for fname in os.listdir(self.daemon_dir):
            if fname.startswith("hub_") and fname.endswith(".json"):
                fpath = os.path.join(self.daemon_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        pid = data.get("pid")
                        if pid and os.path.exists(f"/proc/{pid}"):
                            hubs.append(data)
                except Exception:
                    continue
        return hubs

    def get_active_hub(self) -> Optional[Dict[str, Any]]:
        hubs = self.get_all_active_hubs()
        return hubs[0] if hubs else None

    async def call_rpc_on_hub(self, hub: Dict[str, Any], method: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        port = hub["httpPort"]
        csrf = hub.get("csrfToken", "")
        url = f"http://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/{method}"

        res = await self.client.post(
            url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "x-codeium-csrf-token": csrf,
            },
        )
        res.raise_for_status()
        return res.json()

    async def call_rpc(self, method: str, payload: Dict[str, Any], cascade_id: Optional[str] = None) -> Dict[str, Any]:
        hubs = self.get_all_active_hubs()
        if not hubs:
            raise RuntimeError("No active Antigravity IDE hub found. Is Antigravity IDE running?")

        if cascade_id and len(hubs) > 1:
            for hub in hubs:
                try:
                    all_data = await self.call_rpc_on_hub(hub, "GetAllCascadeTrajectories", {})
                    if cascade_id in all_data.get("trajectorySummaries", {}):
                        return await self.call_rpc_on_hub(hub, method, payload)
                except Exception:
                    continue

        return await self.call_rpc_on_hub(hubs[0], method, payload)

    async def list_conversations(self) -> List[Dict[str, Any]]:
        hubs = self.get_all_active_hubs()
        if not hubs:
            return []
        results = []
        seen = set()
        for hub in hubs:
            try:
                data = await self.call_rpc_on_hub(hub, "GetAllCascadeTrajectories", {})
                summaries = data.get("trajectorySummaries", {})
                for conv_id, info in summaries.items():
                    if conv_id in seen:
                        continue
                    seen.add(conv_id)
                    results.append({
                        "conversation_id": conv_id,
                        "trajectory_id": info.get("trajectoryId", ""),
                        "title": info.get("summary") or "Untitled Session",
                        "preview": "",
                        "step_count": info.get("stepCount", 0),
                        "last_modified_time": info.get("lastModifiedTime", ""),
                        "status": info.get("status", ""),
                        "workspaces": [
                            w.get("workspaceFolderAbsoluteUri", "").replace("file://", "")
                            for w in info.get("workspaces", [])
                        ],
                    })
            except Exception:
                continue
        results.sort(key=lambda x: x["last_modified_time"], reverse=True)
        return results

    async def get_conversation_steps(self, cascade_id: str, limit: int = 120) -> Dict[str, Any]:
        # Get summary first to know total stepCount and trajectoryId
        all_data = await self.call_rpc("GetAllCascadeTrajectories", {}, cascade_id=cascade_id)
        summary = all_data.get("trajectorySummaries", {}).get(cascade_id, {})
        total_steps = summary.get("stepCount", 0)
        trajectory_id = summary.get("trajectoryId", "")
        conv_status = summary.get("status", "")

        steps_data = await self.call_rpc("GetCascadeTrajectorySteps", {
            "cascadeId": cascade_id,
            "startIndex": 0,
            "endIndex": max(total_steps + 200, 10000),
        }, cascade_id=cascade_id)

        all_steps = steps_data.get("steps", [])
        base_offset = 0
        if len(all_steps) > limit:
            base_offset = len(all_steps) - limit
            raw_steps = all_steps[-limit:]
        else:
            raw_steps = all_steps

        parsed_steps = []
        pending_permissions = []

        # Build model id -> friendly label lookup for displaying which model replied
        model_names: Dict[str, str] = {}
        try:
            m_data = await self.get_models()
            model_names = {m["id"]: m["label"] for m in m_data.get("models", [])}
        except Exception:
            pass

        for idx, s in enumerate(raw_steps):
            step_index = base_offset + idx
            stype = s.get("type", "")
            status = s.get("status", "")
            meta = s.get("metadata", {})
            created_at = meta.get("createdAt", "")
            model_id = meta.get("modelUsage", {}).get("model")
            model_name = model_names.get(model_id, model_id) if model_id else None

            # Check for pending interactions/permissions (singular requestedInteraction)
            if status == "CORTEX_STEP_STATUS_WAITING":
                ri = s.get("requestedInteraction")
                if ri:
                    if "permission" in ri:
                        perm = ri["permission"]
                        res = perm.get("resource", {})
                        pending_permissions.append({
                            "step_index": step_index,
                            "trajectory_id": trajectory_id,
                            "action": res.get("action", "command"),
                            "target": res.get("target", ""),
                            "description": perm.get("actionDescription", "Permission requested"),
                        })
                    elif "filePermission" in ri:
                        fp = ri["filePermission"]
                        pending_permissions.append({
                            "step_index": step_index,
                            "trajectory_id": trajectory_id,
                            "action": "file",
                            "target": fp.get("absolutePathUri", ""),
                            "description": "File access permission requested",
                        })
                    elif "runCommand" in ri:
                        rc = ri["runCommand"]
                        cmd_str = rc.get("commandLine") or rc.get("command", "")
                        pending_permissions.append({
                            "step_index": step_index,
                            "trajectory_id": trajectory_id,
                            "action": "command",
                            "target": cmd_str,
                            "description": "Run terminal command",
                        })
                elif s.get("runCommand"):
                    rc = s["runCommand"]
                    cmd_str = rc.get("commandLine") or rc.get("command", "")
                    pending_permissions.append({
                        "step_index": step_index,
                        "trajectory_id": trajectory_id,
                        "action": "command",
                        "target": cmd_str,
                        "description": "Run terminal command",
                    })
                else:
                    # Fallback to toolCall argumentsJson
                    tc = meta.get("toolCall", {})
                    if tc:
                        pending_permissions.append({
                            "step_index": step_index,
                            "trajectory_id": trajectory_id,
                            "action": tc.get("name", "tool"),
                            "target": tc.get("argumentsJson", ""),
                            "description": f"Approve {tc.get('name', 'tool')}",
                        })

            if stype == "CORTEX_STEP_TYPE_USER_INPUT":
                ui = s.get("userInput", {})
                text = ui.get("userResponse") or "".join(
                    item.get("text", "") for item in ui.get("items", [])
                )
                parsed_steps.append({
                    "step_index": step_index,
                    "source": "USER_EXPLICIT",
                    "type": "USER_INPUT",
                    "status": status,
                    "created_at": created_at,
                    "content": text,
                })

            elif stype == "CORTEX_STEP_TYPE_PLANNER_RESPONSE":
                pr = s.get("plannerResponse", {})
                response_text = pr.get("modifiedResponse") or pr.get("response", "")
                thinking = pr.get("thinking", "")
                raw_tool_calls = pr.get("toolCalls", [])
                tool_calls = []
                for tc in raw_tool_calls:
                    parsed_args = tc.get("args") or tc.get("parameters") or {}
                    if not parsed_args and tc.get("argumentsJson"):
                        try:
                            parsed_args = json.loads(tc["argumentsJson"])
                        except Exception:
                            parsed_args = {"raw": tc["argumentsJson"]}
                    tool_calls.append({
                        "name": tc.get("name") or tc.get("tool") or "tool",
                        "args": parsed_args,
                    })
                if response_text or thinking or tool_calls:
                    parsed_steps.append({
                        "step_index": step_index,
                        "source": "MODEL",
                        "type": "PLANNER_RESPONSE",
                        "status": status,
                        "created_at": created_at,
                        "content": response_text,
                        "thinking": thinking,
                        "tool_calls": tool_calls,
                        "model": model_name,
                    })

            elif stype == "CORTEX_STEP_TYPE_RUN_COMMAND":
                rc = s.get("runCommand", {})
                cmd_line = rc.get("commandLine") or rc.get("command", "")
                if not cmd_line:
                    try:
                        args = json.loads(meta.get("toolCall", {}).get("argumentsJson", "{}"))
                        cmd_line = args.get("CommandLine", "")
                    except Exception:
                        pass
                output = (
                    rc.get("combinedOutput", {}).get("full", "")
                    or rc.get("stdout", "")
                    or s.get("taskDetails", {}).get("progress", "")
                )
                parsed_steps.append({
                    "step_index": step_index,
                    "source": "MODEL",
                    "type": "RUN_COMMAND",
                    "status": status,
                    "created_at": created_at,
                    "content": f"$ {cmd_line}" + (f"\n{output[:1200]}" if output else ""),
                })

            elif stype == "CORTEX_STEP_TYPE_CODE_ACTION":
                ca = s.get("codeAction", {})
                spec = ca.get("actionSpec", {})
                cmd_spec = spec.get("command", {})
                create_spec = spec.get("createFile", {})
                file_uri = (
                    cmd_spec.get("file", {}).get("absoluteUri")
                    or create_spec.get("path", {}).get("absoluteUri")
                    or ""
                )
                if not file_uri:
                    try:
                        args = json.loads(meta.get("toolCall", {}).get("argumentsJson", "{}"))
                        file_uri = args.get("Path", "")
                    except Exception:
                        pass
                file_path = file_uri.replace("file://", "")
                diff_lines = (
                    ca.get("actionResult", {})
                    .get("edit", {})
                    .get("diff", {})
                    .get("unifiedDiff", {})
                    .get("lines", [])
                )
                diff_text_lines = []
                for dl in diff_lines[:60]:
                    ltype = dl.get("type", "")
                    ltext = dl.get("text", "")
                    if "ADDED" in ltype:
                        diff_text_lines.append(f"+ {ltext}")
                    elif "REMOVED" in ltype or "DELETED" in ltype:
                        diff_text_lines.append(f"- {ltext}")
                    else:
                        diff_text_lines.append(f"  {ltext}")
                diff_preview = "\n".join(diff_text_lines)
                parsed_steps.append({
                    "step_index": step_index,
                    "source": "MODEL",
                    "type": "CODE_ACTION",
                    "status": status,
                    "created_at": created_at,
                    "content": file_path + (f"\n{diff_preview}" if diff_preview else ""),
                })

            elif stype == "CORTEX_STEP_TYPE_VIEW_FILE":
                vf = s.get("viewFile", {})
                fpath = vf.get("absolutePathUri", "").replace("file://", "")
                start_l = vf.get("startLine", "")
                end_l = vf.get("endLine", "")
                loc = f" (L{start_l}-{end_l})" if start_l and end_l else ""
                parsed_steps.append({
                    "step_index": step_index,
                    "source": "MODEL",
                    "type": "VIEW_FILE",
                    "status": status,
                    "created_at": created_at,
                    "content": f"{fpath}{loc}",
                })

        return {
            "conversation_id": cascade_id,
            "trajectory_id": trajectory_id,
            "status": conv_status,
            "step_count": total_steps,
            "steps": parsed_steps,
            "pending_permissions": pending_permissions,
        }

    async def get_models(self) -> Dict[str, Any]:
        res = await self.call_rpc("GetUserStatus", {})
        data = res.get("userStatus", {}).get("cascadeModelConfigData", {})
        configs = data.get("clientModelConfigs", [])
        default_id = (
            data.get("defaultOverrideModelConfig", {})
            .get("modelOrAlias", {})
            .get("model", "")
        )
        models = []
        for m in configs:
            model_id = m.get("modelOrAlias", {}).get("model", "")
            tag = m.get("tagTitle")
            if not model_id or tag == "Unavailable":
                continue
            models.append({
                "id": model_id,
                "label": m.get("label", model_id),
                "tag": tag,
                "quota": m.get("quotaInfo", {}).get("remainingFraction"),
            })
        return {"models": models, "default_model": default_id}

    async def send_message(
        self,
        cascade_id: Optional[str],
        text: str,
        workspace: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        target_id = cascade_id
        if not target_id or target_id == "new":
            start_payload: Dict[str, Any] = {}
            if workspace:
                start_payload["workspaceUris"] = [f"file://{workspace}"]
            start_res = await self.call_rpc("StartCascade", start_payload)
            target_id = start_res.get("cascadeId")

        payload: Dict[str, Any] = {
            "cascadeId": target_id,
            "items": [{"text": text}],
        }
        if model:
            payload["cascadeConfig"] = {
                "plannerConfig": {
                    "planModel": model,
                }
            }

        res = await self.call_rpc("SendUserCascadeMessage", payload, cascade_id=target_id)
        return {"cascade_id": target_id, "result": res}

    async def handle_interaction(
        self,
        cascade_id: str,
        trajectory_id: str,
        step_index: int,
        allow: bool,
        scope: str = "PERMISSION_SCOPE_ONCE"
    ) -> Dict[str, Any]:
        return await self.call_rpc("HandleCascadeUserInteraction", {
            "cascadeId": cascade_id,
            "interaction": {
                "trajectoryId": trajectory_id,
                "stepIndex": step_index,
                "permission": {
                    "allow": allow,
                    "scope": scope,
                }
            }
        }, cascade_id=cascade_id)

    async def stop_agent(self, cascade_id: str) -> Dict[str, Any]:
        results: Dict[str, Any] = {}
        try:
            results["cancel"] = await self.call_rpc("CancelCascadeInvocation", {
                "cascadeId": cascade_id,
            }, cascade_id=cascade_id)
        except Exception as e:
            results["cancel_error"] = str(e)

        try:
            results["force_stop"] = await self.call_rpc("ForceStopCascadeTree", {
                "conversationId": cascade_id,
            }, cascade_id=cascade_id)
        except Exception as e:
            results["force_stop_error"] = str(e)

        return {"stopped": True, **results}
