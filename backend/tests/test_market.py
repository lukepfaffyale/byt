"""The agency seat: batch questions to opted-in Syms, counts only, play credits both ways."""
import db
import market
from content import GATES

from tests.conftest import signup


def play_gates(client, auth, n):
    for g in GATES[:n]:
        if g.kind == "battle":
            client.post("/battles", headers=auth, json={"gate_id": g.id})
        for card in client.get(f"/gates/{g.id}/cards", headers=auth).json()["cards"]:
            client.post("/responses", headers=auth, json={"card_id": card["id"], "choice": card["options"][0]["id"], "response_ms": 700})


def test_rules():
    q = market.QUESTION_BY_ID["q-price"]
    twin = market.TwinFacts("p", False, 10, False, "organise", {"quality": 3, "save": 1})
    assert market.answer(q, twin) == "b"
    assert market.matches(twin, "all") and market.matches(twin, "organise")
    assert not market.matches(twin, "certified") and not market.matches(twin, "explore")
    assert not market.matches(market.TwinFacts("p", False, 3, True, None, {}), "all")  # too few picks to be asked
    assert market.tally(q, ["a", "b", "b"]) == {"a": 1, "b": 2, "c": 0}


def test_agency_needs_a_seat_and_valid_taps(client, auth):
    assert client.get("/agency", headers=auth).json()["exists"] is False
    body = {"question_id": "q-price", "audience": "all", "pay": 2}
    assert client.post("/agency/campaigns", headers=auth, json=body).status_code == 404
    assert client.post("/agency", headers=auth, json={"name": "<script>"}).status_code == 422
    agency = client.post("/agency", headers=auth, json={"name": "North Star Ads"}).json()
    assert agency["exists"] and agency["budget"] == market.START_BUDGET and len(agency["questions"]) == 6
    assert client.post("/agency/campaigns", headers=auth, json={**body, "pay": 3}).status_code == 422
    assert client.post("/agency/campaigns", headers=auth, json={**body, "question": "typed text"}).status_code == 422


def test_campaign_pays_only_opted_in_twins_and_returns_counts_only(client, auth):
    player = signup(client, "Earner")
    play_gates(client, player, 1)  # 8 preference picks: enough to be asked
    quiet = signup(client, "Quiet")
    play_gates(client, quiet, 1)  # same picks, but never opts in
    assert client.post("/me/consent", headers=player, json={"data_income": True}).json()["data_income"] is True

    client.post("/agency", headers=auth, json={"name": "North Star Ads"})
    agency = client.post("/agency/campaigns", headers=auth, json={"question_id": "q-price", "audience": "all", "pay": 2}).json()
    camp = agency["campaigns"][0]
    free = len(db.free_twin_ids())  # the made-up twins, and the twins of players who left in other tests
    assert camp["sample_twins"] == free and camp["twins"] == free + 1  # the opted-in player, not the quiet one
    assert camp["spent"] == free + 2 and agency["budget"] == market.START_BUDGET - free - 2  # a free twin costs half
    assert sum(r["count"] for r in camp["split"]) == free + 1
    assert set(camp) == {"kind", "question", "audience", "depth", "pay", "twins", "sample_twins", "spent", "extra", "split", "created_at"}

    earned = client.get("/jobs", headers=player).json()
    assert earned["data_credits"] == 2 and earned["data_answers"] == 1 and earned["credits"] == 2
    assert client.get("/jobs", headers=quiet).json()["data_credits"] == 0
    assert client.get("/me", headers=player).json()["credits"] == 2


def test_small_audiences_return_nothing_and_cost_nothing(client, auth):
    client.post("/agency", headers=auth, json={"name": "North Star Ads"})
    r = client.post("/agency/campaigns", headers=auth, json={"question_id": "q-price", "audience": "certified", "pay": 1})
    assert r.status_code == 409 and "nothing was charged" in r.json()["detail"]
    assert client.get("/agency", headers=auth).json()["budget"] == market.START_BUDGET


def test_deleting_the_agency_owner_leaves_what_players_earned(client, auth):
    player = signup(client, "Keeper")
    play_gates(client, player, 1)
    client.post("/me/consent", headers=player, json={"data_income": True})
    client.post("/agency", headers=auth, json={"name": "Gone Tomorrow"})
    client.post("/agency/campaigns", headers=auth, json={"question_id": "q-launch", "audience": "all", "pay": 5})
    assert client.delete("/me", headers=auth).status_code == 200
    assert client.get("/jobs", headers=player).json()["data_credits"] == 5


