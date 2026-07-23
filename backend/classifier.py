"""AI email classification: one shared prompt, pluggable provider adapters."""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Optional

import httpx

import graph

# How much of the email body to send to the model. Enough to "read the whole email"
# on typical messages while keeping token cost bounded on very long ones.
MAX_BODY_CHARS = 6000

# Batch classification: file many emails per API call. This is what lets a full-inbox scan
# use few requests (e.g. 200 emails -> ~10 calls instead of 200) and stay under rate limits.
BATCH_SIZE = 20
BATCH_BODY_CHARS = 2500  # per email inside a batch — enough to judge the theme

PROVIDER_PRESETS = {
    "eden": {"label": "Eden AI", "base_url": "https://api.edenai.run/v2"},
    "openai": {"label": "OpenAI", "base_url": "https://api.openai.com/v1"},
    "anthropic": {"label": "Anthropic", "base_url": "https://api.anthropic.com"},
    "custom": {"label": "Custom", "base_url": ""},
}

# The classification rules shared by the single and batch prompts. The app can only FILE an
# email into a folder and set an urgent flag, so the executive-assistant spec is mapped onto
# those two levers: the Category becomes the folder, and Priority-1/Security/flag-worthy mail
# sets urgent=true. Spam and low-confidence mail go to their own folders.
_CLASSIFY_RULES = (
    "You are an expert executive assistant organizing an email inbox. Read the FULL email "
    "(sender, subject, body) carefully and decide where it belongs, applying these rules.\n\n"
    "GENERAL:\n"
    "- Read the whole email and detect its REAL intent — don't rely on keywords alone.\n"
    "- Ignore signatures, unsubscribe links, tracking pixels and legal disclaimers when judging.\n"
    "- Use thread context and judge by the newest message. Favor caution over aggressive sorting.\n\n"
    "CATEGORY = the folder. Choose EXACTLY ONE of these categories:\n"
    "  Work, Personal, Finance, Bills, Shopping, Travel, Health, Education, Government, Legal,\n"
    "  Security, Subscriptions, Marketing, Social, Receipts, Newsletters, Projects, Reference,\n"
    "  Spam, Needs Review.\n"
    "- If an email spans several topics, use the category of its HIGHEST-priority item.\n"
    "- Mark obvious phishing, scams, fake invoices, crypto scams, fake giveaways, unsolicited\n"
    "  investment offers and suspicious-login junk as \"Spam\".\n"
    "- If you are LESS THAN 70% confident, or nothing fits well, use \"Needs Review\".\n"
    "- Prefer reusing an already-existing folder when it fits, so related mail lands together.\n"
    "  Existing folders: {folders_list}\n"
    "- Optionally add a more specific SUBFOLDER within the category for finer sorting when one\n"
    "  clearly applies (e.g. Travel -> \"Flights\", Receipts -> \"Amazon\", Finance -> \"Statements\",\n"
    "  Newsletters -> \"AI\"). Use \"\" when nothing specific fits. Reuse subfolder names consistently.\n\n"
    "URGENT = an attention flag. Set urgent=true when the email needs prompt personal action:\n"
    "- SECURITY is always urgent: password resets, MFA codes, login/sign-in alerts, unusual\n"
    "  sign-ins, security warnings, account verification.\n"
    "- PRIORITY-1 matters: hard deadlines, payment failures, clients waiting, legal matters,\n"
    "  family emergencies, important work requests.\n"
    "- FLAG-WORTHY, time-sensitive items: invoices or contracts needing a response, appointments,\n"
    "  meetings and calendar invites (Zoom/Teams/Google Meet), interview requests, travel\n"
    "  bookings/boarding passes, tax documents, and payment problems.\n"
    "- If the email says today, tomorrow, ASAP, deadline or urgent, treat it as MORE time-sensitive.\n"
    "- Routine marketing, promotions, sales, social notifications, receipts and read newsletters\n"
    "  are NOT urgent.\n\n"
    "Detect the email's language automatically and always write the reasoning in English."
)

SYSTEM_PROMPT_TEMPLATE = (
    _CLASSIFY_RULES + "\n\n"
    "Respond with ONLY a JSON object, no markdown fencing, in this exact shape:\n"
    '{{"folder": "Category", "subfolder": "Specific or empty", "urgent": true|false, "reasoning": "one short sentence"}}'
)

BATCH_SYSTEM_PROMPT_TEMPLATE = (
    _CLASSIFY_RULES + "\n\n"
    "You will receive a NUMBERED LIST of emails. Classify EACH one independently, and be "
    "CONSISTENT: emails that share a category must get the EXACT SAME folder name.\n\n"
    "Respond with ONLY a JSON array, no markdown fencing — one object per email, covering EVERY "
    "index exactly once, in this shape:\n"
    '[{{"index": 1, "folder": "Category", "subfolder": "Specific or empty", "urgent": false, "reasoning": "short"}}, ...]'
)


@dataclass
class ClassificationResult:
    folder: str
    urgent: bool
    reasoning: str
    raw: str
    subfolder: str = ""


class ClassifierError(Exception):
    pass


