"""The twin battle, the verifier and the certs. No key, no network: the model is absent or a test double."""
import json

from pydantic_ai.models.test import TestModel

import agent
import audit
import db
import tools
import verifier
from content import CARDS, GATE_BY_ID, GATES
from models import Player
from sqlmodel import Session, select


def play_until(client, auth, gate_id, choose=lambda card: card["options"][0]["id"]):
    """Clear every gate before gate_id. Strategy cards are answered correctly."""
    for g in GATES:
        if g.id == gate_id:
            return
        if g.kind == "battle":
            assert client.post("/battles", headers=auth, json={"gate_id": g.id}).status_code == 200
        for c in client.get(f"/gates/{g.id}/cards", headers=auth).json()["cards"]:
            choice = sorted(CARDS[c["id"]].winning)[0] if CARDS[c["id"]].board else choose(c)
            r = client.post("/responses", headers=auth, json={"card_id": c["id"], "choice": choice, "response_ms": 800})
            assert r.status_code == 200, r.text


def player_id(auth):
    token = auth["Authorization"][7:]
    return db.player_by_token(token).id


def test_verifier_rules():
    card = CARDS["bt-01"]
    assert verifier.popular_choice(card, ["b", "b", "a"]) == "b"
    assert verifier.popular_choice(card, []) == "a"  # no data: first option
    assert verifier.rule_of_thumb(card, {"classic": 3, "bold": 1}, "a") == "b"
    assert verifier.rule_of_thumb(card, {}, "a") == "a"  # nothing known: fall back to the baseline
    s = verifier.score_battle([("a", "b", "a"), (None, "a", "a"), ("b", "b", "a")])
    assert (s.n, s.twin_matches, s.baseline_matches) == (3, 1, 1)
    win = verifier.BattleScore(n=10, twin_matches=8, baseline_matches=5)
    assert verifier.earns_twin_cert(win, "model")[0] is True
    assert verifier.earns_twin_cert(win, "offline")[0] is False  # the practice twin never certifies
    assert verifier.earns_twin_cert(verifier.BattleScore(10, 5, 5), "model")[0] is False  # a tie is not a win
    assert verifier.earns_twin_cert(verifier.BattleScore(4, 4, 0), "model")[0] is False  # too few cards


def test_samples_are_seeded_and_cannot_sign_in(client):
    with Session(db.get_engine()) as s:
        samples = list(s.exec(select(Player).where(Player.token_hash.startswith(db.SAMPLE_PREFIX))))
    assert len(samples) == db.SAMPLE_COUNT
    assert client.get("/me", headers={"Authorization": "Bearer sample-01"}).status_code == 401


def test_skill_cert_comes_from_play(client, auth):
    play_until(client, auth, "strategy-easy")
    cards = client.get("/gates/strategy-easy/cards", headers=auth).json()["cards"]
    last = None
    for c in cards:
        last = client.post("/responses", headers=auth, json={"card_id": c["id"], "choice": sorted(CARDS[c["id"]].winning)[0], "response_ms": 900}).json()
    assert last["cert"]["kind"] == "skill" and last["cert"]["level"] == "easy" and last["cert"]["accuracy"] == 1.0
    assert client.get("/me", headers=auth).json()["certs"] == 1


def test_battle_needs_a_start_and_falls_back_without_a_key(client, auth):
    play_until(client, auth, "battle-taste")
    assert client.get("/gates/battle-taste/cards", headers=auth).status_code == 409
    first = GATE_BY_ID["battle-taste"].card_ids[0]
    assert client.post("/responses", headers=auth, json={"card_id": first, "choice": "a", "response_ms": 500}).status_code == 409

    started = client.post("/battles", headers=auth, json={"gate_id": "battle-taste"}).json()
    assert {k: started[k] for k in ("gate_id", "n", "twin_kind")} == {"gate_id": "battle-taste", "n": 10, "twin_kind": "offline"}  # no key in tests
    assert len(started["sure"]) == 10  # how sure the twin is, for each card. The guesses stay sealed.
    assert client.post("/battles/battle-taste/learn", headers=auth).status_code == 409  # nothing to learn from yet
    again = client.post("/battles", headers=auth, json={"gate_id": "battle-taste"}).json()
    assert again == started  # idempotent: the twin cannot predict twice

    cards = client.get("/gates/battle-taste/cards", headers=auth).json()["cards"]
    assert "trait" not in json.dumps(cards)
    for c in cards:
        r = client.post("/responses", headers=auth, json={"card_id": c["id"], "choice": "a", "response_ms": 700}).json()
        assert r["twin_choice"] and isinstance(r["twin_match"], bool)
        assert r["twin_sure"] == 50 and isinstance(r["crowd_match"], bool)
    result = client.get("/battles/battle-taste", headers=auth).json()
    assert result["complete"] is True and result["n"] == 10
    assert result["cert"] is None  # the practice twin never certifies
    assert 0 <= result["twin_matches"] <= 10 and 0 <= result["baseline_matches"] <= 10
    assert result["record"] == [f"{result['twin_matches']}/10"]
    assert result["areas"] and all(a["right"] <= a["total"] for a in result["areas"])

    # the battle teaches the twin: its picks stop being held out, and each miss is written down, once
    pid = player_id(auth)
    counted = sum(db.trait_counts(pid).values())
    learned = client.post("/battles/battle-taste/learn", headers=auth).json()
    assert learned["picks_added"] == 10 and learned["misses"] == 10 - result["twin_matches"]
    assert sum(db.trait_counts(pid).values()) > counted
    assert learned["lessons"] and {x["kind"] for x in learned["lessons"]} <= {"count", "held"}  # no model here
    assert client.post("/battles/battle-taste/learn", headers=auth).json() == learned


