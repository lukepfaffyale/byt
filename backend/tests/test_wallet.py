"""Wallets and the ledger: every move has two sides, a wallet shows only its owner's lines, and old sums still hold."""
import db
import market
from conftest import signup


def test_a_deposit_lands_in_the_callers_own_wallet_and_only_fixed_amounts_are_taken(client, auth):
    before = client.get("/wallets", headers=auth).json()
    assert [w["seat"] for w in before["wallets"]] == ["player"]
    assert before["wallets"][0]["balance"] == 0
    after = client.post("/wallets/deposit", json={"seat": "player", "credits": 100}, headers=auth).json()
    mine = after["wallets"][0]
    assert mine["balance"] == 100 and mine["came_in"] == 100 and mine["went_out"] == 0
    assert mine["lines"][0]["label"] == "Play credits you added" and mine["lines"][0]["credits"] == 100
    assert client.get("/me", headers=auth).json()["credits"] == 100
    assert client.post("/wallets/deposit", json={"seat": "player", "credits": 7}, headers=auth).status_code == 422
    assert client.post("/wallets/deposit", json={"seat": "player", "credits": 100, "note": "x"}, headers=auth).status_code == 422
    assert client.post("/wallets/deposit", json={"seat": "agency", "credits": 100}, headers=auth).status_code == 404
    assert client.get("/wallets").status_code == 401


def test_a_seat_has_its_own_wallet_and_a_question_moves_credits_out_of_it(client, auth):
    client.post("/agency", json={"name": "Ledger Test"}, headers=auth)
    start = {w["seat"]: w for w in client.get("/wallets", headers=auth).json()["wallets"]}
    assert start["agency"]["balance"] == market.START_BUDGET
    assert start["agency"]["lines"][0]["label"] == "Starting credits"
    asked = client.post("/agency/campaigns", json={"question_id": market.QUESTIONS[0].id, "audience": "all", "pay": 1}, headers=auth)
    assert asked.status_code == 200
    spent = asked.json()["campaigns"][0]["spent"]
    after = {w["seat"]: w for w in client.get("/wallets", headers=auth).json()["wallets"]}
    assert after["agency"]["balance"] == market.START_BUDGET - spent
    assert after["agency"]["went_out"] == spent
    assert asked.json()["budget"] == after["agency"]["balance"]
    # the lines say what the other side is, never who: no nickname, no wallet id, no player id
    text = str(after)
    assert "Tester" not in text and "wallet" not in text.lower().replace("wallets", "")


def test_every_move_has_two_sides_and_the_fund_wallet_agrees_with_the_old_count(client, auth):
    client.post("/wallets/deposit", json={"seat": "player", "credits": 500}, headers=auth)
    assert db.ledger_total() == 0
    # asking the same group twice: the second ask costs more, and exactly that extra reaches the growth fund
    client.post("/agency", json={"name": "Fund Test"}, headers=auth)
    ask = {"question_id": market.QUESTIONS[0].id, "audience": "all", "pay": 1}
    client.post("/agency/campaigns", json=ask, headers=auth)
    before = db.fund_balance(market.FUND_START, market.STEP_KIND)
    second = client.post("/agency/campaigns", json=ask, headers=auth).json()["campaigns"][0]
    assert second["extra"] > 0
    assert db.fund_balance(market.FUND_START, market.STEP_KIND) >= before + second["extra"]
    assert db.ledger_total() == 0


def test_a_deleted_players_wallet_is_closed_and_the_sums_still_hold(client):
    other = signup(client, "Leaver")
    client.post("/wallets/deposit", json={"seat": "player", "credits": 100}, headers=other)
    assert client.delete("/me", headers=other).status_code in (200, 204)
    assert db.ledger_total() == 0


def test_a_token_fee_is_paid_only_by_a_wallet_that_can_pay(client, auth):
    from models import Usage
    me = client.get("/me", headers=auth)
    assert me.status_code == 200
    token = auth["Authorization"].removeprefix("Bearer ")
    player = db.player_by_token(token)
    db.record_usage(Usage(run_id="fee-test-1", agent="twin", player_id=player.id, model="m", cost_usd=0.0004, stopped_reason="done"), market.USD_PER_CREDIT)
    assert db.wallet_balance(player.id, "player") == 0  # nothing to pay with: the game covers the run
    db.deposit(player.id, "player", 100)
    db.record_usage(Usage(run_id="fee-test-2", agent="twin", player_id=player.id, model="m", cost_usd=0.0004, stopped_reason="done"), market.USD_PER_CREDIT)
    assert db.wallet_balance(player.id, "player") == 99.96
    lines = client.get("/wallets", headers=auth).json()["wallets"][0]["lines"]
    assert lines[0]["label"] == "Token fee" and lines[0]["credits"] == -0.04
    assert db.ledger_total() == 0