def _resolve_base_url(provider: str, base_url: str) -> str:
    if base_url:
        return base_url
    preset = PROVIDER_PRESETS.get(provider)
    if not preset or not preset["base_url"]:
        raise ClassifierError(f"No base URL configured for provider '{provider}'")
    return preset["base_url"]


def _parse_json_response(text: str) -> dict:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    raise ClassifierError(f"Could not parse AI response as JSON: {text[:200]}")


def _parse_json_array(text: str) -> list:
    text = text.strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
    # Salvage a truncated array: parse each complete flat object we can find.
    # Any cut-off trailing object is simply omitted (that email retries next scan).
    salvaged = []
    for obj_text in re.findall(r"\{[^{}]*\}", text, re.DOTALL):
        try:
            salvaged.append(json.loads(obj_text))
        except json.JSONDecodeError:
            continue
    if salvaged:
        return salvaged
    raise ClassifierError(f"Could not parse AI response as JSON array: {text[:200]}")


_RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_MAX_RETRIES = 6
_MAX_BACKOFF = 60.0


def _retry_after_seconds(resp: httpx.Response) -> Optional[float]:
    """Honor the server's requested wait: Retry-After header or Google's body retryDelay."""
    header = resp.headers.get("Retry-After")
    if header:
        try:
            return float(header)
        except ValueError:
            pass
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001
        return None
    # Gemini's OpenAI-compatible endpoint wraps errors in a JSON array; unwrap it.
    if isinstance(body, list):
        body = body[0] if body else {}
    if not isinstance(body, dict):
        return None
    # Google-style: error.details[].retryDelay = "37s"
    details = body.get("error", {}).get("details", []) or []
    for detail in details:
        if not isinstance(detail, dict):
            continue
        delay = detail.get("retryDelay")
        if isinstance(delay, str) and delay.endswith("s"):
            try:
                return float(delay[:-1])
            except ValueError:
                pass
    return None


def _post_json(url: str, payload: dict, headers: dict) -> dict:
    """POST returning parsed JSON, retrying rate-limits / transient 5xx with backoff.

    Runs on a worker thread (called via asyncio.to_thread), so sleeping here paces the
    scan to the provider's limit without blocking the server's event loop.
    """
    backoff = 3.0
    last_resp: Optional[httpx.Response] = None
    for attempt in range(_MAX_RETRIES + 1):
        last_resp = httpx.post(url, json=payload, headers=headers, timeout=45)
        if last_resp.status_code in _RETRYABLE_STATUS and attempt < _MAX_RETRIES:
            wait = _retry_after_seconds(last_resp) or backoff
            time.sleep(min(wait, _MAX_BACKOFF))
            backoff = min(backoff * 2, _MAX_BACKOFF)
            continue
        last_resp.raise_for_status()
        return last_resp.json()
    assert last_resp is not None
    last_resp.raise_for_status()
    return last_resp.json()


def _call_openai_compatible(
    base_url: str, api_key: str, model: str, system_prompt: str, user_prompt: str, max_tokens: int = 300
) -> str:
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0,
        "max_tokens": max_tokens,
    }
    # Gemini 2.5 models "think" by default, spending output tokens on hidden reasoning that
    # truncates our JSON and inflates usage. Classification needs none — turn it off.
    if "generativelanguage.googleapis.com" in base_url:
        payload["reasoning_effort"] = "none"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    data = _post_json(url, payload, headers)
    return data["choices"][0]["message"]["content"]


def _call_anthropic(
    base_url: str, api_key: str, model: str, system_prompt: str, user_prompt: str, max_tokens: int = 300
) -> str:
    url = f"{base_url.rstrip('/')}/v1/messages"
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    data = _post_json(url, payload, headers)
    return "".join(block.get("text", "") for block in data.get("content", []))


def _call_eden_ai(
    base_url: str, api_key: str, model: str, system_prompt: str, user_prompt: str, max_tokens: int = 300
) -> str:
    # Eden AI's "model" field doubles as "underlying_provider/model", e.g. "openai/gpt-4o-mini".
    underlying_provider, _, sub_model = model.partition("/")
    underlying_provider = underlying_provider or "openai"

    url = f"{base_url.rstrip('/')}/text/chat"
    payload = {
        "providers": underlying_provider,
        "text": user_prompt,
        "chatbot_global_action": system_prompt,
        "previous_history": [],
        "temperature": 0,
        "max_tokens": max_tokens,
    }
    if sub_model:
        payload["settings"] = {underlying_provider: sub_model}

    headers = {"Authorization": f"Bearer {api_key}"}
    data = _post_json(url, payload, headers)

    provider_result = data.get(underlying_provider, {})
    if provider_result.get("status") == "fail":
        raise ClassifierError(provider_result.get("error", {}).get("message", "Eden AI request failed"))
    return provider_result.get("generated_text", "")


