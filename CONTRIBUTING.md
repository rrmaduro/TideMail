# Contributing to tidemail

First off — thank you. tidemail is early and community-driven, and contributions of **every** kind are
welcome: code, docs, design, testing, and especially **ideas**.

## Ways to contribute

- 💡 **Share an idea** → open a [Discussion](https://github.com/rrmaduro/TideMail/discussions). How
  should an inbox be sorted? What providers or features matter to you? No idea is too small.
- 🐛 **Report a bug / request a feature** → open an [Issue](https://github.com/rrmaduro/TideMail/issues).
- 🛠️ **Write code** → see below.
- 📝 **Improve docs** → typos, clarity, screenshots — all appreciated.

## Project layout

```
TideMail/
├── backend/          # FastAPI app + Graph/AI logic (Python)
│   ├── app.py        # server, /api routes, static SPA serving, entry point
│   ├── watcher.py    # full-inbox scan loop
│   ├── graph.py      # Microsoft Graph client
│   ├── classifier.py # AI provider adapters + batch classification
│   ├── auth.py       # MSAL device-code flow
│   ├── config.py     # config + secrets persistence
│   ├── netfix.py     # IPv4-first DNS workaround
│   └── data/         # runtime state (git-ignored; never commit)
├── frontend/         # Angular 19 SPA (components, pages, services)
├── docs/             # setup guides
└── requirements.txt
```

## Development setup

```bash
# Backend
python -m venv venv
venv\Scripts\activate           # or: source venv/bin/activate
pip install -r requirements.txt
python backend/app.py           # http://127.0.0.1:8000

# Frontend (hot reload, proxies /api to the backend)
cd frontend
npm install
npm start                       # http://localhost:4200
```

## Guidelines

- **Never commit secrets or personal data.** Keys, tokens, and inbox data live in the git-ignored
  `backend/data/`. If you add a new secret location, update [.gitignore](.gitignore).
- **Match the surrounding style.** Python: type hints, small focused functions. Angular: standalone
  components + signals, semantic CSS tokens (never raw hex — use the vars in `styles.scss`).
- **Accessibility matters.** Keep visible focus rings, 4.5:1 contrast, keyboard support, and respect
  `prefers-reduced-motion`.
- **Keep it local-first.** Don't add remote services, tracking, or telemetry.

## Pull requests

1. Fork and create a branch: `git checkout -b feature/short-description`.
2. Make your change; keep the diff focused.
3. Verify the backend still boots and the frontend builds (`npm run build`).
4. Open a PR describing **what** and **why**. Link any related issue/discussion.
5. Be kind in review — see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Good first issues

New here? Look for issues labelled [`good first issue`](https://github.com/rrmaduro/TideMail/labels/good%20first%20issue),
or just open a Discussion and ask where to start.

## Reporting security issues

Do **not** open a public issue for vulnerabilities — see [SECURITY.md](SECURITY.md).
