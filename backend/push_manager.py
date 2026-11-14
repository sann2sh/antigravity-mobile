import asyncio
import base64
import json
import logging
import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid
from pywebpush import WebPushException, webpush

logger = logging.getLogger(__name__)

VAPID_CLAIMS = {"sub": "mailto:antigravity-mobile@localhost"}
POLL_INTERVAL_SECONDS = 2.0
MAX_WATCHED_CONVERSATIONS = 10

_lock = threading.Lock()
_watcher_task: Optional[asyncio.Task] = None
_seen_permission_keys: Set[Tuple[str, Optional[int], str, str]] = set()


def _get_data_dir() -> Path:
    """Return the push data directory, creating it if needed."""
    env_dir = os.environ.get("PUSH_DATA_DIR", "").strip()
    if env_dir:
        data_dir = Path(os.path.expanduser(env_dir))
    else:
        data_dir = Path.home() / ".antigravity-mobile" / "push"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def _export_uncompressed_public_key(vapid: Vapid) -> str:
    """Export the 65-byte uncompressed EC P-256 public key as unpadded base64url."""
    raw_pub = vapid.public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return base64.urlsafe_b64encode(raw_pub).rstrip(b"=").decode("ascii")


def _ensure_vapid_keys() -> Tuple[Path, str]:
    """Ensure VAPID private PEM and public key text exist; return (priv_path, public_key)."""
    with _lock:
        data_dir = _get_data_dir()
        priv_path = data_dir / "vapid_private.pem"
        pub_path = data_dir / "vapid_public_key.txt"

        if priv_path.exists() and priv_path.stat().st_size > 0:
            if pub_path.exists() and pub_path.stat().st_size > 0:
                return priv_path, pub_path.read_text(encoding="utf-8").strip()
            vapid = Vapid.from_file(str(priv_path))
            pub_b64 = _export_uncompressed_public_key(vapid)
            pub_path.write_text(pub_b64, encoding="utf-8")
            return priv_path, pub_b64

        vapid = Vapid()
        vapid.generate_keys()
        vapid.save_key(str(priv_path))
        try:
            os.chmod(priv_path, 0o600)
        except OSError:
            pass
        pub_b64 = _export_uncompressed_public_key(vapid)
        pub_path.write_text(pub_b64, encoding="utf-8")
        return priv_path, pub_b64


def get_public_key() -> str:
    """Return the URL-safe base64 VAPID public key (generating keys on first run)."""
    _, pub_b64 = _ensure_vapid_keys()
    return pub_b64


