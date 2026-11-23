"""The record must match the system. These tests fail when the ontology or the docs fall behind the code."""
from pathlib import Path

import pytest
from sqlmodel import SQLModel

import agent
import main
import market
import mirror
import tools
import verifier
import work
from content import ONTOLOGY

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"


def test_every_agent_in_the_ontology_exists_with_its_one_tool_and_no_other_agent_does():
    listed = {a["id"]: a for a in ONTOLOGY["agents"]}
    assert set(listed) == {"profiler", "twin", "worker", "guide"}
    tool_source = (BACKEND / "tools.py").read_text(encoding="utf-8")
    for name, entry in listed.items():
        assert agent.get_agent(name) is not None
        assert f"def {entry['tool']}(" in tool_source
        assert f"`{entry['tool']}`" in (BACKEND / "prompts" / f"{name}.md").read_text(encoding="utf-8")
        assert entry["serves"] in {s["id"] for s in ONTOLOGY["seats"]}
        for field in ("reads", "never_reads", "output", "checked_by"):
            assert entry[field]
    with pytest.raises(ValueError):
        agent.get_agent("someone-else")
    # an agent has exactly one tool, and every tool is read-only: no function in tools.py writes to the database
    assert tool_source.count("@agent.tool") == len(listed)
    assert not any(word in tool_source for word in ("db.record", "db.save", "db.replace", "db.create", "db.issue", "db.delete", "db.set", "db.review", "db.start", "db.run"))


def test_rule_numbers_in_the_ontology_are_the_numbers_the_code_runs_on():
    rules = {r["id"]: r["value"] for r in ONTOLOGY["rules"]}
    assert set(rules["model"]) == agent.ALLOWED_MODELS
    assert rules["requests_per_run"] == agent.LIMITS.request_limit
    assert rules["tool_calls_per_run"] == agent.LIMITS.tool_calls_limit
    assert rules["battle_min_cards"] == verifier.MIN_BATTLE_CARDS
    assert rules["certificate_min_share_right"] == verifier.MIN_TWIN_ACCURACY
    assert rules["skill_pass_share"] == round(verifier.SKILL_PASS_SHARE, 3)
    assert rules["cert_max_luck"] == verifier.MAX_LUCK
    assert rules["agency_min_twins"] == market.MIN_TWINS
    assert rules["agency_min_picks"] == market.MIN_PICKS
    assert rules["agency_start_credits"] == market.START_BUDGET
    assert tuple(rules["agency_pay_choices"]) == market.PAY_CHOICES
    assert rules["free_share"] == market.FREE_SHARE and rules["tier_times"] == market.TIER_TIMES
    assert rules["certified_pay_times"] == work.CERT_MULTIPLIER
    assert rules["corrected_pay"] == work.TEACHING_PAY
    assert rules["letter_min_picks"] == mirror.LETTER_MIN_PICKS and rules["letter_min_share"] == mirror.LETTER_MIN_SHARE
    assert rules["area_full_cards"] == mirror.FULL_EVIDENCE
    assert rules["repeat_step"] == market.REPEAT_STEP and rules["repeat_cap"] == market.REPEAT_CAP
    assert rules["fund_start"] == market.FUND_START and rules["step_bonus"] == market.STEP_BONUS
    assert rules["together_full"] == market.TOGETHER_FULL
    assert rules["active_window"] == market.ACTIVE_WINDOW and rules["active_full_days"] == market.ACTIVE_FULL_DAYS
    assert rules["active_half_days"] == market.ACTIVE_HALF_DAYS
    assert rules["usd_per_credit"] == market.USD_PER_CREDIT and tuple(rules["deposit_choices"]) == market.DEPOSIT_CHOICES
    assert rules["wallet_cap"] == market.WALLET_CAP
    assert rules["creator_pay"] == market.CREATOR_PAY and rules["crew_fee"] == market.CREW_FEE
    assert rules["claim_fee"] == market.CLAIM_FEE and rules["meet_price"] == market.MEET_PRICE
    assert tuple(rules["job_pay_choices"]) == market.JOB_PAY_CHOICES and tuple(rules["job_seats"]) == market.JOB_SEATS
    assert rules["reach_share"] == market.REACH_SHARE and tuple(rules["sponsor_budgets"]) == market.SPONSOR_BUDGETS
    assert rules["sponsor_pay"] == [market.SPONSOR_PLAYER, market.SPONSOR_MAKER] and tuple(rules["auto_choices"]) == market.AUTO_CHOICES
    assert rules["step_cards"] == market.STEP_CARDS and rules["step_royalty"] == market.STEP_ROYALTY
    assert market.together(0, 0, False) == 0 and market.together(1, 0, True) == 0.5 and market.together(9, 9, True) == 1
    assert all(r["where"] and r["why"] for r in ONTOLOGY["rules"])


def test_seats_and_incomes_are_complete():
    assert [s["id"] for s in ONTOLOGY["seats"]] == ["player", "agency", "creator"]
    assert all(s["sees"] and s["never_sees"] for s in ONTOLOGY["seats"])
    assert [i["id"] for i in ONTOLOGY["incomes"]] == ["work", "data", "growth", "meet"]
    assert all(i["human_check"] and i["decided_by"].startswith("Code") for i in ONTOLOGY["incomes"])


def test_every_table_is_in_the_data_dictionary_and_every_route_in_the_logical_model():
    dictionary = (ROOT / "docs" / "data" / "data_dictionary.md").read_text(encoding="utf-8")
    missing_tables = [name for name in SQLModel.metadata.tables if name not in dictionary]
    assert missing_tables == []
    logical = (ROOT / "docs" / "data" / "logical_model.md").read_text(encoding="utf-8")
    paths = {r.path for r in main.app.routes if getattr(r, "methods", None) and not r.path.startswith(("/docs", "/openapi", "/redoc"))}
    missing_routes = sorted(p for p in paths if p not in logical)
    assert missing_routes == []


def test_no_model_decides_money_certificates_or_what_an_agency_sees():
    # the modules that decide these things never import the agent module or a model library
    for module in ("verifier.py", "work.py", "market.py", "mirror.py"):
        source = (BACKEND / module).read_text(encoding="utf-8")
        assert "pydantic_ai" not in source and "import agent" not in source and "openai" not in source
    assert tools.MAX_PICKS == 80


def test_worth_is_never_money():
    assert {p["id"] for p in ONTOLOGY["principles"]} >= {"worth_is_not_money", "same_pay_for_everyone", "balance_is_shown", "groups_not_people",
                                                           "asking_again_costs_more", "money_flows_to_progress"}
    assert all(p["rule"] and p["where"] for p in ONTOLOGY["principles"])
    # balance looks only at how many twins were reached in each group
    assert market.balance({}) is None
    assert market.balance({"analyse": 40}) == 0.0
    assert market.balance({"analyse": 10, "organise": 10, "explore": 10, "connect": 10}) == 1.0
    assert 0 < market.balance({"analyse": 30, "organise": 5}) < 1
    # the code that sizes a point and scores balance never reads credits, budgets or pay
    source = (BACKEND / "main.py").read_text(encoding="utf-8")
    body = source[source.index("def seat_groups"):source.index("def seat_sphere")]
    assert not any(word in body for word in ("credits", "budget", "spent", ".pay", "pay_for"))
