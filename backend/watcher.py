"""Inbox scanning: read every email currently in the inbox, classify by theme,
move into its folder, and log everything. A scan is an explicit, on-demand full
pass (not a live watcher), though it can also run on an interval if enabled."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import auth
import classifier
import config as config_module
import graph

DATA_DIR = Path(__file__).parent / "data"
PROCESSED_PATH = DATA_DIR / "processed.json"
ACTIVITY_PATH = DATA_DIR / "activity.json"

PROCESSED_CAP = 5000
ACTIVITY_CAP = 2000
OVERFLOW_FOLDER = "Misc"
MAX_SCAN_MESSAGES = 500

_state = {
    "running": False,        # background interval loop active
    "scanning": False,       # a full scan is in progress right now
    "last_scan": None,       # ISO timestamp of last completed scan
    "last_error": None,
    "progress": {"scanned": 0, "total": 0, "current": None, "sorted": 0, "errors": 0},
}
_task: Optional[asyncio.Task] = None
_stop_event: Optional[asyncio.Event] = None
_scan_lock = asyncio.Lock()


class ScanInProgress(Exception):
    """Raised when a scan is requested while one is already running."""


def _read_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _load_processed() -> list[str]:
    return _read_json(PROCESSED_PATH, [])


def _save_processed(ids: list[str]) -> None:
    _write_json(PROCESSED_PATH, ids[-PROCESSED_CAP:])


def _load_activity() -> list[dict]:
    return _read_json(ACTIVITY_PATH, [])


def _append_activity(entry: dict) -> None:
    activity = _load_activity()
    activity.append(entry)
    _write_json(ACTIVITY_PATH, activity[-ACTIVITY_CAP:])


def get_status() -> dict:
    activity = _load_activity()
    today = datetime.now(timezone.utc).date().isoformat()
    processed_today = [a for a in activity if a["timestamp"].startswith(today)]
    return {
        "running": _state["running"],
        "scanning": _state["scanning"],
        "last_scan": _state["last_scan"],
        "last_error": _state["last_error"],
        "progress": _state["progress"],
        "emails_sorted_today": len([a for a in processed_today if not a.get("error")]),
        "urgent_flagged_today": sum(1 for a in processed_today if a.get("urgent")),
        "authenticated": auth.is_authenticated(),
    }


def get_activity(
    folder: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    urgent_only: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    activity = list(reversed(_load_activity()))  # newest first

    if folder:
        activity = [a for a in activity if a["folder"] == folder]
    if urgent_only:
        activity = [a for a in activity if a.get("urgent")]
    if since:
        activity = [a for a in activity if a["timestamp"] >= since]
    if until:
        activity = [a for a in activity if a["timestamp"] <= until]

    total = len(activity)
    start = (page - 1) * page_size
    page_items = activity[start : start + page_size]
    return {"items": page_items, "total": total, "page": page, "page_size": page_size}


def _base_entry(message: dict) -> dict:
    sender = message.get("from", {}).get("emailAddress", {})
    return {
        "id": message["id"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sender_name": sender.get("name", ""),
        "sender_address": sender.get("address", ""),
        "subject": message.get("subject", "(no subject)"),
    }


def _error_entry(message: dict, reason: str) -> dict:
    return {**_base_entry(message), "folder": "(unsorted)", "urgent": False,
            "reasoning": reason, "raw_response": "", "error": True}


def _chunks(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


async def _file_message(
    token: str, message: dict, result, parent_folder_name: str, max_folders: int, existing_folders: list[str]
) -> dict:
    """Move an already-classified message into its theme folder and build its log entry.

    Folder creation/move is isolated so one failed move never aborts the batch or scan.
    """
    target_folder = result.folder
    if target_folder not in existing_folders and len(existing_folders) >= max_folders:
        target_folder = OVERFLOW_FOLDER
    if target_folder not in existing_folders:
        existing_folders.append(target_folder)

    try:
        folder_id = await asyncio.to_thread(graph.ensure_folder, token, parent_folder_name, target_folder)
        await asyncio.to_thread(graph.move_message, token, message["id"], folder_id)
    except Exception as exc:  # noqa: BLE001 - isolate per message
        return _error_entry(message, f"Move failed: {exc}")

    return {
        **_base_entry(message),
        "folder": target_folder,
        "urgent": result.urgent,
        "reasoning": result.reasoning,
        "raw_response": result.raw,
        "error": False,
    }


async def run_scan() -> dict:
    """Full scan: read every message currently in the inbox, classify, move, log."""
    if _scan_lock.locked():
        raise ScanInProgress("A scan is already running")

    async with _scan_lock:
        cfg = config_module.get_full_config()
        if not cfg.get("client_id"):
            raise auth.AuthNotConfigured("client_id is not set")
        if not config_module.is_ai_configured():
            raise classifier.ClassifierError("AI provider is not fully configured")

        _state["scanning"] = True
        _state["last_error"] = None
        _state["progress"] = {"scanned": 0, "total": 0, "current": None, "sorted": 0, "errors": 0}

        try:
            token = await asyncio.to_thread(auth.get_token, cfg["client_id"])
            parent_folder_name = cfg["parent_folder_name"]
            max_folders = cfg["max_folder_count"]

            messages = await asyncio.to_thread(graph.list_all_inbox_messages, token, MAX_SCAN_MESSAGES)
            existing_raw = await asyncio.to_thread(graph.list_ai_folders, token, parent_folder_name)
            existing_folders = [f["displayName"] for f in existing_raw]

            processed = _load_processed()
            processed_set = set(processed)

            to_process = [m for m in messages if m["id"] not in processed_set]
            _state["progress"]["total"] = len(messages)
            _state["progress"]["scanned"] = len(messages) - len(to_process)  # already-sorted count as done
            sorted_count = 0
            error_count = 0

            # Classify in batches: one API call files up to BATCH_SIZE emails, so a whole inbox
            # scan uses few requests and stays under rate limits — the key to sorting everything.
            for batch in _chunks(to_process, classifier.BATCH_SIZE):
                _state["progress"]["current"] = f"Reading {len(batch)} emails…"
                try:
                    results = await asyncio.to_thread(classifier.classify_batch, batch, existing_folders, cfg)
                    batch_error = None
                except Exception as exc:  # noqa: BLE001 - whole-batch failure (rate limit, network)
                    results = [None] * len(batch)
                    batch_error = str(exc)
                    _state["last_error"] = str(exc)

                for message, result in zip(batch, results):
                    _state["progress"]["current"] = message.get("subject", "(no subject)")
                    if result is None:
                        entry = _error_entry(message, batch_error or "AI did not classify this email")
                    else:
                        entry = await _file_message(
                            token, message, result, parent_folder_name, max_folders, existing_folders
                        )

                    _append_activity(entry)
                    if entry["error"]:
                        error_count += 1
                    else:
                        sorted_count += 1
                        processed.append(message["id"])
                        processed_set.add(message["id"])

                    _state["progress"]["scanned"] += 1
                    _state["progress"]["sorted"] = sorted_count
                    _state["progress"]["errors"] = error_count

                _save_processed(processed)  # persist after each batch so progress survives interruption

            _state["last_scan"] = datetime.now(timezone.utc).isoformat()
            _state["progress"]["current"] = None
            return {"scanned": len(messages), "sorted": sorted_count, "errors": error_count}
        except Exception as exc:  # noqa: BLE001 - surface scan-level failures (auth/network) to the UI
            _state["last_error"] = str(exc)
            raise
        finally:
            _state["scanning"] = False


async def _loop(interval_minutes: int) -> None:
    assert _stop_event is not None
    while True:
        try:
            await run_scan()
        except ScanInProgress:
            pass
        except Exception as exc:  # noqa: BLE001 - keep the interval alive even if a scan fails
            _state["last_error"] = str(exc)

        try:
            await asyncio.wait_for(_stop_event.wait(), timeout=interval_minutes * 60)
            break  # stop() was called
        except asyncio.TimeoutError:
            continue


def start(interval_minutes: int) -> None:
    """Enable periodic scanning on an interval (optional — scanning is on-demand by default)."""
    global _task, _stop_event
    if _state["running"]:
        return
    _stop_event = asyncio.Event()
    _state["running"] = True
    _task = asyncio.create_task(_loop(interval_minutes))


async def stop() -> None:
    global _task, _stop_event
    if not _state["running"]:
        return
    _state["running"] = False
    if _stop_event:
        _stop_event.set()
    if _task:
        await _task
    _task = None
    _stop_event = None
