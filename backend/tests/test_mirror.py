"""The mirror: suggested letters from picks, what the player told us, and the verdict between them."""
import db
import mirror
from content import CARDS, GATE_BY_ID, GATES
from sqlmodel import Session, select

from models import SelfReport


def test_letters_stay_open_until_enough_picks():
    axes = mirror.read_axes([("thnk-03", "a"), ("thnk-07", "a")])
    assert axes[0].first_picks == 2 and axes[0].letter is None
    assert mirror.suggested_type(axes) == "...."
    # 5 picks all on one side are still too few: a letter needs at least 6
    five = [("thnk-03", "a"), ("thnk-07", "a"), ("thnk-13", "a"), ("wknd-02", "yes"), ("wknd-05", "yes")]
    assert mirror.read_axes(five)[0].first_picks == 5 and mirror.read_axes(five)[0].letter is None
    # a four-option card adds nothing to the letters (each option feeds a different axis)
    assert mirror.read_axes(five + [("thnk-12", "d")])[0].first_picks == 5
    assert mirror.read_axes([("thnk-11", "a"), ("thnk-12", "a")])[1].first_picks == 0
    assert mirror.read_axes(five + [("food-08", "a")])[0].letter == "E"


def test_letters_need_a_clear_lean_and_ties_stay_open():
    # the first option on every deck of picks: Energy 6 to 0 and Plans 10 to 1 show a letter; facts and ideas,
    # head and heart have only 3 two-option cards each, so those letters stay open
    picks = [(cid, CARDS[cid].options[0].id) for g in GATES if g.kind == "preference" for cid in g.card_ids]
    axes = mirror.read_axes(picks)
    assert mirror.suggested_type(axes) == "E..J"
    assert (axes[0].first_picks, axes[0].second_picks) == (6, 0) and (axes[3].first_picks, axes[3].second_picks) == (10, 1)
    social = [("thnk-03", "a"), ("thnk-07", "a"), ("thnk-13", "a"), ("wknd-02", "yes")]
    four_two = mirror.read_axes(social + [("wknd-05", "no"), ("food-08", "b")])[0]  # a share of 0.67: too close to call
    assert (four_two.first_picks, four_two.second_picks, four_two.letter) == (4, 2, None)
    five_one = mirror.read_axes(social + [("wknd-05", "yes"), ("food-08", "b")])[0]  # a share of 0.83: a lean
    assert (five_one.first_picks, five_one.second_picks, five_one.letter) == (5, 1, "E")
    even = mirror.read_axes([("thnk-03", "a"), ("thnk-07", "b"), ("wknd-02", "yes"), ("wknd-05", "no")])
    assert even[0].letter is None


def test_styles_are_a_share_of_chances_not_a_raw_count():
    picks = [(cid, "a") for cid in GATE_BY_ID["thinking-1"].card_ids]
    styles = {s.key: s for s in mirror.read_styles(picks)}
    assert styles["analyse"].picks == styles["analyse"].chances
    assert styles["explore"].picks == 0 and styles["explore"].chances > 0
    assert mirror.top_styles(list(styles.values())) == ["analyse"]


def test_verdicts():
    assert mirror.axis_verdict("E", "E") == "aligned"
    assert mirror.axis_verdict("E", "I") == "differs"
    assert mirror.axis_verdict(None, "I") == "open"
    assert mirror.axis_verdict("E", None) == "not told"
    assert mirror.style_verdict(["organise"], {"organise": 4, "explore": 3}) == "aligned"
    assert mirror.style_verdict(["explore"], {"organise": 4, "explore": 3}) == "differs"
    assert mirror.style_verdict([], {"organise": 4}) == "open"
    assert mirror.style_verdict(["explore"], {}) == "not told"


