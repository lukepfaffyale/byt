"""Price tiers: a free Sym costs half, going deeper reaches only members and pays each of them more."""
import db
import market

from tests.conftest import signup
from tests.test_market import play_gates


def test_tier_rules():
    free = market.TwinFacts("f", True, 10, False, "organise", {})
    member = market.TwinFacts("m", False, 10, False, "organise", {})
    proven = market.TwinFacts("c", False, 10, True, "organise", {})
    assert [market.in_tier(t, "blend") for t in (free, member, proven)] == [True, True, True]
    assert [market.in_tier(t, "members") for t in (free, member, proven)] == [False, True, True]
    assert [market.in_tier(t, "core") for t in (free, member, proven)] == [False, False, True]
    assert market.tier_cost(12, 1, 2, "blend", 0) == (14, 0)  # 12 free at 1, 1 member at 2
    assert market.tier_cost(0, 5, 2, "members", 0) == (20, 0) and market.tier_cost(0, 5, 2, "core", 0) == (30, 0)
    assert market.tier_cost(0, 5, 2, "members", 1) == (30, 10)  # asking the same group again still costs more
    assert market.tier_cost(3, 0, 1, "blend", 0) == (2, 0)  # half credits round up for the agency


def test_members_only_reaches_no_free_twin_and_pays_each_member_double(client, auth):
    members = [signup(client, f"Member{i}") for i in range(market.MIN_TWINS)]
    for m in members:
        play_gates(client, m, 1)
        client.post("/me/consent", headers=m, json={"data_income": True})
    agency = client.post("/agency", headers=auth, json={"name": "Deep Reach"}).json()
    assert [t["id"] for t in agency["tiers"]] == ["blend", "members", "core"] and agency["free_share"] == market.FREE_SHARE
    free_n, member_n = agency["reach"]["all"]["blend"]
    assert free_n == len(db.free_twin_ids()) and member_n >= market.MIN_TWINS
    assert agency["reach"]["all"]["members"] == [0, member_n]
    assert agency["reach"]["all"]["core"] is None  # fewer than the minimum hold a certificate: hidden, not counted

    body = {"question_id": "q-price", "audience": "all", "pay": 2, "depth": "members"}
    before = client.get("/jobs", headers=members[0]).json()["data_credits"]
    out = client.post("/agency/campaigns", headers=auth, json=body).json()
    camp = out["campaigns"][0]
    assert camp["sample_twins"] == 0 and camp["twins"] == member_n and camp["depth"] == "Members only"
    assert camp["spent"] == member_n * 4 and out["budget"] == market.START_BUDGET - member_n * 4
    assert client.get("/jobs", headers=members[0]).json()["data_credits"] == before + 4
    assert db.ledger_total() == 0

    assert client.post("/agency/campaigns", headers=auth, json={**body, "depth": "core"}).status_code == 409
    assert client.post("/agency/campaigns", headers=auth, json={**body, "depth": "vip"}).status_code == 422
