"""Thin httpx wrapper over the Microsoft Graph mail API."""
from __future__ import annotations

import html
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

import httpx

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
MESSAGE_SELECT = "id,subject,from,receivedDateTime,bodyPreview,body,parentFolderId"

# Well-known folders never scanned: they don't hold received mail worth sorting.
EXCLUDE_WELLKNOWN = ["sentitems", "drafts", "outbox"]

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


# One connection pool for the whole process. Reusing keep-alive connections avoids a fresh
# TCP + TLS handshake on every Graph call — the dominant cost when loading folder info, which
# fans out into dozens of small requests. httpx.Client is thread-safe, so it's also shared
# across the worker threads that fetch folders concurrently.
_client = httpx.Client(
    timeout=30,
    limits=httpx.Limits(max_keepalive_connections=20, max_connections=20),
)


def _request(method: str, path: str, token: str, **kwargs) -> dict:
    url = path if path.startswith("http") else f"{GRAPH_BASE}{path}"
    resp = _client.request(method, url, headers=_headers(token), **kwargs)
    if resp.status_code >= 400:
        try:
            message = resp.json().get("error", {}).get("message", resp.text)
        except Exception:  # noqa: BLE001
            message = resp.text
        raise GraphAPIError(resp.status_code, message)
    if resp.status_code == 204 or not resp.content:
        return {}
    return resp.json()


def _batch_get(token: str, requests: list[tuple], chunk: int = 20) -> dict:
    """Run many GET requests in as few round-trips as possible via Graph's JSON $batch.

    `requests` is a list of (key, relative_url); returns {key: response_body} for every
    request that came back < 400. Graph allows up to 20 sub-requests per $batch call and
    may return them out of order, so we map results back by the id we assigned.
    """
    out: dict = {}
    for i in range(0, len(requests), chunk):
        part = requests[i : i + chunk]
        payload = {
            "requests": [{"id": str(j), "method": "GET", "url": url} for j, (_, url) in enumerate(part)]
        }
        data = _request("POST", "/$batch", token, json=payload)
        for resp in data.get("responses", []):
            try:
                key = part[int(resp["id"])][0]
            except (ValueError, IndexError, KeyError):
                continue
            if resp.get("status", 500) < 400:
                out[key] = resp.get("body", {})
    return out


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


def folders_with_details(token: str, parent_name: str) -> list[dict]:
    """Full overview of the AI-Sorted categories for the Folders page, assembled in ~3
    round-trips using $batch instead of dozens of sequential calls.

    Returns, per top-level category (in Graph's order): id, name, direct_count, count
    (direct + subfolders), subfolders [{id, name, count}], and last_message (the newest
    message across the category and its subfolders, or None).
    """
    parent_id = ensure_parent_folder(token, parent_name)
    cats = _list_children(token, parent_id)  # 1 call: names, counts, childFolderCount
    if not cats:
        return []

    child_select = "id,displayName,totalItemCount,childFolderCount"
    msg_query = f"$select={quote(MESSAGE_SELECT)}&$top=1&$orderby={quote('receivedDateTime desc')}"

    # Phase A — one batch: children of every category that has any.
    child_reqs = [
        (c["id"], f"/me/mailFolders/{c['id']}/childFolders?$select={quote(child_select)}&$top=100")
        for c in cats
        if c.get("childFolderCount", 0)
    ]
    children_bodies = _batch_get(token, child_reqs)
    subfolders_by_cat = {cid: body.get("value", []) for cid, body in children_bodies.items()}

    # Phase B — one batch: newest message for each category folder and each non-empty subfolder.
    msg_targets: list[tuple[str, str]] = []  # (owning category id, folder id to read)
    for c in cats:
        msg_targets.append((c["id"], c["id"]))
        for s in subfolders_by_cat.get(c["id"], []):
            if s.get("totalItemCount", 0):
                msg_targets.append((c["id"], s["id"]))
    msg_reqs = [
        (idx, f"/me/mailFolders/{fid}/messages?{msg_query}") for idx, (_, fid) in enumerate(msg_targets)
    ]
    msg_bodies = _batch_get(token, msg_reqs)

    newest: dict[str, dict] = {}
    for idx, (cat_id, _) in enumerate(msg_targets):
        vals = msg_bodies.get(idx, {}).get("value", [])
        if not vals:
            continue
        m = vals[0]
        cur = newest.get(cat_id)
        if cur is None or m.get("receivedDateTime", "") > cur.get("receivedDateTime", ""):
            newest[cat_id] = m

    result: list[dict] = []
    for c in cats:
        subs = subfolders_by_cat.get(c["id"], [])
        direct = c.get("totalItemCount", 0)
        result.append(
            {
                "id": c["id"],
                "name": c["displayName"],
                "direct_count": direct,
                "count": direct + sum(s.get("totalItemCount", 0) for s in subs),
                "subfolders": [
                    {"id": s["id"], "name": s["displayName"], "count": s.get("totalItemCount", 0)}
                    for s in subs
                ],
                "last_message": newest.get(c["id"]),
            }
        )
    return result


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


