"""Tests run against a temporary database and temporary audit files, with no key and no network."""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
_TMP = Path(tempfile.mkdtemp())
# BYT_TEST_DATABASE_URL points the whole run at another database (a throwaway Postgres schema, to check the hosted path)
os.environ["DATABASE_URL"] = os.environ.get("BYT_TEST_DATABASE_URL") or "sqlite:///" + (_TMP / "test.db").as_posix()
os.environ["BYT_LIFE"] = "off"  # the BOT Syms do not move by themselves during tests; a test moves them
os.environ["PORTKEY_API_KEY"] = ""  # set before main loads .env, so the real key is never picked up

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import audit  # noqa: E402
import prompt_guard  # noqa: E402

audit.AUDIT_PATH = _TMP / "audit.jsonl"
audit.TRAIL_PATH = _TMP / "audit_trail.json"
prompt_guard.FLAGS_PATH = _TMP / "prompt_injection_flags.json"

import agent  # noqa: E402
import main  # noqa: E402


@pytest.fixture()
def client():
    main._hits.clear()
    main._bot_facts.clear()
    main._seat_bots.clear()
    agent.MODEL_OVERRIDE = None
    with TestClient(main.app) as c:
        yield c
    agent.MODEL_OVERRIDE = None


def signup(client, nickname="Tester"):
    r = client.post("/players", json={"nickname": nickname, "consent": True, "adult": True})
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture()
def auth(client):
    return signup(client)
