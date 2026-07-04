<div align="center">

<img src="frontend/public/favicon.svg" width="84" alt="tidemail logo" />

# tidemail

### Your inbox, organized by the tide.

**tidemail** is a local-first, open-source app that reads your Outlook inbox and quietly sorts
every email into clean, themed folders — _Gaming, Finance, Shopping, Travel, Work…_ — using an AI
model of your choice. It runs entirely on your machine. Your mail never touches our servers,
because there are none.

[![License](https://img.shields.io/badge/license-see%20LICENSE-0e8fa3)](LICENSE)
[![Python](https://img.shields.io/badge/backend-FastAPI%20%C2%B7%20Python%203.10%2B-123b52)](backend/)
[![Angular](https://img.shields.io/badge/frontend-Angular%2019-26d4e2)](frontend/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-17a67e)](CONTRIBUTING.md)
[![Status](https://img.shields.io/badge/status-early%20%C2%B7%20ideas%20wanted-ff6b6b)](#-ideas-wanted--help-shape-tidemail)

[What it is](#-what-is-tidemail) · [Features](#-features) · [Getting started](#-getting-started) ·
[How it works](#-how-it-works) · [Privacy](#-privacy--your-data) · [Contribute](#-ideas-wanted--help-shape-tidemail)

</div>

---

> [!NOTE]
> **tidemail is early and community-driven.** It works end-to-end, but there's a lot still to
> shape — and that's the point. If the idea resonates, [**bring your ideas**](#-ideas-wanted--help-shape-tidemail).

## 🌊 What is tidemail?

Inboxes drown you. Newsletters, receipts, game deals, bank alerts, job pings — all in one endless
list. tidemail is the tide that pulls it into order: it reads the **full content** of each email and
files it under a durable **theme** folder, so related mail always lands together.

- **Local-first & private.** A small FastAPI server + a Angular web UI run on your own computer. Your
  email content is sent only to **Microsoft Graph** (to read/move your mail) and to **the AI provider
  you configure** (to classify it). Nothing is sent to any tidemail-operated service.
- **Bring your own AI.** OpenAI, Anthropic, Google Gemini, Eden AI, a local model via Ollama — any
  OpenAI-compatible endpoint works.
- **One click, whole inbox.** Press **Sort entire inbox** and tidemail does a full pass — classify,
  file, log — and shows live progress.
- **Calm, modern UI.** Light & dark, scroll animations, downloadable activity logs.

## ✨ Features

| | |
|---|---|
| 🗂️ **Theme sorting** | Reads each email in full and files it into a broad, reusable folder (Gaming, Finance, Shopping…). |
| ⚡ **Batch classification** | Classifies ~20 emails per AI call, so a full inbox uses few requests and stays under rate limits. |
| 🔁 **Full-inbox scans** | Every scan processes your entire current inbox, not just new mail. |
| 🔐 **Device-code sign-in** | Microsoft sign-in via MSAL device flow — no passwords stored, token cached locally. |
| 📊 **Activity log** | Every processed email is logged with the AI's reasoning; filter and **export to CSV/JSON**. |
| 🚦 **Rate-limit aware** | Retries with backoff that respects the provider's `Retry-After`. |
| 🌗 **Light / dark** | Independently tuned themes, respects your OS preference. |
| 🧩 **Pluggable providers** | OpenAI · Anthropic · Gemini · Eden AI · any OpenAI-compatible / local endpoint. |

## 🚀 Getting started

**Prerequisites:** [Python 3.10+](https://www.python.org/), [Node.js 20+](https://nodejs.org/) (to
build the UI), a Microsoft account, and an API key for one AI provider.

```bash
# 1. Clone
git clone https://github.com/rrmaduro/TideMail.git
cd TideMail

# 2. Backend deps
python -m venv venv
venv\Scripts\activate            # Windows  (source venv/bin/activate on macOS/Linux)
pip install -r requirements.txt

# 3. Build the UI
cd frontend && npm install && npm run build && cd ..

# 4. Run
python backend/app.py
```

This serves the app at <http://127.0.0.1:8000> and opens your browser. A first-run wizard walks you
through connecting Outlook and your AI provider. See [**INSTALL.md**](INSTALL.md) for a packaged,
double-click desktop build (no terminal needed).

> [!IMPORTANT]
> tidemail needs a Microsoft **client ID** to talk to your mailbox (a hard requirement of Microsoft
> Graph — not a tidemail limitation). It's **free**: register a public client app in the
> [Microsoft Entra portal](https://entra.microsoft.com) with delegated `Mail.ReadWrite` + `User.Read`
> and "Allow public client flows" enabled. Full walkthrough in the setup wizard and
> [docs/OUTLOOK_SETUP.md](docs/OUTLOOK_SETUP.md).

> [!TIP]
> Getting rate-limited on a big inbox? Use a lighter model with higher free limits (e.g.
> `gemini-2.5-flash-lite`), or run a **fully local** model with [Ollama](https://ollama.com) — set
> the provider to *Custom* and point the base URL at `http://localhost:11434/v1`.

## 🧠 How it works

```
Outlook inbox ──▶ Microsoft Graph ──▶ tidemail backend ──▶ your AI provider
                                          │                     │
                                          │   (batch of ~20)    │
                                          ◀── themes ───────────┘
                                          │
                        move each email into its theme folder
                                          │
                                    log to activity.json
                                          ▼
                          Angular dashboard (live progress)
```

The backend polls Graph for your inbox, sends emails to the AI in batches for classification,
creates/moves them into folders under a parent (default **"AI Sorted"**), and logs every decision.
The frontend polls status/activity to stay live.

## 🔒 Privacy & your data

tidemail is built so your data stays yours:

- **No tidemail servers.** Everything runs on `127.0.0.1` (localhost). There is no backend we operate
  and no telemetry.
- **Where data goes:** your email content is shared **only** with Microsoft Graph and the AI endpoint
  **you** configure. That's it.
- **What's stored locally** (in `backend/data/`, and **git-ignored** so it never ends up in the repo):
  your settings, your API key, the Microsoft token cache, processed-message IDs, and the activity log.
- **Secrets never leave your machine** and are never returned by the API (`GET /api/config` omits keys).

See [SECURITY.md](SECURITY.md) for the full security model and how to report a vulnerability.

## 🗺️ Roadmap

Rough direction — nothing is locked, and this is where **your input matters most**:

- [ ] Per-folder rules & user overrides ("always send X to Y")
- [ ] Rescan / re-file with corrections that teach the classifier
- [ ] Gmail / IMAP support alongside Outlook
- [ ] Scheduled background scans
- [ ] Local-model presets (Ollama, LM Studio) out of the box
- [ ] One-click installers for Windows / macOS / Linux
- [ ] Undo / "move back to inbox" for a scan

## 💡 Ideas wanted — help shape tidemail

This project is **actively looking for ideas and contributors.** You don't need to write code to help:

- 🧭 **Have an idea?** Open a [**Discussion**](https://github.com/rrmaduro/TideMail/discussions) — how
  you'd want your inbox sorted, features you'd love, providers to support, UX thoughts. All welcome.
- 🐛 **Found a bug or want a feature?** File an [**Issue**](https://github.com/rrmaduro/TideMail/issues).
- 🛠️ **Want to build?** See [**CONTRIBUTING.md**](CONTRIBUTING.md) for setup and good first issues.
- ⭐ **Like the idea?** A star helps others find it.

If you're unsure where to start, just open a Discussion and say hi — really.

## 🆘 Need help?

- Check or open an [Issue](https://github.com/rrmaduro/TideMail/issues)
- Ask in [Discussions](https://github.com/rrmaduro/TideMail/discussions)

## 🤝 Contributing & conduct

Contributions of all kinds are welcome — code, docs, design, ideas. Start with
[CONTRIBUTING.md](CONTRIBUTING.md). By participating you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## 🎨 Brand

<table>
<tr>
<td align="center"><code>#08243a</code><br/>Deep</td>
<td align="center"><code>#123b52</code><br/>Ocean</td>
<td align="center"><code>#0e8fa3</code><br/>Teal</td>
<td align="center"><code>#26d4e2</code><br/>Cyan</td>
<td align="center"><code>#e9f5f8</code><br/>Foam</td>
</tr>
</table>

Logo: a "layered tide" — three stacked waves fading from surface to deep. Type: **Space Grotesk**
(display) + **Inter** (UI) + **JetBrains Mono** (logs).

## 📄 License

Released under the terms in [LICENSE](LICENSE). tidemail is not affiliated with Microsoft, Google,
OpenAI, or Anthropic; product names and logos belong to their respective owners.

<div align="center">
<sub>Built with calm. 🌊</sub>
</div>