def _load_subscriptions_unlocked(subs_path: Path) -> List[Dict[str, Any]]:
    if not subs_path.exists():
        return []
    try:
        data = json.loads(subs_path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_subscriptions_unlocked(subs_path: Path, subs: List[Dict[str, Any]]) -> None:
    subs_path.write_text(json.dumps(subs, indent=2), encoding="utf-8")


def list_subscriptions() -> List[Dict[str, Any]]:
    """Return all stored Web Push subscriptions."""
    with _lock:
        subs_path = _get_data_dir() / "subscriptions.json"
        return list(_load_subscriptions_unlocked(subs_path))


def add_subscription(sub: Dict[str, Any]) -> Dict[str, Any]:
    """Store or update a Web Push subscription keyed by endpoint."""
    endpoint = (sub.get("endpoint") or "").strip()
    keys = sub.get("keys") or {}
    p256dh = (keys.get("p256dh") or "").strip()
    auth = (keys.get("auth") or "").strip()
    if not endpoint or not p256dh or not auth:
        raise ValueError("Subscription must include endpoint and keys (p256dh, auth)")

    normalized: Dict[str, Any] = {
        "endpoint": endpoint,
        "keys": {"p256dh": p256dh, "auth": auth},
    }
    if "expirationTime" in sub:
        normalized["expirationTime"] = sub["expirationTime"]

    with _lock:
        subs_path = _get_data_dir() / "subscriptions.json"
        subs = _load_subscriptions_unlocked(subs_path)
        subs = [s for s in subs if s.get("endpoint") != endpoint]
        subs.append(normalized)
        _save_subscriptions_unlocked(subs_path, subs)
    return normalized


def remove_subscription(endpoint: str) -> bool:
    """Remove a Web Push subscription by endpoint. Returns True if removed."""
    target = (endpoint or "").strip()
    if not target:
        return False
    with _lock:
        subs_path = _get_data_dir() / "subscriptions.json"
        subs = _load_subscriptions_unlocked(subs_path)
        filtered = [s for s in subs if s.get("endpoint") != target]
        if len(filtered) == len(subs):
            return False
        _save_subscriptions_unlocked(subs_path, filtered)
        return True


async def send_push_to_all(payload: Dict[str, Any]) -> int:
    """Send a JSON push notification to all subscribers, pruning 404/410 endpoints."""
    subs = list_subscriptions()
    if not subs:
        return 0

    priv_path, _ = _ensure_vapid_keys()
    data_str = json.dumps(payload)

    def _dispatch() -> Tuple[int, List[str]]:
        sent = 0
        expired: List[str] = []
        for sub in subs:
            endpoint = sub.get("endpoint", "")
            try:
                webpush(
                    subscription_info=sub,
                    data=data_str,
                    vapid_private_key=str(priv_path),
                    vapid_claims=dict(VAPID_CLAIMS),
                )
                sent += 1
            except WebPushException as ex:
                status_code = ex.response.status_code if ex.response is not None else None
                if status_code in (404, 410):
                    if endpoint:
                        expired.append(endpoint)
                else:
                    logger.warning("WebPush failed for %s: %s", endpoint, ex)
            except Exception as ex:
                logger.warning("Unexpected push error for %s: %s", endpoint, ex)
        return sent, expired

    sent_count, expired_endpoints = await asyncio.to_thread(_dispatch)
    for ep in expired_endpoints:
        remove_subscription(ep)
    return sent_count


def _build_permission_key(conv_id: str, perm: Dict[str, Any]) -> Tuple[str, Optional[int], str, str]:
    return (
        conv_id,
        perm.get("step_index"),
        str(perm.get("action") or ""),
        str(perm.get("target") or ""),
    )


async def _poll_once(hub_client: Any) -> None:
    """Check recent live conversations for pending_permissions and notify once per request."""
    if not hub_client or not list_subscriptions():
        return

    try:
        convs = await hub_client.list_conversations()
    except Exception:
        return

    if not convs:
        _seen_permission_keys.clear()
        return

    watched = convs[:MAX_WATCHED_CONVERSATIONS]
    watched_ids = {c.get("conversation_id") for c in watched if c.get("conversation_id")}
    polled_ok_ids: Set[str] = set()
    active_keys: Set[Tuple[str, Optional[int], str, str]] = set()

    for conv in watched:
        conv_id = conv.get("conversation_id")
        if not conv_id:
            continue
        title = conv.get("title") or "Session"
        try:
            detail = await hub_client.get_conversation_steps(conv_id, limit=80)
        except Exception:
            continue

        polled_ok_ids.add(conv_id)
        for perm in detail.get("pending_permissions", []):
            key = _build_permission_key(conv_id, perm)
            active_keys.add(key)
            if key in _seen_permission_keys:
                continue

            _seen_permission_keys.add(key)
            action = perm.get("action") or "action"
            target = perm.get("target") or ""
            description = perm.get("description") or f"{action}: {target}".strip(": ")
            payload = {
                "title": f"Permission Needed: {title}",
                "body": description,
                "conv_id": conv_id,
                "permission": perm,
            }
            await send_push_to_all(payload)

    # Clear resolved permission keys for conversations we successfully polled or no longer watch.
    stale = {
        k
        for k in _seen_permission_keys
        if (k[0] in polled_ok_ids or k[0] not in watched_ids) and k not in active_keys
    }
    _seen_permission_keys.difference_update(stale)


async def _watcher_loop(hub_client: Any, conv_manager: Any = None) -> None:
    while True:
        try:
            await _poll_once(hub_client)
        except asyncio.CancelledError:
            raise
        except Exception as ex:
            logger.debug("Push watcher poll error: %s", ex)
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


def start_watcher(hub_client: Any = None, conv_manager: Any = None) -> asyncio.Task:
    """Start the background permission watcher task if not already running."""
    global _watcher_task
    if _watcher_task is not None and not _watcher_task.done():
        return _watcher_task
    _watcher_task = asyncio.create_task(_watcher_loop(hub_client, conv_manager))
    return _watcher_task


async def stop_watcher() -> None:
    """Stop the background permission watcher task if running."""
    global _watcher_task
    if _watcher_task is None:
        return
    task = _watcher_task
    _watcher_task = None
    if not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