def _dispatch(
    provider: str, base_url: str, api_key: str, model: str, system_prompt: str, user_prompt: str, max_tokens: int = 300
) -> str:
    if not api_key:
        raise ClassifierError("No AI API key configured")
    if not model:
        raise ClassifierError("No AI model configured")

    resolved_base_url = _resolve_base_url(provider, base_url)

    if provider == "anthropic":
        return _call_anthropic(resolved_base_url, api_key, model, system_prompt, user_prompt, max_tokens)
    if provider == "eden":
        return _call_eden_ai(resolved_base_url, api_key, model, system_prompt, user_prompt, max_tokens)
    if provider in ("openai", "custom"):
        return _call_openai_compatible(resolved_base_url, api_key, model, system_prompt, user_prompt, max_tokens)
    raise ClassifierError(f"Unknown AI provider '{provider}'")


def classify_email(email: dict, existing_folders: list[str], config: dict) -> ClassificationResult:
    sender = email.get("from", {}).get("emailAddress", {})
    sender_line = f"{sender.get('name', '')} <{sender.get('address', '')}>".strip()
    subject = email.get("subject", "(no subject)")

    # Read the full email: extract readable text from the HTML/text body, fall back to preview.
    body_text = graph.html_to_text(email.get("body")) or email.get("bodyPreview", "")
    body_text = body_text[:MAX_BODY_CHARS]

    max_folders = config.get("max_folder_count", 10)
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        max_folders=max_folders,
        folder_count=len(existing_folders),
        folders_list=", ".join(existing_folders) if existing_folders else "(none yet)",
    )
    user_prompt = f"Sender: {sender_line}\nSubject: {subject}\n\nFull email body:\n{body_text}"

    raw = _dispatch(
        config.get("provider", "openai"),
        config.get("base_url", ""),
        config.get("api_key", ""),
        config.get("model", ""),
        system_prompt,
        user_prompt,
    )
    parsed = _parse_json_response(raw)

    return ClassificationResult(
        folder=str(parsed.get("folder") or "Uncategorized").strip()[:60],
        subfolder=str(parsed.get("subfolder", "") or "").strip()[:60],
        urgent=bool(parsed.get("urgent", False)),
        reasoning=str(parsed.get("reasoning", "")).strip(),
        raw=raw,
    )


def _email_block(index: int, email: dict) -> str:
    sender = email.get("from", {}).get("emailAddress", {})
    sender_line = f"{sender.get('name', '')} <{sender.get('address', '')}>".strip()
    subject = email.get("subject", "(no subject)")
    body_text = (graph.html_to_text(email.get("body")) or email.get("bodyPreview", ""))[:BATCH_BODY_CHARS]
    return f"[{index}] From: {sender_line}\nSubject: {subject}\nBody:\n{body_text}"


def classify_batch(
    emails: list[dict], existing_folders: list[str], config: dict
) -> list[Optional[ClassificationResult]]:
    """Classify many emails in ONE API call. Returns results aligned to the input order,
    with None for any email the model failed to classify (those are retried next scan).

    Uses far fewer requests than one call per email, which keeps a full-inbox scan under
    rate limits and lets every email actually get sorted. Raises only if the whole call
    fails (network, auth, unparseable response).
    """
    if not emails:
        return []

    max_folders = config.get("max_folder_count", 10)
    system_prompt = BATCH_SYSTEM_PROMPT_TEMPLATE.format(
        max_folders=max_folders,
        folder_count=len(existing_folders),
        folders_list=", ".join(existing_folders) if existing_folders else "(none yet)",
    )
    user_prompt = "Emails to classify:\n\n" + "\n\n".join(
        _email_block(i + 1, e) for i, e in enumerate(emails)
    )

    # Budget output tokens for the whole batch, generously, to avoid truncating the array.
    max_tokens = max(1024, len(emails) * 120)
    raw = _dispatch(
        config.get("provider", "openai"),
        config.get("base_url", ""),
        config.get("api_key", ""),
        config.get("model", ""),
        system_prompt,
        user_prompt,
        max_tokens,
    )

    parsed = _parse_json_array(raw)
    by_index: dict[int, dict] = {}
    for item in parsed:
        if isinstance(item, dict) and "index" in item:
            try:
                by_index[int(item["index"])] = item
            except (ValueError, TypeError):
                continue

    results: list[Optional[ClassificationResult]] = []
    for i in range(len(emails)):
        item = by_index.get(i + 1)
        if item is None:
            results.append(None)  # dropped by the model — leave in inbox, retry next scan
            continue
        results.append(
            ClassificationResult(
                folder=str(item.get("folder") or "Uncategorized").strip()[:60],
                subfolder=str(item.get("subfolder", "") or "").strip()[:60],
                urgent=bool(item.get("urgent", False)),
                reasoning=str(item.get("reasoning", "")).strip(),
                raw=json.dumps(item),
            )
        )
    return results


def test_ai_connection(config: dict) -> dict:
    try:
        raw = _dispatch(
            config.get("provider", "openai"),
            config.get("base_url", ""),
            config.get("api_key", ""),
            config.get("model", ""),
            "Respond with only the single word: OK",
            "ping",
        )
        return {"ok": True, "message": raw.strip()[:200]}
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:300]
        return {"ok": False, "message": f"HTTP {exc.response.status_code}: {detail}"}
    except (ClassifierError, httpx.HTTPError) as exc:
        return {"ok": False, "message": str(exc)}
