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
import rules as rules_module
from paths import DATA_DIR

PROCESSED_PATH = DATA_DIR / "processed.json"
ACTIVITY_PATH = DATA_DIR / "activity.json"
MOVES_PATH = DATA_DIR / "last_moves.json"  # moves from the most recent scan, for one-click undo

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
    q: Optional[str] = None,
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
    if q:
        needle = q.lower()
        activity = [
            a
            for a in activity
            if needle in a.get("sender_name", "").lower()
            or needle in a.get("sender_address", "").lower()
            or needle in a.get("subject", "").lower()
        ]

    total = len(activity)
    start = (page - 1) * page_size
    page_items = activity[start : start + page_size]
    return {"items": page_items, "total": total, "page": page, "page_size": page_size}


def get_activity_summary() -> dict:
    activity = _load_activity()
    return {
        "total": len(activity),
        "sorted": sum(1 for a in activity if not a.get("error")),
        "skipped": sum(1 for a in activity if a.get("error")),
        "urgent": sum(1 for a in activity if a.get("urgent")),
    }


def clear_activity() -> None:
    _write_json(ACTIVITY_PATH, [])


def undo_available() -> int:
    """How many moves from the last scan can be undone."""
    return len(_read_json(MOVES_PATH, []))


def undo_last_scan(token: str) -> dict:
    """Move every email from the last scan back to the folder it came from."""
    moves = _read_json(MOVES_PATH, [])
    undone = 0
    failed = 0
    for mv in moves:
        dest = mv.get("from_folder_id")
        if not dest:
            failed += 1
            continue
        try:
            graph.move_message(token, mv["id"], dest)
            undone += 1
        except Exception:  # noqa: BLE001 - a message may have moved/been deleted since; skip it
            failed += 1
    _write_json(MOVES_PATH, [])  # consumed — nothing left to undo
    return {"undone": undone, "failed": failed}


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


class _Taxonomy:
    """Tracks the AI-Sorted folder tree during a scan and resolves each classification to a
    target that keeps the total folder count within the cap.

    Resolution order when a proposed folder is new and the cap is reached:
      1. if the category exists, flatten (file into the category, no new subfolder);
      2. else file into the overflow folder (creating it only if that still fits);
      3. else file into an existing category (never exceed the cap).
    """

    def __init__(self, taxonomy: list[dict], max_total: int, max_categories: int, overflow: str):
        self._subs: dict[str, set[str]] = {}   # category(lower) -> {subfolder(lower)}
        self._display: dict[str, str] = {}     # category(lower) -> original display name
        for cat in taxonomy:
            cl = cat["name"].lower()
            self._subs[cl] = {s["name"].lower() for s in cat["subfolders"]}
            self._display[cl] = cat["name"]
        self.max_total = max(1, max_total)
        self.max_categories = max(1, max_categories)
        self.overflow = overflow or "Misc"

    @property
    def count(self) -> int:
        return sum(1 + len(subs) for subs in self._subs.values())

    def _add_category(self, category: str) -> None:
        self._subs[category.lower()] = set()
        self._display[category.lower()] = category

    def resolve(self, category: str, subcategory: str) -> tuple[str, str]:
        category = (category or "Uncategorized").strip()[:60] or "Uncategorized"
        subcategory = (subcategory or "").strip()[:60]
        if subcategory.lower() == category.lower():
            subcategory = ""
        cl = category.lower()

        if cl in self._subs:  # category already exists
            if not subcategory or subcategory.lower() in self._subs[cl]:
                return self._display[cl], (subcategory if subcategory and subcategory.lower() in self._subs[cl] else "")
            if self.count + 1 <= self.max_total:  # room for the new subfolder
                self._subs[cl].add(subcategory.lower())
                return self._display[cl], subcategory
            return self._display[cl], ""  # cap reached — flatten into the category

        # category is new
        need = 1 + (1 if subcategory else 0)
        if len(self._subs) < self.max_categories and self.count + need <= self.max_total:
            self._add_category(category)
            if subcategory:
                self._subs[cl].add(subcategory.lower())
            return category, subcategory

        # can't add a new category — route to overflow, or an existing category if even that won't fit
        ol = self.overflow.lower()
        if ol in self._subs:
            return self._display[ol], ""
        if self.count + 1 <= self.max_total:
            self._add_category(self.overflow)
            return self.overflow, ""
        # completely full: reuse the first existing category
        first = next(iter(self._display.values()))
        return first, ""


