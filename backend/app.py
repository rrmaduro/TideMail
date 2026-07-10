"""tidemail FastAPI backend. Run with: python app.py"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

import netfix  # noqa: F401  # applies IPv4-first DNS ordering; must import before any network call
import auth
import classifier
import config as config_module
import graph
import watcher
from paths import DATA_DIR, FRONTEND_DIST

HOST = "127.0.0.1"  # bind to loopback only — tidemail is a local, single-user app
PORT = 8000


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Resume periodic scanning on boot if the user enabled auto-scan.
    cfg = config_module.load_config()
    if cfg.auto_scan:
        watcher.start(cfg.check_interval_minutes)
    yield
    await watcher.stop()


app = FastAPI(title="tidemail", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

# CORS is only needed for the Angular dev server (ng serve on :4200). In production the
# SPA is served same-origin by this app, so no cross-origin requests occur.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    """Defense-in-depth headers. The app is local-only, but these cost nothing and
    harden against clickjacking / MIME-sniffing if a browser ever mishandles a response."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response

# All endpoints live under /api so they never collide with the SPA's client-side
# routes (e.g. /folders, /activity), which must fall through to index.html.
api = APIRouter(prefix="/api")


# ---------- status / watcher control ----------


@api.get("/status")
def get_status():
    return watcher.get_status()


@api.post("/start")
async def start_watcher():
    cfg = config_module.load_config()
    watcher.start(cfg.check_interval_minutes)
    return watcher.get_status()


@api.post("/stop")
async def stop_watcher():
    await watcher.stop()
    return watcher.get_status()


@api.post("/run-now")
@api.post("/scan")
async def run_scan():
    try:
        result = await watcher.run_scan()
    except watcher.ScanInProgress as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (auth.AuthNotConfigured, auth.AuthRequired) as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except classifier.ClassifierError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except graph.GraphAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {**result, **watcher.get_status()}


# ---------- activity ----------


@api.get("/activity")
def get_activity(
    folder: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    urgent_only: bool = False,
    q: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
):
    return watcher.get_activity(
        folder=folder, since=since, until=until, urgent_only=urgent_only, q=q, page=page, page_size=page_size
    )


@api.get("/activity/summary")
def get_activity_summary():
    return watcher.get_activity_summary()


@api.post("/activity/clear")
def clear_activity():
    watcher.clear_activity()
    return {"ok": True}


# ---------- folders ----------


@api.get("/folders")
def get_folders():
    cfg = config_module.get_full_config()
    try:
        token = auth.get_token(cfg["client_id"])
    except (auth.AuthNotConfigured, auth.AuthRequired):
        return {"folders": []}

    try:
        raw_folders = graph.list_ai_folders(token, cfg["parent_folder_name"])
        folders = []
        for f in raw_folders:
            last_messages = graph.list_messages_in_folder(token, f["id"], top=1)
            last_message = last_messages[0] if last_messages else None
            folders.append(
                {
                    "id": f["id"],
                    "name": f["displayName"],
                    "count": f.get("totalItemCount", 0),
                    "last_message": {
                        "subject": last_message.get("subject", ""),
                        "received": last_message.get("receivedDateTime"),
                        "sender_name": last_message.get("from", {}).get("emailAddress", {}).get("name", ""),
                    }
                    if last_message
                    else None,
                }
            )
        return {"folders": folders}
    except graph.GraphAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@api.get("/folders/{folder_id}/emails")
def get_folder_emails(folder_id: str, top: int = Query(default=5, ge=1, le=50)):
    cfg = config_module.get_full_config()
    try:
        token = auth.get_token(cfg["client_id"])
    except (auth.AuthNotConfigured, auth.AuthRequired) as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    try:
        messages = graph.list_messages_in_folder(token, folder_id, top=top)
    except graph.GraphAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"messages": messages}


class FolderRenameRequest(BaseModel):
    name: str


def _folder_token():
    cfg = config_module.get_full_config()
    try:
        return auth.get_token(cfg["client_id"])
    except (auth.AuthNotConfigured, auth.AuthRequired) as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@api.patch("/folders/{folder_id}")
def rename_folder(folder_id: str, body: FolderRenameRequest):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name cannot be empty")
    token = _folder_token()
    try:
        updated = graph.rename_folder(token, folder_id, name)
    except graph.GraphAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"id": updated.get("id", folder_id), "name": updated.get("displayName", name)}


@api.delete("/folders/{folder_id}")
def delete_folder(folder_id: str):
    token = _folder_token()
    try:
        graph.delete_folder(token, folder_id)
    except graph.GraphAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True}


# ---------- config ----------


@api.get("/config")
def get_config():
    return {
        **config_module.load_config().model_dump(),
        "ai_configured": config_module.is_ai_configured(),
        "authenticated": auth.is_authenticated(),
        "data_dir": str(DATA_DIR),
    }


@api.post("/config")
def post_config(update: config_module.ConfigUpdate):
    updated = config_module.update_config(update)
    return updated.model_dump()


# ---------- auth ----------


class AuthStartRequest(BaseModel):
    client_id: Optional[str] = None


@api.post("/auth/start")
def auth_start(body: AuthStartRequest):
    client_id = body.client_id
    if client_id:
        config_module.update_config(config_module.ConfigUpdate(client_id=client_id))
    else:
        client_id = config_module.load_config().client_id

    try:
        return auth.start_device_flow(client_id)
    except auth.AuthNotConfigured as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@api.get("/auth/status")
def auth_status():
    return auth.get_auth_status()


@api.post("/auth/disconnect")
def auth_disconnect():
    auth.disconnect()
    return {"ok": True}


# ---------- AI test ----------


class TestAIRequest(BaseModel):
    provider: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None


@api.post("/test-ai")
def test_ai(body: TestAIRequest = TestAIRequest()):
    cfg = config_module.get_full_config()
    overrides = body.model_dump(exclude_unset=True)
    cfg.update({k: v for k, v in overrides.items() if v is not None})
    return classifier.test_ai_connection(cfg)


# ---------- reset ----------


@api.post("/reset")
def reset_all_data():
    auth.disconnect()
    for path in (watcher.PROCESSED_PATH, watcher.ACTIVITY_PATH, config_module.CONFIG_PATH, config_module.SECRETS_PATH):
        if path.exists():
            path.unlink()
    return {"ok": True}


# Register all API routes under /api before mounting the SPA.
app.include_router(api)


# ---------- static frontend ----------

class SPAStaticFiles(StaticFiles):
    """StaticFiles that falls back to index.html on 404 so Angular's client-side
    routes (e.g. /dashboard, /settings) work on deep-link and browser refresh."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


# FRONTEND_DIST is resolved in paths.py (works from source and when packaged).
if (FRONTEND_DIST / "index.html").exists():
    # Mounted last, so the API routes above take precedence; everything else is the SPA.
    app.mount("/", SPAStaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
else:

    @app.get("/")
    def root_placeholder():
        return {"message": "tidemail backend is running. Frontend not built yet — see /docs for the API."}


if __name__ == "__main__":
    import desktop

    desktop.run(app)
