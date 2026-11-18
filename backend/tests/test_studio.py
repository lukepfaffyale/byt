"""The creator studio and one to one meetings: taps from fixed lists, counts only for a group, and one Sym is seen
only when its owner said yes and the seat paid the royalty."""
import db
import market
from conftest import signup
from content import CARDS
from tests.test_market import play_gates


def creator(client, auth, credits=1000):
    client.post("/creator", json={"name": "Bright Skills"}, headers=auth)
    if credits:
        client.post("/wallets/deposit", json={"seat": "creator", "credits": credits}, headers=auth)


def test_a_creator_job_needs_a_seat_credits_and_taps_from_the_lists(client, auth):
    ask = {"kind": "survey", "topic": market.QUESTIONS[0].id, "audience": "all"}
    assert client.post("/creator/briefs", json=ask, headers=auth).status_code == 404
    creator(client, auth, credits=0)
    assert client.post("/creator/briefs", json=ask, headers=auth).status_code == 409  # an empty wallet: nothing happens
    client.post("/wallets/deposit", json={"seat": "creator", "credits": 100}, headers=auth)
    assert client.post("/creator/briefs", json={**ask, "topic": "not-a-question"}, headers=auth).status_code == 422
    assert client.post("/creator/briefs", json={**ask, "question": "typed text"}, headers=auth).status_code == 422
    assert client.post("/creator/briefs", json={**ask, "kind": "essay"}, headers=auth).status_code == 422


def test_a_survey_and_a_test_return_counts_only_and_every_credit_is_in_the_ledger(client, auth):
    creator(client, auth)
    platform = db.wallet_balance(None, "platform")
    out = client.post("/creator/briefs", json={"kind": "survey", "topic": market.QUESTIONS[0].id, "audience": "all"}, headers=auth).json()
    survey = out["briefs"][0]
    assert survey["twins"] >= market.MIN_TWINS and sum(r["count"] for r in survey["split"]) == survey["twins"]
    assert survey["spent"] == survey["twins"] * market.CREATOR_PAY + market.CREW_FEE
    assert out["budget"] == 1000 - survey["spent"] - db.share_of(survey["spent"] - market.CREW_FEE)
    out = client.post("/creator/briefs", json={"kind": "test", "topic": "logic", "audience": "all"}, headers=auth).json()
    test = out["briefs"][0]
    assert [r["label"] for r in test["split"]] == [label for _, label in market.BANDS]
    assert sum(r["count"] for r in test["split"]) == test["twins"]
    assert "BOT Sym" not in str(out["briefs"])  # counts, never a twin
    # the game earned its two crew fees, and its share on what the two jobs paid out
    shares = db.share_of(survey["spent"] - market.CREW_FEE) + db.share_of(test["spent"] - market.CREW_FEE)
    assert db.wallet_balance(None, "platform") == round(platform + 2 * market.CREW_FEE + shares, 2)
    assert db.ledger_total() == 0


def test_claiming_a_skill_step_takes_the_next_waiting_step_once(client, auth):
    creator(client, auth)
    out = client.post("/creator/briefs", json={"kind": "skill", "topic": "logic"}, headers=auth).json()
    logic = next(s for s in out["skills"] if s["id"] == "logic")
    assert len(logic["claimed"]) == 1 and logic["claimed"][0] not in logic["waiting"]
    assert out["briefs"][0]["spent"] == market.CLAIM_FEE and out["budget"] == 1000 - market.CLAIM_FEE
    for _ in logic["waiting"]:
        client.post("/creator/briefs", json={"kind": "skill", "topic": "logic"}, headers=auth)
    assert client.post("/creator/briefs", json={"kind": "skill", "topic": "logic"}, headers=auth).status_code == 409


def test_one_to_one_shows_a_real_twin_only_after_its_owner_says_yes_and_pays_the_owner(client, auth):
    creator(client, auth)
    other = signup(client, "Quiet One")
    play_gates(client, other, 2)
    # the owner has not said yes: only made-up sample twins can be met
    first = client.post("/seats/creator/meet", json={"audience": "all"}, headers=auth).json()
    assert first["met"][0]["sample"] is True and first["met"][0]["nickname"].startswith("BOT Sym")
    assert client.get("/jobs", headers=other).json()["one_to_one"] is False
    said = client.post("/me/one-to-one", json={"on": True}, headers=other).json()
    assert said["one_to_one"] is True and said["meet_price"] == market.MEET_PRICE
    before = client.get("/me", headers=other).json()["credits"]
    met = client.post("/seats/creator/meet", json={"audience": "all"}, headers=auth).json()["met"][0]
    assert met["open"] and met["nickname"] == "Quiet One" and len(met["answers"]) == len(market.QUESTIONS)
    assert client.get("/me", headers=other).json()["credits"] == before + market.MEET_PRICE
    lines = client.get("/wallets", headers=other).json()["wallets"][0]["lines"]
    assert lines[0]["label"] == "One to one royalty" and "Bright Skills" not in str(lines)  # paid, and not told by whom
    assert client.get("/jobs", headers=other).json()["meets"] == 1
    # the owner turns it off: the seat keeps the bill and loses the view
    client.post("/me/one-to-one", json={"on": False}, headers=other)
    seen = client.get("/seats/creator/meets", headers=auth).json()["met"]
    assert "Quiet One" not in str(seen) and any(m["open"] is False for m in seen)
    # the owner deletes their data: the meeting row goes too, and the sums still hold
    client.delete("/me", headers=other)
    assert all(m["open"] for m in client.get("/seats/creator/meets", headers=auth).json()["met"])
    assert db.ledger_total() == 0
    assert client.post("/seats/player/meet", json={"audience": "all"}, headers=auth).status_code == 404


