"""The loops between seats: an agency backs a skill, a creator builds for it, a player passes and earns, and the
creator earns again when an agency reaches that player. Also the plan, the twin that works by itself, and the world."""
import db
import market
import work
from conftest import signup
from content import CARDS
from tests.test_market import play_gates


def test_an_agency_backs_a_skill_a_creator_builds_it_and_both_loops_pay(client, auth):
    # the creator claims and builds the one "Understanding people" step
    client.post("/creator", json={"name": "Kind Signals"}, headers=auth)
    client.post("/wallets/deposit", json={"seat": "creator", "credits": 100}, headers=auth)
    client.post("/creator/briefs", json={"kind": "skill", "topic": "reading-people"}, headers=auth)
    pack = client.get("/creator", headers=auth).json()["packs"][0]
    chosen = [c["id"] for c in pack["cards"]][:market.STEP_CARDS]
    client.post("/creator/steps", json={"pack": pack["id"], "cards": chosen}, headers=auth)

    # an agency puts 50 credits behind that skill: taps only
    boss = signup(client, "Agency Boss")
    client.post("/agency", json={"name": "People First"}, headers=boss)
    for bad in ({"skill": "reading-people", "budget": 7}, {"skill": "voice", "budget": 50}, {"skill": "reading-people", "budget": 50, "note": "typed"}):
        assert client.post("/agency/sponsor", json=bad, headers=boss).status_code == 422
    seat = client.post("/agency/sponsor", json={"skill": "reading-people", "budget": 50}, headers=boss).json()
    assert seat["budget"] == market.START_BUDGET - 50 and seat["sponsorships"][0]["open"]
    need = next(n for n in client.get("/creator", headers=auth).json()["needs"] if n["skill"] == "reading-people")
    assert need["left"] == 50 and need["built"] is True and "People First" not in str(client.get("/creator", headers=auth).json())

    # a player passes the step: the fund pays the bonus, the sponsor pays the player and the creator
    player = signup(client, "Good Listener")
    play_gates(client, player, 1)
    last = None
    for cid in chosen:
        last = client.post("/responses", json={"card_id": cid, "choice": sorted(CARDS[cid].winning)[0], "response_ms": 900}, headers=player).json()
    assert last["bonus"] == market.STEP_BONUS and last["sponsored"] == market.SPONSOR_PLAYER
    made = client.get("/creator", headers=auth).json()
    assert made["sponsor_earned"] == market.SPONSOR_MAKER and made["made"][0]["passes"] == 1
    backed = client.get("/agency", headers=boss).json()["sponsorships"][0]
    assert backed["spent"] == market.SPONSOR_PLAYER + market.SPONSOR_MAKER and backed["passes"] == 1

    # the agency posts a job; the same player's twin takes it and the player corrects it
    hold = round(20 * work.CERT_MULTIPLIER * (1 + market.REACH_SHARE))
    post = client.post("/agency/jobs", json={"question_id": "q-launch", "pay": 20, "seats": 5}, headers=boss).json()["postings"][0]
    ran = client.post(f"/jobs/{post['id']}/run", headers=player).json()
    other = next(o["id"] for o in ran["options"] if o["id"] != ran["answer"])
    result = client.post(f"/jobs/{post['id']}/review", json={"verdict": "corrected", "choice": other}, headers=player).json()
    earned = result["credits_earned"]
    assert earned == work.TEACHING_PAY
    # the creator earns a royalty because the agency reached a player who passed its step
    assert client.get("/creator", headers=auth).json()["reach_earned"] == round(earned * market.REACH_SHARE, 2)
    after = client.get("/agency", headers=boss).json()
    assert after["budget"] == round(market.START_BUDGET - 50 - 5 * hold + hold - earned - earned * market.REACH_SHARE, 2)
    # the twin was wrong and its human taught it: that is an insight certificate
    assert result["insight"]["kind"] == "insight" and result["insight"]["level"] == "My twin learned this from me"
    assert client.post(f"/agency/jobs/{post['id']}/close", headers=boss).status_code == 200  # leave no open job behind
    assert db.ledger_total() == 0


def test_the_plan_the_twin_that_works_by_itself_and_the_world(client, auth):
    plan = client.get("/me/plan", headers=auth).json()["options"]
    assert plan and plan[0]["id"].startswith("gate:") and all(o["why"] for o in plan)
    assert client.post("/me/auto", json={"per_day": 2}, headers=auth).status_code == 422
    assert client.post("/me/auto", json={"per_day": 1}, headers=auth).json()["auto_per_day"] == 1
    play_gates(client, auth, 1)  # the first job opens
    client.get("/me", headers=auth)  # the twin starts one job by itself
    states = [j["state"] for j in client.get("/jobs", headers=auth).json()["jobs"]]
    assert states.count("review") == 1  # one a day, and nothing is paid before the owner checks it
    client.get("/me", headers=auth)
    assert [j["state"] for j in client.get("/jobs", headers=auth).json()["jobs"]].count("review") == 1
    assert client.get("/me/plan", headers=auth).json()["options"][0]["title"] == "Check your twin's answer"

    world = client.get("/world")  # open to anyone
    assert world.status_code == 200 and "Tester" not in world.text and "nickname" not in world.text
    body = world.json()
    assert body["flows"] and body["twins_free"] >= 12 and abs(sum(body["balances"].values())) < 0.01
