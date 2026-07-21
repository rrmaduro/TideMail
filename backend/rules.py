"""User rules that override the AI.

Two kinds, both checked before an email is ever sent to the model:
  * pin rules  — "mail from X always goes to folder Y" (skips the AI entirely)
  * never rules — "never touch mail from X" (left exactly where it is)

Stored as JSON in the git-ignored data dir, alongside the rest of the local state.
"""
from __future__ import annotations

import json
from typing import Optional

from pydantic import BaseModel, Field

from paths import DATA_DIR

RULES_PATH = DATA_DIR / "rules.json"

MATCH_TYPES = ("sender", "domain", "subject")


class Rule(BaseModel):
    type: str = "sender"          # sender | domain | subject
    value: str = ""
    folder: str = ""              # category to file into
    subfolder: str = ""           # optional subcategory


class NeverRule(BaseModel):
    type: str = "sender"          # sender | domain | subject
    value: str = ""


class RulesDoc(BaseModel):
    rules: list[Rule] = Field(default_factory=list)
    never: list[NeverRule] = Field(default_factory=list)


def load() -> RulesDoc:
    if not RULES_PATH.exists():
        return RulesDoc()
    try:
        return RulesDoc(**json.loads(RULES_PATH.read_text(encoding="utf-8")))
    except Exception:  # noqa: BLE001 - a corrupt file shouldn't break scanning
        return RulesDoc()


def save(doc: RulesDoc) -> RulesDoc:
    # Drop incomplete entries so a half-filled form can't create a rule that matches everything.
    doc.rules = [r for r in doc.rules if r.value.strip() and r.folder.strip() and r.type in MATCH_TYPES]
    doc.never = [n for n in doc.never if n.value.strip() and n.type in MATCH_TYPES]
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RULES_PATH.write_text(doc.model_dump_json(indent=2), encoding="utf-8")
    return doc


def _sender_address(message: dict) -> str:
    return (message.get("from", {}).get("emailAddress", {}).get("address") or "").lower()


def _matches(match_type: str, value: str, message: dict) -> bool:
    needle = value.strip().lower()
    if not needle:
        return False
    if match_type == "sender":
        return _sender_address(message) == needle
    if match_type == "domain":
        addr = _sender_address(message)
        return addr.endswith("@" + needle.lstrip("@")) or addr.endswith("." + needle.lstrip("@"))
    if match_type == "subject":
        return needle in (message.get("subject") or "").lower()
    return False


def is_never(message: dict, doc: Optional[RulesDoc] = None) -> bool:
    doc = doc or load()
    return any(_matches(n.type, n.value, message) for n in doc.never)


def match(message: dict, doc: Optional[RulesDoc] = None) -> Optional[Rule]:
    """First pin rule that matches, or None."""
    doc = doc or load()
    for r in doc.rules:
        if _matches(r.type, r.value, message):
            return r
    return None
