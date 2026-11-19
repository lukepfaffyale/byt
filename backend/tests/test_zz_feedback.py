"""Product feedback is a tap, holds no player id, and comes back as counts."""
from sqlmodel import SQLModel

from conftest import signup


def test_feedback_is_counted_and_holds_no_player(client):
    who = signup(client, "FeedbackGiver")
    assert client.post("/feedback", json={"seat": "player", "moment": "gate", "answer": "yes"}).status_code in (401, 403, 422)
    assert client.post("/feedback", json={"seat": "player", "moment": "gate", "answer": "great, thanks"}, headers=who).status_code == 422
    assert client.post("/feedback", json={"seat": "player", "moment": "gate", "answer": "yes", "note": "typed"}, headers=who).status_code == 422
    before = client.get("/feedback", headers=who).json()["total"]
    out = client.post("/feedback", json={"seat": "player", "moment": "gate", "answer": "yes"}, headers=who).json()
    client.post("/feedback", json={"seat": "agency", "moment": "question", "answer": "no"}, headers=who)
    out = client.get("/feedback", headers=who).json()
    assert out["total"] == before + 2 and "FeedbackGiver" not in str(out)
    row = next(r for r in out["rows"] if r["seat"] == "player" and r["moment"] == "gate")
    assert row["yes"] >= 1
    assert "player_id" not in SQLModel.metadata.tables["feedback"].columns


def test_a_creator_sees_where_syms_stand_on_each_skill_as_counts(client):
    who = signup(client, "StandWatcher")
    client.post("/creator", json={"name": "Stand Studio"}, headers=who)
    seat = client.get("/creator", headers=who).json()
    assert all({"strong", "partway", "new"} <= set(s) for s in seat["skills"])
    assert any(s["strong"] + s["partway"] + s["new"] >= 5 for s in seat["skills"])
    assert "BOT Sym " not in str(seat["skills"])  # counts, never a Sym


def test_the_price_a_creator_is_told_is_the_price_charged(client):
    import db
    import market

    who = signup(client, "PriceChecker")
    client.post("/creator", json={"name": "Price Studio"}, headers=who)
    client.post("/wallets/deposit", json={"seat": "creator", "credits": 1000}, headers=who)
    seat = client.get("/creator", headers=who).json()
    n = seat["reach"]["all"]
    assert n >= market.MIN_TWINS and all(v == 0 or v >= market.MIN_TWINS for v in seat["reach"].values())
    told = n * seat["pay"] + db.share_of(n * seat["pay"]) + seat["crew_fee"]
    after = client.post("/creator/briefs", json={"kind": "survey", "topic": market.QUESTIONS[0].id, "audience": "all"}, headers=who).json()
    assert round(seat["budget"] - after["budget"], 2) == round(told, 2)
