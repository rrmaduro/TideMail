# TideMail

**Your inbox, organized by the tide.**

AI-powered Outlook inbox organizer. TideMail watches your inbox via Microsoft Graph and
automatically sorts incoming emails into smart folders using any compatible AI API. It runs
locally: a Python/FastAPI backend does the Graph + AI work, and an Angular single-page app
gives you a calm, real-time dashboard.

## Stack

- **Backend:** Python + FastAPI, MSAL device-code auth, Microsoft Graph, pluggable AI classifier, JSON-file persistence.
- **Frontend:** Angular 19 (standalone components + signals), served as static files by the backend.

## Prerequisites

- Python 3.10+
- Node.js 20+ (only needed to build the frontend)
- An **Azure app registration** (public client) with the delegated Graph permissions
  `Mail.ReadWrite` and `User.Read`, and *"Allow public client flows"* enabled. You'll paste its
  Application (client) ID into the setup wizard.
- An API key for one of: OpenAI, Anthropic, Eden AI, or any OpenAI-compatible endpoint.

## Setup

```bash
# 1. Backend deps
python -m venv venv
venv\Scripts\activate            # Windows;  source venv/bin/activate on macOS/Linux
pip install -r requirements.txt

# 2. Build the frontend (outputs to frontend/dist/browser)
cd frontend
npm install
npm run build
cd ..
```

## Run

```bash
python backend/app.py
```

This starts the FastAPI server on <http://127.0.0.1:8000>, serves the built Angular app, and
opens your browser. On first run you'll land on a 3-step setup wizard:

1. **Connect Outlook** — paste your client ID and complete the device-code sign-in.
2. **Connect AI** — pick a provider, add your API key and model, and test the connection.
3. **Preferences** — set the check interval, max folder count, and parent folder name.

After setup, the dashboard shows live sorting activity, folders, an activity log, and settings.

## Development

Run the backend and the Angular dev server separately for hot reload:

```bash
# terminal 1 — backend
python backend/app.py

# terminal 2 — frontend dev server (proxies /api to the backend)
cd frontend
npm start        # http://localhost:4200
```

## How it works

The backend exposes a JSON API under `/api` (`/api/status`, `/api/activity`, `/api/folders`,
`/api/config`, `/api/auth/*`, `/api/test-ai`, …). A background polling loop checks the inbox on
your configured interval, classifies each new message with the AI provider, ensures the target
folder exists under your parent folder, moves the message, and logs the result. The frontend
polls `/api/status` and `/api/activity` every 5 seconds to stay live.

Runtime state (token cache, config, secrets, processed IDs, activity log) is stored as JSON in
`backend/data/`, which is gitignored.

## Project layout

```
tidemail/
├── backend/            # FastAPI app + Graph/AI logic
│   ├── app.py          # server, routes (/api/*), static SPA serving, entry point
│   ├── watcher.py      # background polling loop
│   ├── graph.py        # Microsoft Graph client
│   ├── classifier.py   # AI provider adapters
│   ├── auth.py         # MSAL device-code flow
│   ├── config.py       # config + secrets persistence
│   └── data/           # runtime state (gitignored)
├── frontend/           # Angular 19 SPA (components, pages, services)
├── requirements.txt
└── README.md
```
