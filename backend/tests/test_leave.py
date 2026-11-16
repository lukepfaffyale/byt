"""Leaving the game: the login, the nickname and the wallets go, and the twin and what the person made stay
for everyone else, with no royalties paid to the person who left."""
import db
import market
from conftest import signup
from content import CARDS
from tests.test_market import play_gates


def test_a_player_who_leaves_becomes_a_free_twin_and_what_they_built_lives_on(client, auth):
    play_gates(client, auth, 1)
    client.post("/me/consent", json={"data_income": True}, headers=auth)
    client.post("/creator", json={"name": "Open Mind Works"}, headers=auth)
    client.post("/wallets/deposit", json={"seat": "creator", "credits": 100}, headers=auth)
    client.post("/creator/briefs", json={"kind": "skill", "topic": "open-thinking"}, headers=auth)
    pack = client.get("/creator", headers=auth).json()["packs"][0]
    chosen = [c["id"] for c in pack["cards"]][:market.STEP_CARDS]
    assert client.post("/creator/steps", json={"pack": pack["id"], "cards": chosen}, headers=auth).status_code == 200

    def pass_step(who):
        last = None
        for cid in chosen:
            last = client.post("/responses", json={"card_id": cid, "choice": sorted(CARDS[cid].winning)[0], "response_ms": 900}, headers=who).json()
        return last

    free_before = len(db.free_twin_ids())
    paid_before = len(db.opted_in_player_ids())
    assert client.post("/me/leave", headers=auth).json() == {"left": True}
    assert client.get("/me", headers=auth).status_code == 401  # the login is gone
    assert len(db.free_twin_ids()) == free_before + 1 and len(db.opted_in_player_ids()) == paid_before - 1

    # the step they built is still open, a new player still earns the bonus, and no royalty is paid to anyone
    learner = signup(client, "After You")
    fund = db.fund_balance(market.FUND_START, market.STEP_KIND)
    assert pass_step(learner)["bonus"] == market.STEP_BONUS
    assert db.fund_balance(market.FUND_START, market.STEP_KIND) == fund - market.STEP_BONUS
    assert db.ledger_total() == 0

    # an agency can still count the twin in a group, as a free twin, and can ask members only
    client.post("/agency", json={"name": "Wide Net"}, headers=learner)
    seat = client.post("/agency/campaigns", json={"question_id": "q-price", "audience": "all", "pay": 1}, headers=learner).json()
    assert seat["campaigns"][0]["sample_twins"] == free_before + 1
    assert "members" in [a["id"] for a in seat["audiences"]]
    assert client.post("/creator", json={"name": "Second Maker"}, headers=learner).status_code == 200
    taken = next(s for s in client.get("/creator", headers=learner).json()["skills"] if s["id"] == "open-thinking")
    assert taken["waiting"] == []  # the step keeps its maker: the collective
