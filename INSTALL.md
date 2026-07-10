# Installing tidemail

Three ways to run tidemail, from easiest to most hands-on.

---

## Option 1 — One-click launcher (recommended)

No commands to remember. The launcher sets up Python deps and builds the UI the first time, then
starts the app and opens your browser.

- **Windows:** double-click **`run.bat`**
- **macOS / Linux:** run **`./run.sh`** (first: `chmod +x run.sh`)

**Requirements:** [Python 3.10+](https://www.python.org/) and [Node.js 20+](https://nodejs.org/) on
your PATH. (Node is only used the first time, to build the interface.)

First launch takes a couple of minutes (installing dependencies + building). After that it's instant.

---

## Option 2 — Packaged desktop app (single executable)

Build a standalone **`tidemail`** executable you can double-click — no Python or Node needed to *run*
it (only to *build* it once).

```bash
# from the repo root, with your venv active
pip install -r requirements-dev.txt
python scripts/build_desktop.py
```

This builds the frontend, then bundles everything with PyInstaller into:

```
dist/tidemail.exe        (Windows)
dist/tidemail            (macOS / Linux)
```

The packaged app opens in its **own native desktop window** (no browser tab) via the OS webview
(Edge WebView2 on Windows, WebKit on macOS, WebKitGTK on Linux). If no native webview is available it
falls back to opening your default browser.

Double-click it to launch. It opens your browser automatically at <http://127.0.0.1:8000>.

> [!NOTE]
> **Where your data lives (packaged app):** the executable is read-only, so tidemail stores your
> settings, API key, sign-in token, and activity log in a **`tidemail-data`** folder next to the
> executable — or, if that location isn't writable, in your user data directory
> (`%LOCALAPPDATA%\tidemail` on Windows, `~/.tidemail` elsewhere). Keep this folder private; it
> contains your credentials.

> [!TIP]
> Distributing it? On macOS you'll likely need to codesign/notarize the binary, and on Windows an
> unsigned exe may trigger SmartScreen. For personal use you can bypass those prompts.

---

## Option 3 — Manual (for development)

```bash
python -m venv venv
venv\Scripts\activate            # or: source venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python backend/app.py
```

For hot-reload development, run the backend and the Angular dev server separately — see
[CONTRIBUTING.md](CONTRIBUTING.md).

---

## After it starts

A first-run wizard walks you through:
1. **Connect Outlook** — paste a Microsoft client ID and sign in. See
   [docs/OUTLOOK_SETUP.md](docs/OUTLOOK_SETUP.md).
2. **Connect AI** — pick a provider, paste your API key, choose a model.
3. **Preferences** — folder settings.

Then press **Sort entire inbox**. 🌊
