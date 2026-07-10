"""Launch tidemail as a native desktop app: the FastAPI server runs in a background
thread and the UI is shown in a native OS window (via pywebview / Edge WebView2 on
Windows) — no browser tab.

Fallbacks, in order:
  1. TIDEMAIL_SERVER_ONLY=1  -> run the server only (headless; used for dev/tests).
  2. pywebview installed      -> native window (the normal desktop experience).
  3. pywebview missing        -> run the server and open the default browser.
"""
from __future__ import annotations

import os
import threading
import time
import webbrowser

import httpx
import uvicorn

HOST = "127.0.0.1"
PORT = 8000
URL = f"http://{HOST}:{PORT}"


def _make_server(app) -> uvicorn.Server:
    config = uvicorn.Config(app, host=HOST, port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    # We run in a background thread, so don't let uvicorn install signal handlers
    # (those only work on the main thread and would raise).
    server.install_signal_handlers = lambda: None
    return server


def _wait_until_ready(timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            httpx.get(f"{URL}/api/status", timeout=1.0)
            return True
        except Exception:  # noqa: BLE001 - server not up yet
            time.sleep(0.15)
    return False


def run(app) -> None:
    if os.environ.get("TIDEMAIL_SERVER_ONLY") == "1":
        _make_server(app).run()
        return

    try:
        import webview  # pywebview
    except ImportError:
        webview = None

    if webview is None:
        # No native webview available — serve and open the browser instead.
        threading.Timer(1.5, lambda: webbrowser.open(URL)).start()
        _make_server(app).run()
        return

    # Native desktop window. Server on a daemon thread; webview owns the main thread
    # and blocks until the window is closed, at which point the process exits.
    server = _make_server(app)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _wait_until_ready()

    webview.create_window(
        "tidemail",
        URL,
        width=1240,
        height=840,
        min_size=(900, 640),
        background_color="#0b1622",
    )
    webview.start()
