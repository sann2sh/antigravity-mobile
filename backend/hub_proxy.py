import os
import json
import asyncio
from typing import Optional, Dict, Any
from fastapi import FastAPI, WebSocket, Request, Response
from fastapi.responses import StreamingResponse
import httpx
import websockets

def get_active_hub() -> Optional[Dict[str, Any]]:
    daemon_dir = os.path.expanduser("~/.gemini/antigravity/daemon")
    if not os.path.exists(daemon_dir):
        return None
    for fname in os.listdir(daemon_dir):
        if fname.startswith("hub_") and fname.endswith(".json"):
            fpath = os.path.join(daemon_dir, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    pid = data.get("pid")
                    if pid and os.path.exists(f"/proc/{pid}"):
                        return data
            except Exception:
                continue
    return None

hub_app = FastAPI(title="Antigravity Hub Live Proxy")
client = httpx.AsyncClient(timeout=60.0)

@hub_app.websocket("/connect-websocket")
async def proxy_connect_ws(client_ws: WebSocket):
    await client_ws.accept()
    hub_info = get_active_hub()
    if not hub_info:
        await client_ws.close(code=1011, reason="Active Antigravity Hub not found")
        return

    port = hub_info["httpPort"]
    csrf_token = hub_info.get("csrfToken", "")
    target_uri = f"ws://127.0.0.1:{port}/connect-websocket"

    headers = {
        "Origin": f"http://127.0.0.1:{port}",
        "x-csrf-token": csrf_token,
    }

    try:
        async with websockets.connect(target_uri, additional_headers=headers) as hub_ws:
            async def forward_client_to_hub():
                try:
                    while True:
                        msg = await client_ws.receive()
                        if "bytes" in msg and msg["bytes"]:
                            await hub_ws.send(msg["bytes"])
                        elif "text" in msg and msg["text"]:
                            await hub_ws.send(msg["text"])
                        elif msg.get("type") == "websocket.disconnect":
                            break
                except Exception:
                    pass

            async def forward_hub_to_client():
                try:
                    while True:
                        data = await hub_ws.recv()
                        if isinstance(data, bytes):
                            await client_ws.send_bytes(data)
                        else:
                            await client_ws.send_text(data)
                except Exception:
                    pass

            await asyncio.gather(forward_client_to_hub(), forward_hub_to_client())
    except Exception as e:
        print(f"Error in hub ws proxy: {e}")
        try:
            await client_ws.close()
        except Exception:
            pass

@hub_app.websocket("/voice/ws")
async def proxy_voice_ws(client_ws: WebSocket):
    await client_ws.accept()
    hub_info = get_active_hub()
    if not hub_info:
        await client_ws.close()
        return

    port = hub_info["httpPort"]
    target_uri = f"ws://127.0.0.1:{port}/voice/ws"
    try:
        async with websockets.connect(target_uri) as hub_ws:
            async def to_hub():
                while True:
                    m = await client_ws.receive()
                    if "bytes" in m and m["bytes"]:
                        await hub_ws.send(m["bytes"])
                    elif "text" in m and m["text"]:
                        await hub_ws.send(m["text"])

            async def to_client():
                while True:
                    d = await hub_ws.recv()
                    if isinstance(d, bytes):
                        await client_ws.send_bytes(d)
                    else:
                        await client_ws.send_text(d)

            await asyncio.gather(to_hub(), to_client())
    except Exception:
        pass

@hub_app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def proxy_http_requests(path: str, request: Request):
    hub_info = get_active_hub()
    if not hub_info:
        return Response("Antigravity Hub not found. Please ensure Antigravity IDE is running.", status_code=503)

    port = hub_info["httpPort"]
    csrf_token = hub_info.get("csrfToken", "")
    target_url = f"http://127.0.0.1:{port}/{path}"
    if request.url.query:
        target_url += f"?{request.url.query}"

    req_headers = dict(request.headers)
    req_headers["host"] = f"127.0.0.1:{port}"
    req_headers["x-csrf-token"] = csrf_token
    req_headers["origin"] = f"http://127.0.0.1:{port}"
    req_headers["accept-encoding"] = "identity"
    req_headers.pop("content-length", None)

    body = await request.body()

    try:
        req = client.build_request(
            method=request.method,
            url=target_url,
            headers=req_headers,
            content=body,
        )
        r = await client.send(req, stream=True)

        excluded_headers = {
            "content-encoding",
            "content-length",
            "transfer-encoding",
            "connection",
            "content-security-policy",
            "x-frame-options",
        }
        res_headers = {k: v for k, v in r.headers.items() if k.lower() not in excluded_headers}

        return StreamingResponse(
            r.aiter_bytes(),
            status_code=r.status_code,
            headers=res_headers,
            background=r.aclose,
        )
    except Exception as e:
        return Response(f"Proxy error: {e}", status_code=502)