def test_tell_show_clear_and_delete(client, auth):
    empty = client.get("/me/mirror", headers=auth).json()
    assert empty["suggested_type"] == "...." and empty["told"]["sign"] is None

    told = client.post("/me/told", headers=auth, json={"ei": "E", "jp": "J", "sign": "scorpio", "organise": 4}).json()
    assert told["told"]["sign"] == "scorpio" and told["axes"][0]["told"] == "E"
    assert told["axes"][0]["verdict"] == "open" and told["axes"][1]["verdict"] == "not told"
    assert client.get("/me/activity", headers=auth).json()["told"]["organise"] == 4

    # Sending again replaces the row: a field left out is cleared.
    again = client.post("/me/told", headers=auth, json={"sign": "leo"}).json()
    assert again["told"]["ei"] is None and again["told"]["sign"] == "leo"

    assert client.post("/me/told", headers=auth, json={"sign": "ophiuchus"}).status_code == 422
    assert client.post("/me/told", headers=auth, json={"birthday": "1990-01-01"}).status_code == 422
    assert client.post("/me/told", json={"sign": "leo"}).status_code == 401

    cleared = client.delete("/me/told", headers=auth).json()
    assert cleared["told"]["sign"] is None

    client.post("/me/told", headers=auth, json={"sign": "leo"})
    client.delete("/me", headers=auth)
    with Session(db.get_engine()) as s:
        assert s.exec(select(SelfReport)).first() is None


def test_ontology_covers_every_tag_and_bins_the_gates(client, auth):
    from content import BIN_OF_KIND, CARDS, GATES, KNOWN_TRAITS
    used = {o.trait for c in CARDS.values() for o in c.options if o.trait}
    assert used <= KNOWN_TRAITS
    assert all(g.bin == BIN_OF_KIND[g.kind] for g in GATES)
    journey = client.get("/journey", headers=auth).json()
    assert [b["id"] for b in journey["bins"]] == ["preference", "games", "twin"]  # no empty bin is shown
    assert {g["bin"] for g in journey["gates"]} == {"preference", "games", "twin"}
    faculties = client.get("/me/mirror", headers=auth).json()["faculties"]
    assert {f["key"] for f in faculties} >= {"executive", "reward", "social"} and all(f["region"] for f in faculties)


def test_skill_trees_and_growth_paths(client, auth):
    trees = {t["id"]: t for t in client.get("/skills", headers=auth).json()["trees"]}
    strategy = trees["strategy"]
    assert [s["state"] for s in strategy["steps"]] == ["locked", "locked", "locked", "soon", "soon"]
    assert "Analyze" in strategy["grows"] and trees["logic"]["steps"][0]["state"] == "soon"
    assert client.get("/me/mirror", headers=auth).json()["paths"] == []  # no picks yet, no advice yet

    styles = mirror.read_styles([(cid, "a") for cid in GATE_BY_ID["thinking-1"].card_ids])
    paths = mirror.growth_paths(styles)
    assert [kind for kind, _ in paths] == ["specialise", "stretch"]
    assert paths[0][1].key == "analyse" and paths[1][1].share == 0


def test_sphere_fills_with_picks_and_marks_finished_skill_steps(client, auth):
    empty = client.get("/me/sphere", headers=auth).json()
    assert len(empty["verticals"]) == 7 and all(v["level"] == 0 and v["earned"] == 0 for v in empty["verticals"])
    assert all(v["color"].startswith("#") for v in empty["verticals"]) and empty["links"] == 0
    for g in GATES[:2]:  # a deck of picks, then the first strategy gate
        for card in client.get(f"/gates/{g.id}/cards", headers=auth).json()["cards"]:
            client.post("/responses", headers=auth, json={"card_id": card["id"], "choice": card["options"][0]["id"], "response_ms": 700})
    after = {v["key"]: v for v in client.get("/me/sphere", headers=auth).json()["verticals"]}
    assert after["habit"]["level"] > 0 and after["motor"]["level"] == 0
    assert after["executive"]["steps_done"] == 1 and 0 < after["executive"]["earned"] < 1
    assert client.get("/me/sphere").status_code == 401
