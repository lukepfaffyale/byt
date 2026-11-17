"""Three ideas taken from VoiceMem after reading it (docs/SOURCES.md): a fixed list of topics, sending the Guide
only the part a line is about, and needs that emerge from what agencies ask for together. All plain code."""
import db
import main
import market
from content import TOPIC_NAME, topic_id

from tests.conftest import signup
from tests.test_market import play_gates
from tests.test_twin import player_id


def test_a_free_word_lands_on_one_of_the_fixed_topics():
    assert topic_id("Style") == "style" and topic_id("clothing") == "style" and topic_id("Routine spending") == "spending"
    assert topic_id("mornings") == "free-time" and topic_id("something else") == "general" and topic_id("") == "general"
    assert set(TOPIC_NAME) == {t["id"] for t in main.TOPICS} and "general" in TOPIC_NAME


def test_an_agency_can_reach_twins_that_hold_a_view_on_a_topic(client, auth):
    twin = market.TwinFacts("p", False, 10, False, "organise", {}, frozenset({"food"}))
    assert market.matches(twin, "view-food") and not market.matches(twin, "view-style")
    assert "view-food" in market.AUDIENCE_NAME and "view-general" not in market.AUDIENCE_NAME
    members = [signup(client, f"Viewer{i}") for i in range(market.MIN_TWINS)]
    for m in members:
        play_gates(client, m, 1)
        client.post("/me/consent", headers=m, json={"data_income": True})
        db.replace_tendencies(player_id(m), [("Food", "This person picks the same few foods.", 4, "topic")])
    client.post("/agency", headers=auth, json={"name": "Topic Reach"})
    client.post("/wallets/deposit", headers=auth, json={"seat": "agency", "credits": 1000})
    out = client.post("/agency/campaigns", headers=auth, json={"question_id": "q-price", "audience": "view-food", "pay": 1}).json()
    camp = out["campaigns"][0]
    assert camp["audience"] == "Has a view on: Food" and camp["twins"] >= market.MIN_TWINS and camp["sample_twins"] == 0
    assert client.post("/agency/campaigns", headers=auth, json={"question_id": "q-price", "audience": "view-tone", "pay": 1}).status_code == 409


def test_the_guide_is_sent_only_the_part_the_line_is_about():
    situation = {k: [k] for k in ("beliefs", "progress", "areas", "weakest_area", "work", "ways_to_earn", "money",
                                  "how_sure_and_how_right", "told_by_person", "best_use_of_time_now", "moves", "topics")}
    money = main.narrow(situation, "Why did my credits change?")
    assert {"money", "moves", "best_use_of_time_now"} <= set(money) and "areas" not in money and "beliefs" not in money
    about_me = main.narrow(situation, "Where am I weak?")
    assert "areas" in about_me and "money" not in about_me
    told = main.narrow(situation, "I like quiet mornings.")  # names nothing: most often about the person
    assert set(told) == {"moves", "best_use_of_time_now", "topics", "beliefs", "told_by_person", "progress"}


def test_creators_see_what_agencies_ask_about_and_a_pair_that_several_want_together(client, auth):
    bosses = [signup(client, f"Boss{i}") for i in range(main.EMERGE_MIN)]
    for i, boss in enumerate(bosses):
        client.post("/agency", headers=boss, json={"name": f"Pair Agency {i}"})
        for skill in ("logic", "planning"):
            assert client.post("/agency/sponsor", headers=boss, json={"skill": skill, "budget": 50}).status_code == 200
    seat = client.post("/creator", headers=auth, json={"name": "Listening Studio"}).json()
    wanted = {w["skill"]: w for w in seat["wanted"]}
    assert wanted["logic"]["agencies"] >= main.EMERGE_MIN and wanted["planning"]["agencies"] >= main.EMERGE_MIN
    pairs, shown = main.demand({})[1], seat["emerging"]
    assert shown and all(p["agencies"] >= main.EMERGE_MIN for p in shown) and len(shown) <= 5 and len(pairs) == len(shown)
    assert "Pair Agency" not in str(seat)  # counts only: no agency is named


def test_the_brain_is_given_one_hub_for_each_belief_and_each_kept_fact(client, auth):
    play_gates(client, auth, 1)
    pid = player_id(auth)
    db.replace_tendencies(pid, [("Food", "This person picks the same few foods.", 4, "topic"), ("Buying", "This person waits for a sale.", 3)])
    db.add_fact(pid, "trait", "planning", "This person plans the week ahead.", 30)
    hubs = client.get("/me/sphere", headers=auth).json()["hubs"]
    assert {"area": "habit", "name": "Food", "told": False} in hubs
    assert {"area": "executive", "name": "Spending", "told": False} in hubs  # a free word mapped to the fixed topic
    assert {"area": "executive", "name": "Planning", "told": True} in hubs