async def _file_message(token: str, message: dict, result, parent_folder_name: str) -> Optional[dict]:
    """File a classified message into `AI Sorted / Category [/ Subcategory]` (already resolved
    to fit the folder cap). Returns the logged entry, or None if it's already in place."""
    category = (result.folder or "Uncategorized").strip()
    subcategory = (getattr(result, "subfolder", "") or "").strip()
    display = category + (f" / {subcategory}" if subcategory and subcategory.lower() != category.lower() else "")

    source_id = message.get("parentFolderId")
    try:
        target_id = await asyncio.to_thread(
            graph.ensure_category_path, token, parent_folder_name, category, subcategory
        )
        if source_id == target_id:
            return None  # already sorted into the right folder — skip
        await asyncio.to_thread(graph.move_message, token, message["id"], target_id)
    except Exception as exc:  # noqa: BLE001 - isolate per message
        return _error_entry(message, f"Move failed: {exc}")

    return {
        **_base_entry(message),
        "folder": display,
        "urgent": result.urgent,
        "reasoning": result.reasoning,
        "raw_response": result.raw,
        "error": False,
        "from_folder_id": source_id,   # for undo (not shown in the UI)
        "to_folder_id": target_id,
    }


async def run_scan(reevaluate: bool = False) -> dict:
    """Sort mail into themed folders.

    reevaluate=False (incremental): only mail outside the AI-Sorted tree is read.
    reevaluate=True (Reorganize everything): re-read and re-classify the whole mailbox,
    moving already-filed mail as the taxonomy shifts, within a hard total-folder cap.
    """
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
            overflow_folder = cfg.get("overflow_folder_name") or OVERFLOW_FOLDER
            max_scan = cfg.get("max_scan_messages", MAX_SCAN_MESSAGES)
            max_total_folders = cfg.get("max_total_folders", 25)

            messages = await asyncio.to_thread(
                graph.list_scan_messages, token, parent_folder_name, max_scan, reevaluate
            )
            # Build the taxonomy resolver from the current folder tree — it keeps the total
            # folder count (categories + subfolders) within the cap as mail is filed.
            taxonomy = await asyncio.to_thread(graph.list_ai_taxonomy, token, parent_folder_name)
            # One hard cap on the total folder count; categories may use all of it.
            resolver = _Taxonomy(taxonomy, max_total_folders, max_total_folders, overflow_folder)
            existing_folders = [c["name"] for c in taxonomy]

            _state["progress"]["total"] = len(messages)
            sorted_count = 0
            error_count = 0
            moves: list[dict] = []  # for one-click undo of this scan

            def _record(entry: Optional[dict]) -> None:
                """Log a filed message and remember its move so it can be undone."""
                nonlocal sorted_count, error_count
                if entry is None:
                    return
                _append_activity(entry)
                if entry["error"]:
                    error_count += 1
                else:
                    sorted_count += 1
                    if entry.get("to_folder_id"):
                        moves.append({
                            "id": entry["id"],
                            "from_folder_id": entry.get("from_folder_id"),
                            "to_folder_id": entry["to_folder_id"],
                            "subject": entry["subject"],
                            "folder": entry["folder"],
                        })
                _state["progress"]["sorted"] = sorted_count
                _state["progress"]["errors"] = error_count

            # Your rules win over the AI: "never touch" mail is left alone, and pinned
            # senders/domains are filed directly — no model call, so they cost nothing.
            rules_doc = rules_module.load()
            to_classify: list[dict] = []
            for message in messages:
                if rules_module.is_never(message, rules_doc):
                    _state["progress"]["scanned"] += 1
                    continue
                pin = rules_module.match(message, rules_doc)
                if pin:
                    _state["progress"]["current"] = message.get("subject", "(no subject)")
                    cat, sub = resolver.resolve(pin.folder, pin.subfolder)
                    result = classifier.ClassificationResult(
                        folder=cat,
                        subfolder=sub,
                        urgent=False,
                        reasoning=f"Matched your rule: {pin.type} “{pin.value}”",
                        raw="",
                    )
                    _record(await _file_message(token, message, result, parent_folder_name))
                    _state["progress"]["scanned"] += 1
                else:
                    to_classify.append(message)

            # Classify the rest in batches: one API call files up to BATCH_SIZE emails, so a
            # whole-mailbox scan uses few requests and stays under rate limits.
            for batch in _chunks(to_classify, classifier.BATCH_SIZE):
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
                        result.folder, result.subfolder = resolver.resolve(result.folder, result.subfolder)
                        entry = await _file_message(token, message, result, parent_folder_name)

                    _state["progress"]["scanned"] += 1
                    _record(entry)  # None = already in the right folder, nothing to do

            # Persist this scan's moves so the user can undo them in one click.
            _write_json(MOVES_PATH, moves)

            # Tidy up: remove folders left empty by this sort.
            deleted_folders = 0
            if cfg.get("delete_empty_folders", True):
                _state["progress"]["current"] = "Cleaning up empty folders…"
                deleted_folders = await asyncio.to_thread(
                    graph.delete_empty_ai_folders, token, parent_folder_name
                )

            _state["last_scan"] = datetime.now(timezone.utc).isoformat()
            _state["progress"]["current"] = None
            return {
                "scanned": len(messages),
                "sorted": sorted_count,
                "errors": error_count,
                "deleted_folders": deleted_folders,
            }
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