def test_a_built_step_is_playable_and_pays_the_player_first_then_a_royalty_to_its_creator(client, auth):
    creator(client, auth)
    client.post("/creator/briefs", json={"kind": "skill", "topic": "planning"}, headers=auth)
    seat = client.get("/creator", headers=auth)
    assert '"right"' not in seat.text  # the creator picks cards without seeing the answers
    pack = seat.json()["packs"][0]
    ids = [c["id"] for c in pack["cards"]]
    chosen = ids[:market.STEP_CARDS]
    assert pack["step"] == "Order the steps" and len(ids) > market.STEP_CARDS

    def build(cards, who=auth, **extra):
        return client.post("/creator/steps", json={"pack": pack["id"], "cards": cards, **extra}, headers=who)

    def step(who):
        trees = client.get("/skills", headers=who).json()["trees"]
        return next(s for t in trees if t["id"] == "planning" for s in t["steps"] if s["name"] == pack["step"])

    # one creator per step: a second creator is offered the next step, and cannot build this one
    rival = signup(client, "Rival")
    creator(client, rival)
    client.post("/creator/briefs", json={"kind": "skill", "topic": "planning"}, headers=rival)
    assert client.get("/creator", headers=rival).json()["packs"][0]["step"] == "Find the slow step"
    assert build(chosen, rival).status_code == 409
    # taps from the pack only, exactly the set number, nothing typed
    for bad in (ids[:3], ids[:3] + ["bt-01"], ids[:3] + ids[:1], ids[:5]):
        assert build(bad).status_code == 422
    assert build(chosen, prompt="typed text").status_code == 422

    learner = signup(client, "Learner")
    assert step(learner)["state"] == "soon"
    assert client.get(f"/gates/{pack['id']}/cards", headers=learner).status_code == 404
    out = build(chosen).json()
    assert out["packs"] == [] and out["made"][0]["passes"] == 0
    assert out["budget"] == 1000 - market.CLAIM_FEE - market.CREW_FEE
    assert build(chosen).status_code == 409  # built once
    assert step(learner) == {"name": pack["step"], "state": "open", "gate_id": pack["id"], "made": True}

    raw = client.get(f"/gates/{pack['id']}/cards", headers=learner)
    assert "winning" not in raw.text and '"right"' not in raw.text  # the answer never leaves
    assert [c["id"] for c in raw.json()["cards"]] == chosen
    left_out = {"card_id": ids[-1], "choice": "a", "response_ms": 900}
    assert client.post("/responses", json=left_out, headers=learner).status_code == 403  # a card the creator left out

    def play(who, wrong=0):
        last = None
        for i, cid in enumerate(chosen):
            right = sorted(CARDS[cid].winning)[0]
            choice = right if i >= wrong else next(o.id for o in CARDS[cid].options if o.id != right)
            last = client.post("/responses", json={"card_id": cid, "choice": choice, "response_ms": 900}, headers=who).json()
        return last

    before = client.get("/me", headers=learner).json()["credits"]
    fund = db.fund_balance(market.FUND_START, market.STEP_KIND)
    last = play(learner)
    assert last["is_correct"] and last["gate_complete"] and last["cert"]["topic"] == "Planning" and last["bonus"] == market.STEP_BONUS
    assert client.get("/me", headers=learner).json()["credits"] == before + market.STEP_BONUS
    assert db.fund_balance(market.FUND_START, market.STEP_KIND) == fund - market.STEP_BONUS - market.STEP_ROYALTY
    assert step(learner)["state"] == "done"
    assert client.get("/me/sphere", headers=learner).status_code == 200

    # two of four right is not a pass: no certificate, no bonus, no royalty
    missed = play(signup(client, "Guesser"), wrong=2)
    assert missed["gate_complete"] and missed["cert"] is None and missed["bonus"] == 0
    # the creator may play its own step, and earns no royalty for it
    assert play(auth)["bonus"] == market.STEP_BONUS

    seat = client.get("/creator", headers=auth).json()
    assert seat["made"][0]["passes"] == 1 and seat["made"][0]["earned"] == market.STEP_ROYALTY
    assert seat["budget"] == 1000 - market.CLAIM_FEE - market.CREW_FEE + market.STEP_ROYALTY
    purse = next(w for w in client.get("/wallets", headers=auth).json()["wallets"] if w["seat"] == "creator")
    assert purse["lines"][0]["label"] == "Skill royalty" and "Learner" not in str(purse)  # paid, and not told by whom
    assert db.ledger_total() == 0

    # the creator deletes their data: the step closes, and the sums still hold
    client.delete("/me", headers=auth)
    assert step(learner)["state"] == "soon"
    assert client.get("/me/activity", headers=learner).status_code == 200
    assert db.ledger_total() == 0
