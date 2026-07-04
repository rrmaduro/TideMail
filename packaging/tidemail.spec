# PyInstaller spec — bundles the FastAPI backend + built Angular frontend into a single
# `tidemail` executable. Build with:  python scripts/build_desktop.py
# (or directly:  pyinstaller packaging/tidemail.spec  from the repo root)

import os
from PyInstaller.utils.hooks import collect_submodules

ROOT = os.path.abspath(os.getcwd())
BACKEND = os.path.join(ROOT, "backend")
FRONTEND_DIST = os.path.join(ROOT, "frontend", "dist", "browser")

if not os.path.exists(os.path.join(FRONTEND_DIST, "index.html")):
    raise SystemExit(
        "frontend/dist/browser/index.html not found — build the UI first:\n"
        "    cd frontend && npm install && npm run build"
    )

hiddenimports = (
    collect_submodules("uvicorn")
    + [
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
        "anyio._backends._asyncio",
    ]
)

# Ship the built SPA under "frontend_dist" (paths.py looks for it there when frozen).
datas = [(FRONTEND_DIST, "frontend_dist")]

a = Analysis(
    [os.path.join(BACKEND, "app.py")],
    pathex=[BACKEND],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="tidemail",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    runtime_tmpdir=None,
    console=False,          # windowed: opens the browser, no terminal window
    disable_windowed_traceback=False,
    icon=os.path.join(ROOT, "packaging", "tidemail.ico") if os.path.exists(
        os.path.join(ROOT, "packaging", "tidemail.ico")
    ) else None,
)
