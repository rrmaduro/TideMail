# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, use GitHub's private reporting:

1. Go to the [**Security** tab](https://github.com/rrmaduro/TideMail/security/advisories/new) of this
   repository.
2. Click **Report a vulnerability** and describe the issue, ideally with steps to reproduce and the
   potential impact.

You should get an acknowledgement within a few days. Please give us a reasonable window to fix the
issue before any public disclosure. Thank you for helping keep tidemail users safe.

## Security model

tidemail is a **local, single-user application**. Understanding its trust boundaries helps you assess
risk:

- **Runs on loopback only.** The server binds to `127.0.0.1` and is not exposed to your network.
- **No tidemail-operated backend.** There is no remote service, account system, or telemetry.
- **Where your data goes.** Email content is transmitted only to:
  - **Microsoft Graph** — to read and move your messages (over HTTPS), and
  - **the AI provider you configure** — to classify messages (over HTTPS).
- **Authentication.** Sign-in uses the Microsoft **device-code flow** (MSAL). tidemail never sees or
  stores your password. Access/refresh tokens are cached locally by MSAL in
  `backend/data/token_cache.bin`.
- **Secrets at rest.** Your AI API key is stored locally in `backend/data/secrets.json`. The entire
  `backend/data/` directory is **git-ignored** and never leaves your machine. The API's
  `GET /api/config` deliberately omits secret fields.

## Hardening in place

- Loopback-only bind (`127.0.0.1`).
- Security headers on every response (`X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`).
- Interactive API docs (`/docs`, `/openapi.json`) are disabled.
- OData/query inputs to Microsoft Graph are escaped.
- Secrets are stored separately from non-secret config and are never returned by the API or logged.

## Your responsibilities as an operator

- **Keep `backend/data/` private.** It contains your token cache, API key, and inbox activity. It is
  git-ignored — do not force-add it.
- **Rotate keys** if you ever paste one into a chat, screenshot, or shared terminal.
- **Use a scoped app registration.** Grant only `Mail.ReadWrite` + `User.Read`.
- **Keep dependencies updated** (`pip install -U -r requirements.txt`, `npm update`).

## Tips for contributors

- Never commit real credentials, tokens, or inbox data. Use the git-ignored `backend/data/` dir.
- If you add a new secret, make sure its storage path is covered by [.gitignore](.gitignore).