def test_money_shows_where_credits_came_from_and_the_agency_spend(client, auth):
    play_gates(client, auth, 1)
    client.post("/me/consent", headers=auth, json={"data_income": True})
    client.post("/jobs/job-tagline/run", headers=auth)
    client.post("/jobs/job-tagline/review", headers=auth, json={"verdict": "approved"})
    client.post("/agency", headers=auth, json={"name": "North Star Ads"})
    client.post("/agency/campaigns", headers=auth, json={"question_id": "q-price", "audience": "all", "pay": 2})
    m = client.get("/me/money", headers=auth).json()
    assert m["work_credits"] == 20 and m["data_credits"] == 2 and m["earned"] == 22
    assert {line["source"] for line in m["lines"]} == {"Work", "Data"}
    spent = m["agency"]["spent"]  # other tests leave opted-in players behind, so the crowd is 13 or more
    free = len(db.free_twin_ids())  # a free twin costs half the price; a member costs the price
    assert spent == free + (m["agency"]["twins_asked"] - free) * 2 >= 14 and m["agency"]["left"] == market.START_BUDGET - spent
    assert m["agency"]["lines"][0]["credits"] == -spent
    other = signup(client, "Stranger")
    fresh = client.get("/me/money", headers=other).json()
    assert fresh["earned"] == 0 and fresh["lines"] == [] and fresh["agency"] is None


def test_spheres_keep_their_history_and_seats_have_their_own(client, auth):
    play_gates(client, auth, 2)
    mine = client.get("/me/sphere", headers=auth).json()
    assert [f["label"] for f in mine["history"]] == [GATES[0].title, GATES[1].title]
    assert len(mine["history"][0]["levels"]) == len(mine["verticals"])
    assert mine["history"][-1]["levels"] == [v["level"] for v in mine["verticals"]]  # the last frame is the present
    assert sum(mine["history"][0]["levels"]) <= sum(mine["history"][1]["levels"])

    before = client.get("/seats/agency/sphere", headers=auth).json()
    assert before["mode"] == "clusters" and before["balance"] is None and before["history"] == []
    assert [v["key"] for v in before["verticals"]] == ["analyse", "organise", "explore", "connect", "forming", "agencies", "creators"]
    shown = [v for v in before["verticals"] if v["count"] and v["key"] not in ("agencies", "creators")]
    assert shown and all(v["count"] >= market.MIN_TWINS and len(v["dots"]) == v["count"] and v["earned"] == 0 for v in shown)
    assert all(0 <= d <= 1 for v in shown for d in v["dots"])
    for v in before["verticals"]:
        if v["hidden"]:  # a small group shows nothing at all
            assert v["count"] is None and v["dots"] == [] and "Fewer than 5" in v["details"][0]
    text = str(before)
    assert not __import__("re").search(r"BOT Sym [A-Z]", text) and "nickname" not in text  # groups only, never a name

    client.post("/agency", headers=auth, json={"name": "North Star Ads"})
    client.post("/agency/campaigns", headers=auth, json={"question_id": "q-price", "audience": "all", "pay": 1})
    after = client.get("/seats/agency/sphere", headers=auth).json()
    reached = [v for v in after["verticals"] if v["count"] and v["key"] not in ("agencies", "creators")]
    assert all(v["earned"] == 1 for v in reached) and after["balance"] is not None
    assert any("You have asked this group 1 time." in v["details"] for v in reached)

    creator = client.get("/seats/creator/sphere", headers=auth).json()
    assert creator["mode"] == "clusters" and any(v["name"].startswith("Needs to grow") for v in creator["verticals"])
    assert client.get("/seats/nobody/sphere", headers=auth).status_code == 404


