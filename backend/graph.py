"""Thin httpx wrapper over the Microsoft Graph mail API."""
from __future__ import annotations

import html
import re
from datetime import datetime, timezone
from typing import Optional

import httpx

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
MESSAGE_SELECT = "id,subject,from,receivedDateTime,bodyPreview,body,parentFolderId"

# Well-known Outlook folders scanned as "unsorted" sources, alongside the inbox.
SOURCE_WELLKNOWN = ["inbox", "junkemail", "deleteditems"]

# In-memory folder name -> id cache, keyed by (parent_name, folder_name). Rebuilt lazily
# from Graph on first use each process run; not worth persisting to disk.
_folder_cache: dict[tuple[str, str], str] = {}


def _odata_escape(value: str) -> str:
    """Escape a string literal for an OData $filter (single quotes are doubled)."""
    return value.replace("'", "''")


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t\r\f\v]+")
_BLANKLINES_RE = re.compile(r"\n\s*\n\s*")


def html_to_text(body: dict) -> str:
    """Extract readable plain text from a Graph message `body` ({contentType, content})."""
    if not body:
        return ""
    content = body.get("content", "") or ""
    if body.get("contentType", "text").lower() != "html":
        return content.strip()
    # Drop script/style blocks, turn breaks into newlines, strip remaining tags, unescape entities.
    content = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", content)
    content = re.sub(r"(?i)<br\s*/?>", "\n", content)
    content = re.sub(r"(?i)</(p|div|tr|li|h[1-6])>", "\n", content)
    content = _TAG_RE.sub(" ", content)
    content = html.unescape(content)
    content = _WS_RE.sub(" ", content)
    content = _BLANKLINES_RE.sub("\n", content)
    return content.strip()


class GraphAPIError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _request(method: str, path: str, token: str, **kwargs) -> dict:
    url = path if path.startswith("http") else f"{GRAPH_BASE}{path}"
    with httpx.Client(timeout=30) as client:
        resp = client.request(method, url, headers=_headers(token), **kwargs)
    if resp.status_code >= 400:
        try:
            message = resp.json().get("error", {}).get("message", resp.text)
        except Exception:  # noqa: BLE001
            message = resp.text
        raise GraphAPIError(resp.status_code, message)
    if resp.status_code == 204 or not resp.content:
        return {}
    return resp.json()


def _find_child_folder(token: str, parent_id: str, name: str) -> Optional[str]:
    data = _request(
        "GET",
        f"/me/mailFolders/{parent_id}/childFolders",
        token,
        params={"$filter": f"displayName eq '{_odata_escape(name)}'", "$select": "id,displayName"},
    )
    values = data.get("value", [])
    return values[0]["id"] if values else None


def _find_top_level_folder(token: str, name: str) -> Optional[str]:
    data = _request(
        "GET",
        "/me/mailFolders",
        token,
        params={"$filter": f"displayName eq '{_odata_escape(name)}'", "$select": "id,displayName"},
    )
    values = data.get("value", [])
    return values[0]["id"] if values else None


def ensure_parent_folder(token: str, parent_name: str) -> str:
    cache_key = ("__root__", parent_name)
    if cache_key in _folder_cache:
        return _folder_cache[cache_key]

    folder_id = _find_top_level_folder(token, parent_name)
    if not folder_id:
        created = _request("POST", "/me/mailFolders", token, json={"displayName": parent_name})
        folder_id = created["id"]

    _folder_cache[cache_key] = folder_id
    return folder_id


def _ensure_child_of(token: str, parent_id: str, name: str, cache_key: tuple) -> str:
    if cache_key in _folder_cache:
        return _folder_cache[cache_key]
    folder_id = _find_child_folder(token, parent_id, name)
    if not folder_id:
        created = _request(
            "POST", f"/me/mailFolders/{parent_id}/childFolders", token, json={"displayName": name}
        )
        folder_id = created["id"]
    _folder_cache[cache_key] = folder_id
    return folder_id


def ensure_folder(token: str, parent_name: str, folder_name: str) -> str:
    parent_id = ensure_parent_folder(token, parent_name)
    return _ensure_child_of(token, parent_id, folder_name, (parent_name, folder_name))


def ensure_category_path(token: str, parent_name: str, category: str, subcategory: str = "") -> str:
    """Ensure `AI Sorted / Category [/ Subcategory]` exists; return the deepest folder id."""
    category_id = ensure_folder(token, parent_name, category)
    subcategory = (subcategory or "").strip()
    if not subcategory or subcategory.lower() == category.lower():
        return category_id
    return _ensure_child_of(token, category_id, subcategory, (parent_name, category, subcategory))


