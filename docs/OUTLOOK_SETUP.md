# Connecting Outlook

tidemail reads and moves your mail through **Microsoft Graph**, which always requires a **client ID**.
This is a hard requirement of the Microsoft identity platform — but it's **free** and takes ~5 minutes.
You have two options.

---

## Option A — Register your own app (recommended)

Free, no Azure subscription or credit card — just a Microsoft account.

### 1. Open App registrations
Go to [entra.microsoft.com](https://entra.microsoft.com) → **Identity → Applications → App registrations**.
(A personal Microsoft account gets a free directory automatically the first time.)

### 2. New registration
Click **+ New registration**:
- **Name:** `tidemail`
- **Supported account types:** *Accounts in any organizational directory (multitenant) and personal
  Microsoft accounts.*
- **Redirect URI:** leave blank (device-code flow doesn't need one).

Click **Register**.

### 3. Copy the client ID
On the **Overview** page, copy **Application (client) ID** — the value you paste into tidemail. You do
**not** need the tenant ID or any client secret.

### 4. Allow public client flows
**Authentication → Advanced settings → "Allow public client flows" → Yes → Save.** (Required for
device-code sign-in.)

### 5. Add permissions
**API permissions → + Add a permission → Microsoft Graph → Delegated permissions**, then add:
- `Mail.ReadWrite`
- `User.Read`

Click **Add permissions**. (No admin consent needed for a personal account — you consent at sign-in.)

### 6. Sign in
In tidemail's setup wizard, paste the client ID → **Verify connection** → open the link, enter the
code, sign in, and approve the permissions.

---

## Option B — Use a public client ID (no registration)

Microsoft ships a public client for its command-line tools that you can reuse:

```
14d82eec-204b-4c2f-b7e8-296a70dab67e
```

Paste it into the client-ID field and sign in as normal. On the consent screen it will say
*"Microsoft Graph Command Line Tools"* — that's expected.

**Caveats:**
- ✅ Works well for **personal** accounts (outlook.com / hotmail / live).
- ⚠️ **Work / school** accounts often block this via Conditional Access or require admin consent. If
  sign-in fails with a policy error, use Option A (with admin help) or a personal account.
- This is fine for personal use; it's not something to ship in a product, since you don't control that
  shared app.

---

## Troubleshooting

- **"AADSTS70016 … not yet been authorized"** — normal "waiting for you to enter the code" message;
  finish the sign-in in your browser.
- **Sign-in hangs** — a flaky IPv6 route can stall Python's network stack; tidemail ships an IPv4-first
  workaround (`backend/netfix.py`) that resolves this.
- **Work account blocked** — that's a tenant policy; contact your IT admin or use a personal account.