def test_asking_the_same_group_again_costs_more_and_the_extra_fills_the_growth_fund(client, auth):
    assert market.price_times(0) == 1 and market.price_times(1) == 1.5 and market.price_times(9) == market.REPEAT_CAP
    assert market.campaign_cost(12, 2, 0) == (24, 0) and market.campaign_cost(12, 2, 1) == (36, 12)
    player = signup(client, "Steady")
    play_gates(client, player, 1)
    client.post("/me/consent", headers=player, json={"data_income": True})
    client.post("/agency", headers=auth, json={"name": "Twice Asked"})
    body = {"question_id": "q-price", "audience": "all", "pay": 2}
    first = client.post("/agency/campaigns", headers=auth, json=body).json()
    fund_before = first["fund"]
    assert first["campaigns"][0]["extra"] == 0 and first["price_times"]["all"] == 1.5 and first["price_times"]["analyse"] == 1
    second = client.post("/agency/campaigns", headers=auth, json={**body, "question_id": "q-launch"}).json()
    camp = second["campaigns"][0]
    first_price = camp["sample_twins"] + (camp["twins"] - camp["sample_twins"]) * 2
    assert camp["spent"] == -(-first_price * 3 // 2) and camp["extra"] == camp["spent"] - first_price > 0
    assert second["fund"] == fund_before + camp["extra"] and second["price_times"]["all"] == 2.0
    # the twin was paid the same both times: the extra did not go to the twins
    assert client.get("/jobs", headers=player).json()["data_credits"] == 4


def test_passing_a_skill_step_is_paid_once_from_the_growth_fund(client, auth):
    for card in client.get(f"/gates/{GATES[0].id}/cards", headers=auth).json()["cards"]:
        client.post("/responses", headers=auth, json={"card_id": card["id"], "choice": card["options"][0]["id"], "response_ms": 700})
    from content import CARDS
    fund = client.get("/me/money", headers=auth).json()["fund"]
    last = None
    for cid in GATES[1].card_ids:  # the first strategy gate: play the winning move on every board
        last = client.post("/responses", headers=auth, json={"card_id": cid, "choice": sorted(CARDS[cid].winning)[0], "response_ms": 900}).json()
    assert last["cert"] is not None and last["bonus"] == market.STEP_BONUS
    m = client.get("/me/money", headers=auth).json()
    assert m["growth_credits"] == market.STEP_BONUS and m["fund"] == fund - market.STEP_BONUS and m["earned"] == market.STEP_BONUS
    assert any(line["source"] == "Growth" and "One move to win" in line["label"] for line in m["lines"])
    assert client.get("/jobs", headers=auth).json()["data_answers"] == 0  # a growth bonus is not a data answer


def test_one_login_can_open_both_other_seats(client, auth):
    assert client.get("/creator", headers=auth).json()["exists"] is False
    made = client.post("/creator", headers=auth, json={"name": "Bright Skills"}).json()
    assert made["exists"] is True and made["name"] == "Bright Skills" and made["budget"] == 0
    assert client.post("/creator", headers=auth, json={"name": "Other Name"}).json()["name"] == "Bright Skills"  # one seat each
    assert client.post("/creator", headers=auth, json={"name": "<b>"}).status_code == 422
    assert client.post("/agency", headers=auth, json={"name": "North Star Ads"}).json()["exists"] is True
    other = signup(client, "Onlooker")
    seen = {v["key"]: v for v in client.get("/seats/agency/sphere", headers=other).json()["verticals"]}
    assert seen["creators"]["count"] >= 1 and seen["agencies"]["count"] >= 1
    assert "Bright Skills" not in str(seen) and "North Star" not in str(seen)  # a count, never a name


def test_days_played_are_kept_and_a_twin_with_an_absent_owner_receives_less(client, auth):
    from datetime import timedelta

    import db
    from models import ActiveDay, Player
    from sqlmodel import Session, delete, select

    assert market.activity_share(0) == 1 and market.activity_share(7) == 1
    assert market.activity_share(8) == 0.5 and market.activity_share(31) == 0.25 and market.activity_share(None) == 0.25
    assert market.twin_pay(5, 0) == 5 and market.twin_pay(5, 10) == 3 and market.twin_pay(5, 99) == 2
    assert market.twin_pay(1, 99) == 1  # an absent owner's twin is still asked and still paid
    absent = signup(client, "Absent")
    play_gates(client, absent, 1)
    client.post("/me/consent", headers=absent, json={"data_income": True})
    me = client.get("/me", headers=absent).json()
    assert me["active_days"] == 1 and me["income_share"] == 1
    today = db.utcnow().date()
    assert client.get("/me/activity", headers=absent).json()["days_played"] == [today.isoformat()]
    assert client.get("/me/export", headers=absent).json()["days_played"] == [today.isoformat()]

    # the owner stops playing: their last day becomes ten days ago
    with Session(db.get_engine()) as s:
        pid = s.exec(select(Player.id).where(Player.nickname == "Absent").order_by(Player.created_at.desc())).first()
        s.exec(delete(ActiveDay).where(ActiveDay.player_id == pid))
        s.add(ActiveDay(player_id=pid, day=(today - timedelta(days=10)).isoformat()))
        s.commit()
    db._marked.discard((pid, today.isoformat()))
    assert db.days_since_active(pid) == 10

    client.post("/agency", headers=auth, json={"name": "Patient Ads"})
    before = client.get("/agency", headers=auth).json()["fund"]
    after = client.post("/agency/campaigns", headers=auth, json={"question_id": "q-price", "audience": "all", "pay": 2}).json()
    with Session(db.get_engine()) as s:
        from models import Earning
        got = [e.credits for e in s.exec(select(Earning).where(Earning.player_id == pid)).all()]
    assert got == [1]  # half of 2: the owner had not played for more than 7 days
    assert after["fund"] >= before + 1  # the part held back went to the growth fund
    # reading their own page counts as playing again
    assert client.get("/me", headers=absent).json()["income_share"] == 1
    client.delete("/me", headers=absent)
    with Session(db.get_engine()) as s:
        assert s.exec(select(ActiveDay).where(ActiveDay.player_id == pid)).first() is None
