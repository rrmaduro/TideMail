"""MSAL device-code flow against Microsoft Graph, with a persisted token cache."""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Optional

import msal

DATA_DIR = Path(__file__).parent / "data"
TOKEN_CACHE_PATH = DATA_DIR / "token_cache.bin"
AUTHORITY = "https://login.microsoftonline.com/common"
SCOPES = ["Mail.ReadWrite", "User.Read"]


class AuthNotConfigured(Exception):
    """Raised when no client_id has been set yet."""


class AuthRequired(Exception):
    """Raised when there's no valid cached account to silently acquire a token from."""


_lock = threading.Lock()
_state: dict = {"status": "idle", "detail": None}
_flow: Optional[dict] = None


def _load_cache() -> msal.SerializableTokenCache:
    cache = msal.SerializableTokenCache()
    if TOKEN_CACHE_PATH.exists():
        cache.deserialize(TOKEN_CACHE_PATH.read_text(encoding="utf-8"))
    return cache


def _save_cache(cache: msal.SerializableTokenCache) -> None:
    if cache.has_state_changed:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        TOKEN_CACHE_PATH.write_text(cache.serialize(), encoding="utf-8")


def _build_app(client_id: str, cache: Optional[msal.SerializableTokenCache] = None) -> msal.PublicClientApplication:
    # authority is a hardcoded literal Microsoft endpoint (not user input), so skipping the
    # online authority-validation round trip is safe and avoids an extra network call on every use.
    return msal.PublicClientApplication(
        client_id,
        authority=AUTHORITY,
        token_cache=cache or _load_cache(),
        validate_authority=False,
        timeout=20,
    )


def _complete_device_flow(client_id: str, flow: dict) -> None:
    cache = _load_cache()
    app = _build_app(client_id, cache)
    try:
        result = app.acquire_token_by_device_flow(flow)  # blocks until user completes, denies, or it expires
        if "access_token" in result:
            with _lock:
                _state["status"] = "success"
                _state["detail"] = None
        else:
            with _lock:
                _state["status"] = "error"
                _state["detail"] = result.get("error_description", result.get("error", "Authentication failed"))
    except Exception as exc:  # noqa: BLE001 - surface any MSAL/network failure to the UI
        with _lock:
            _state["status"] = "error"
            _state["detail"] = str(exc)
    finally:
        _save_cache(cache)


def start_device_flow(client_id: str) -> dict:
    global _flow
    if not client_id:
        raise AuthNotConfigured("client_id is not set")

    app = _build_app(client_id)
    flow = app.initiate_device_flow(scopes=SCOPES)
    if "user_code" not in flow:
        raise RuntimeError(flow.get("error_description", "Failed to start device flow"))

    _flow = flow
    with _lock:
        _state["status"] = "pending"
        _state["detail"] = None

    thread = threading.Thread(target=_complete_device_flow, args=(client_id, flow), daemon=True)
    thread.start()

    return {
        "user_code": flow["user_code"],
        "verification_uri": flow["verification_uri"],
        "message": flow.get("message", ""),
        "expires_in": flow.get("expires_in"),
    }


def get_auth_status() -> dict:
    with _lock:
        status = dict(_state)
    status["authenticated"] = is_authenticated()
    return status


def is_authenticated() -> bool:
    cache = _load_cache()
    return len(cache.find(msal.TokenCache.CredentialType.ACCOUNT)) > 0


def get_token(client_id: str) -> str:
    if not client_id:
        raise AuthNotConfigured("client_id is not set")

    cache = _load_cache()
    app = _build_app(client_id, cache)
    accounts = app.get_accounts()
    if not accounts:
        raise AuthRequired("No authenticated account. Complete the device code sign-in first.")

    result = app.acquire_token_silent(SCOPES, account=accounts[0])
    _save_cache(cache)
    if not result or "access_token" not in result:
        raise AuthRequired("Cached session expired. Re-authenticate via device code sign-in.")
    return result["access_token"]


def disconnect() -> None:
    global _flow
    with _lock:
        _state["status"] = "idle"
        _state["detail"] = None
    _flow = None
    if TOKEN_CACHE_PATH.exists():
        TOKEN_CACHE_PATH.unlink()