def list_new_messages(token: str, since: Optional[datetime] = None, top: int = 25) -> list[dict]:
    params = {
        "$top": str(top),
        "$select": MESSAGE_SELECT,
        "$orderby": "receivedDateTime asc",
    }
    if since is not None:
        iso = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        params["$filter"] = f"receivedDateTime ge {iso}"

    data = _request("GET", "/me/mailFolders/inbox/messages", token, params=params)
    return data.get("value", [])


def list_all_inbox_messages(token: str, max_messages: int = 500, page_size: int = 50) -> list[dict]:
    """Page through the entire current inbox (oldest first) up to max_messages.

    Follows Graph's @odata.nextLink so a scan sees everything sitting in the inbox,
    not just recent mail. Capped to avoid runaway cost on very large inboxes.
    """
    messages: list[dict] = []
    next_url = "/me/mailFolders/inbox/messages"
    params: Optional[dict] = {
        "$top": str(min(page_size, max_messages)),
        "$select": MESSAGE_SELECT,
        "$orderby": "receivedDateTime asc",
    }

    while next_url and len(messages) < max_messages:
        data = _request("GET", next_url, token, params=params)
        messages.extend(data.get("value", []))
        next_url = data.get("@odata.nextLink")
        params = None  # nextLink already encodes the query

    return messages[:max_messages]


def move_message(token: str, message_id: str, destination_folder_id: str) -> None:
    _request("POST", f"/me/messages/{message_id}/move", token, json={"destinationId": destination_folder_id})


def _list_children(token: str, folder_id: str) -> list[dict]:
    data = _request(
        "GET",
        f"/me/mailFolders/{folder_id}/childFolders",
        token,
        params={"$select": "id,displayName,totalItemCount,childFolderCount", "$top": "100"},
    )
    return data.get("value", [])


def list_ai_folders(token: str, parent_name: str) -> list[dict]:
    parent_id = ensure_parent_folder(token, parent_name)
    return _list_children(token, parent_id)


def list_category_folder_ids(token: str, parent_name: str) -> list[str]:
    """IDs of the top-level category folders under the parent (not their subfolders)."""
    return [f["id"] for f in list_ai_folders(token, parent_name)]


def _read_folder_messages(token: str, ref: str, remaining: int, page_size: int = 50) -> list[dict]:
    messages: list[dict] = []
    next_url: Optional[str] = f"/me/mailFolders/{ref}/messages"
    params: Optional[dict] = {
        "$top": str(min(page_size, remaining)),
        "$select": MESSAGE_SELECT,
        "$orderby": "receivedDateTime desc",
    }
    while next_url and len(messages) < remaining:
        data = _request("GET", next_url, token, params=params)
        messages.extend(data.get("value", []))
        next_url = data.get("@odata.nextLink")
        params = None
    return messages[:remaining]


def list_scan_messages(token: str, parent_name: str, max_total: int = 500) -> list[dict]:
    """Read messages to sort from across the mailbox: Inbox, Junk Email, Deleted Items,
    and the top-level AI-Sorted category folders (so already-sorted mail can be refined
    into subfolders). Subfolders themselves are not read, so sorted mail stays put.
    Each message carries `parentFolderId`, used to skip mail already in its target folder.
    """
    refs: list[str] = list(SOURCE_WELLKNOWN)
    try:
        refs += list_category_folder_ids(token, parent_name)
    except GraphAPIError:
        pass  # parent folder may not exist yet on a first run

    messages: list[dict] = []
    seen: set[str] = set()
    for ref in refs:
        if len(messages) >= max_total:
            break
        try:
            batch = _read_folder_messages(token, ref, max_total - len(messages))
        except GraphAPIError:
            continue  # a source folder may be missing/inaccessible; skip it
        for m in batch:
            if m["id"] not in seen:
                seen.add(m["id"])
                messages.append(m)
    return messages[:max_total]


def list_messages_in_folder(token: str, folder_id: str, top: int = 5) -> list[dict]:
    data = _request(
        "GET",
        f"/me/mailFolders/{folder_id}/messages",
        token,
        params={"$top": str(top), "$select": MESSAGE_SELECT, "$orderby": "receivedDateTime desc"},
    )
    return data.get("value", [])


def list_messages_in_folder(token: str, folder_id: str, top: int = 5) -> list[dict]:
    data = _request(
        "GET",
        f"/me/mailFolders/{folder_id}/messages",
        token,
        params={"$top": str(top), "$select": MESSAGE_SELECT, "$orderby": "receivedDateTime desc"},
    )
    return data.get("value", [])


def rename_folder(token: str, folder_id: str, new_name: str) -> dict:
    updated = _request("PATCH", f"/me/mailFolders/{folder_id}", token, json={"displayName": new_name})
    _folder_cache.clear()  # names changed; drop the cached name->id map
    return updated


def delete_folder(token: str, folder_id: str) -> None:
    """Delete a folder (Graph moves it and its contents to Deleted Items — recoverable)."""
    _request("DELETE", f"/me/mailFolders/{folder_id}", token)
    _folder_cache.clear()
