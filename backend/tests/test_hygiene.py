"""House style checks: no em dashes anywhere in the project's own files or in agent replies.

The banned characters are built from code points so this test file never contains one itself.
"""

from __future__ import annotations

from pathlib import Path

from agent import strip_em_dashes

ROOT = Path(__file__).resolve().parents[2]
SKIP_DIRS = {"venv", ".venv", "node_modules", "dist", "data", "output", "__pycache__", ".git"}
EXTENSIONS = {".md", ".py", ".ts", ".tsx", ".css", ".html", ".json", ".sql", ".txt", ".yaml", ".yml"}
EM = chr(0x2014)
BAR = chr(0x2015)
EN = chr(0x2013)


def _own_files():
    for path in ROOT.rglob("*"):
        if path.is_dir() or path.suffix.lower() not in EXTENSIONS:
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
            continue
        yield path


def test_no_em_dashes_in_project_files():
    offenders = []
    for path in _own_files():
        text = path.read_text(encoding="utf-8", errors="ignore")
        if EM in text or BAR in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == [], f"em dashes found in: {offenders}"


def test_strip_em_dashes_rewrites_cleanly():
    assert strip_em_dashes(f"No{EM}Basic Hoodie Big Yale does not come in pink.") == "No, Basic Hoodie Big Yale does not come in pink."
    assert strip_em_dashes(f"Sizes XS{EN}XXL are in stock.") == "Sizes XS-XXL are in stock."
    assert strip_em_dashes(f"Great pick {EM} it is $68.") == "Great pick, it is $68."
    assert strip_em_dashes("Plain text with a hyphen-word stays.") == "Plain text with a hyphen-word stays."
    assert EM not in strip_em_dashes(f"a {EM} b {EM} c")


def test_a_typed_forwarded_address_does_not_step_round_the_limit(client, monkeypatch):
    """A caller can type any forwarded address, so each route also has one limit for all callers together."""
    import main

    monkeypatch.setattr(main, "ALL_TIMES", 1)
    body = {"consent": True, "adult": True}
    for i in range(10):  # ten sign-ups, each claiming to come from a new address
        r = client.post("/players", json={**body, "nickname": f"Limit{i}"}, headers={"x-forwarded-for": f"10.0.0.{i}"})
        assert r.status_code == 201
    late = client.post("/players", json={**body, "nickname": "Limit99"}, headers={"x-forwarded-for": "10.0.0.99"})
    assert late.status_code == 429