def test_model_twin_is_scored_and_certified_by_code(client, auth):
    play_until(client, auth, "battle-taste", choose=lambda card: card["options"][0]["id"])
    pid = player_id(auth)
    db.replace_tendencies(pid, [("Style", "This person picks the first option.", 8)])
    gate = GATE_BY_ID["battle-taste"]
    # The player will pick "b" every time; the twin predicts "b" on 9 cards, a made-up card and a made-up option.
    preds = [{"card_id": cid, "choice": "b", "confidence": 0.9, "because": "style"} for cid in gate.card_ids[:9]]
    preds += [{"card_id": gate.card_ids[9], "choice": "zzz", "confidence": 0.9}, {"card_id": "not-a-card", "choice": "a", "confidence": 1.0}]
    agent.MODEL_OVERRIDE = TestModel(custom_output_args={"predictions": preds})

    started = client.post("/battles", headers=auth, json={"gate_id": gate.id}).json()
    assert started["twin_kind"] == "model"
    reveals = []
    for c in client.get(f"/gates/{gate.id}/cards", headers=auth).json()["cards"]:
        reveals.append(client.post("/responses", headers=auth, json={"card_id": c["id"], "choice": "b", "response_ms": 700}).json())
    assert sum(1 for r in reveals if r["twin_match"]) == 9
    assert reveals[0]["twin_sure"] == 90 and reveals[0]["twin_because"] == "This person picks the first option."
    assert reveals[9]["twin_choice"] == "I do not know" and reveals[9]["twin_match"] is False  # invalid option became "do not know"

    result = client.get(f"/battles/{gate.id}", headers=auth).json()
    assert result["twin_matches"] == 9
    assert result["cert"] is not None and result["cert"]["kind"] == "twin" and result["cert"]["accuracy"] == 0.9
    act = client.get("/me/activity", headers=auth).json()
    assert [c["kind"] for c in act["certs"]].count("twin") == 1
    assert act["battles"][0]["twin_matches"] == 9

    # it missed one card, so the Profiler rewrites the belief, and code stores the change
    agent.MODEL_OVERRIDE = TestModel(custom_output_args={"tendencies": [
        {"topic": "Style", "statement": "This person picks the second option.", "evidence_count": 10}]})
    learned = client.post(f"/battles/{gate.id}/learn", headers=auth).json()
    assert learned["misses"] == 1
    assert learned["lessons"] == [{"kind": "changed", "topic": "Style", "before": "This person picks the first option.",
                                   "after": "This person picks the second option."}]
    assert [t["statement"] for t in client.get("/me/activity", headers=auth).json()["tendencies"]] == ["This person picks the second option."]

    usage = client.get("/usage/summary", headers=auth).json()
    assert usage["my_runs"] >= 1 and any(a["agent"] == "twin" for a in usage["by_agent"])


def test_held_out_picks_never_reach_the_agents(client, auth):
    play_until(client, auth, "strategy-medium")  # this clears the first battle
    pid = player_id(auth)
    seen = tools._visible_picks(pid)
    battle_prompts = {CARDS[cid].prompt for cid in GATE_BY_ID["battle-taste"].card_ids}
    assert seen and not any(p["card"] in battle_prompts for p in seen)
    assert "trait" not in tools.card_brief(CARDS["bt-01"])  # the twin sees options, not trait tags
    assert "Tester" not in json.dumps(seen)


def test_trail_has_no_player_text_and_delete_removes_everything(client, auth):
    play_until(client, auth, "battle-taste")
    pid = player_id(auth)
    db.replace_tendencies(pid, [("Style", "This person likes loud jackets.", 4)])
    client.post("/battles", headers=auth, json={"gate_id": "battle-taste"})
    trail = audit.TRAIL_PATH.read_text(encoding="utf-8")
    assert "loud jackets" not in trail and "Tester" not in trail and pid not in trail
    assert '"event": "stop"' in trail

    assert client.delete("/me", headers=auth).json() == {"deleted": True}
    assert db.tendencies_for(pid) == [] and db.battles_for(pid) == [] and db.certs_for(pid) == [] and db.responses_for(pid) == []
    assert all(r.player_id != pid for r in db.usage_rows())


def test_budget_guard_skips_the_model(client, auth, monkeypatch):
    play_until(client, auth, "battle-taste")
    pid = player_id(auth)
    db.replace_tendencies(pid, [("Style", "This person picks the first option.", 8)])
    agent.MODEL_OVERRIDE = TestModel(custom_output_args={"predictions": []})
    monkeypatch.setenv("DAILY_TOKEN_BUDGET", "0")
    started = client.post("/battles", headers=auth, json={"gate_id": "battle-taste"}).json()
    assert started["twin_kind"] == "offline"
    assert any(r.stopped_reason == "budget" for r in db.usage_rows())