def _walk_all_folders(token: str) -> list[dict]:
    """Every mail folder in the mailbox (recursively), each as {id, displayName, parentFolderId}."""
    folders: list[dict] = []
    top = _request(
        "GET", "/me/mailFolders", token,
        params={"$top": "100", "$select": "id,displayName,parentFolderId,childFolderCount"},
    ).get("value", [])
    queue = list(top)
    while queue:
        f = queue.pop()
        folders.append(f)
        if f.get("childFolderCount", 0):
            try:
                children = _list_children(token, f["id"])
            except GraphAPIError:
                children = []
            queue.extend(children)
    return folders


def _wellknown_id(token: str, name: str) -> Optional[str]:
    try:
        return _request("GET", f"/me/mailFolders/{name}", token, params={"$select": "id"}).get("id")
    except GraphAPIError:
        return None


def list_scan_messages(token: str, parent_name: str, max_total: int = 500) -> list[dict]:
    """Read messages to sort from EVERY folder in the mailbox, except:
      - Sent Items / Drafts / Outbox (not received mail), and
      - the AI-Sorted sub-subfolders (already fully sorted — avoids needless re-work).
    Top-level AI-Sorted category folders ARE read, so their mail can be refined into
    subfolders. Each message carries `parentFolderId`, used to skip mail already in place.
    """
    all_folders = _walk_all_folders(token)

    excluded: set[str] = set()
    for wk in EXCLUDE_WELLKNOWN:
        fid = _wellknown_id(token, wk)
        if fid:
            excluded.add(fid)

    # Exclude the AI-Sorted subfolders (grandchildren of the parent), which are "done".
    try:
        parent_id = ensure_parent_folder(token, parent_name)
        category_ids = {f["id"] for f in _list_children(token, parent_id)}
        for f in all_folders:
            if f.get("parentFolderId") in category_ids:
                excluded.add(f["id"])
    except GraphAPIError:
        pass

    # Scan the "incoming" folders first so they're covered before the message cap is hit.
    priority = [pid for pid in (_wellknown_id(token, n) for n in ("inbox", "junkemail", "deleteditems")) if pid]
    priority_rank = {pid: i for i, pid in enumerate(priority)}
    all_folders.sort(key=lambda f: priority_rank.get(f["id"], len(priority) + 1))

    messages: list[dict] = []
    seen: set[str] = set()
    for f in all_folders:
        if len(messages) >= max_total:
            break
        if f["id"] in excluded:
            continue
        try:
            batch = _read_folder_messages(token, f["id"], max_total - len(messages))
        except GraphAPIError:
            continue  # a folder may be inaccessible; skip it
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


def folder_children(token: str, folder_id: str) -> list[dict]:
    """Direct child folders of a folder (id, displayName, totalItemCount, childFolderCount)."""
    return _list_children(token, folder_id)


def list_messages_recursive(
    token: str, folder_id: str, top: int = 15, children: Optional[list[dict]] = None
) -> list[dict]:
    """Newest messages from a folder AND its subfolders, so the emails 'under' a themed
    folder are all accounted for when you open it.

    Pass `children` when the caller has already listed them (as /folders does) to skip a
    redundant childFolders request.
    """
    messages = list_messages_in_folder(token, folder_id, top)
    try:
        if children is None:
            children = _list_children(token, folder_id)
        for child in children:
            if child.get("totalItemCount", 0):
                messages.extend(list_messages_in_folder(token, child["id"], top))
    except GraphAPIError:
        pass
    messages.sort(key=lambda m: m.get("receivedDateTime", ""), reverse=True)
    return messages[:top]


def rename_folder(token: str, folder_id: str, new_name: str) -> dict:
    updated = _request("PATCH", f"/me/mailFolders/{folder_id}", token, json={"displayName": new_name})
    _folder_cache.clear()  # names changed; drop the cached name->id map
    return updated


def delete_folder(token: str, folder_id: str) -> None:
    """Delete a folder (Graph moves it and its contents to Deleted Items — recoverable)."""
    _request("DELETE", f"/me/mailFolders/{folder_id}", token)
    _folder_cache.clear()


_MAX_CLEANUP_PASSES = 6


def _prune_empty_leaves(token: str, folder_id: str) -> int:
    """One pass over a subtree: delete every empty folder that has no child folders.

    A folder with sons is never deleted — we recurse into it instead. Its mail may live
    in those sons.
    """
    deleted = 0
    try:
        children = _list_children(token, folder_id)
    except GraphAPIError:
        return 0

    for child in children:
        if child.get("childFolderCount", 0):
            deleted += _prune_empty_leaves(token, child["id"])
        elif child.get("totalItemCount", 0) == 0:
            try:
                delete_folder(token, child["id"])
                deleted += 1
            except GraphAPIError:
                pass
    return deleted


def delete_empty_ai_folders(token: str, parent_name: str) -> int:
    """Delete every empty folder under the AI-Sorted parent.

    Each pass removes only childless empty folders, so a parent is never deleted while it
    still has sons. Passes repeat until nothing more can be removed, which collapses a
    fully-empty tree entirely (empty leaves go, then their now-childless empty parent).
    The parent itself is never deleted, nor is anything outside it.
    """
    try:
        parent_id = ensure_parent_folder(token, parent_name)
    except GraphAPIError:
        return 0

    total = 0
    for _ in range(_MAX_CLEANUP_PASSES):
        removed = _prune_empty_leaves(token, parent_id)
        total += removed
        if removed == 0:
            break  # nothing empty left
    return total
