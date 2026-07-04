"""Single source of truth for filesystem paths, correct whether tidemail runs from
source (``python backend/app.py``) or as a packaged executable (PyInstaller).

- RESOURCE_DIR : read-only bundled assets (the built frontend).
- FRONTEND_DIST: the Angular ``index.html`` directory to serve.
- DATA_DIR     : writable runtime state (config, secrets, token cache, activity).

When frozen we must NOT write inside the bundle (it's extracted to a temp dir that
disappears), so DATA_DIR points at a stable, user-writable location.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def _writable(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".write-test"
        probe.touch()
        probe.unlink()
        return True
    except Exception:  # noqa: BLE001
        return False


def _user_data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_DATA_HOME")
    if base:
        return Path(base) / "tidemail"
    return Path.home() / ".tidemail"


if is_frozen():
    RESOURCE_DIR = Path(sys._MEIPASS)  # type: ignore[attr-defined]
    FRONTEND_DIST = RESOURCE_DIR / "frontend_dist"

    # Default to a STABLE per-user data directory so the app remembers your settings,
    # API key, and sign-in across restarts and even if you move/replace the executable
    # (so you never re-enter them). Opt into "portable" mode — data kept next to the
    # exe — by creating a "tidemail-data" folder beside it.
    _beside_exe = Path(sys.executable).resolve().parent / "tidemail-data"
    if _beside_exe.exists() and _writable(_beside_exe):
        DATA_DIR = _beside_exe
    else:
        _user = _user_data_dir()
        DATA_DIR = _user if _writable(_user) else _beside_exe
else:
    BACKEND_DIR = Path(__file__).resolve().parent
    RESOURCE_DIR = BACKEND_DIR.parent
    DATA_DIR = BACKEND_DIR / "data"

    _dist = RESOURCE_DIR / "frontend" / "dist"
    FRONTEND_DIST = _dist / "browser" if (_dist / "browser" / "index.html").exists() else _dist

DATA_DIR.mkdir(parents=True, exist_ok=True)
