"""The commons: the first screen after signing in. Counts and nameless lines only."""
from tests.conftest import signup
from tests.test_market import play_gates


def test_the_commons_counts_people_and_names_nobody(client, auth):
    assert client.get("/commons").status_code in (401, 403)  # only a signed-in player
    before = client.get("/commons", headers=auth).json()
    assert before["taps_mine"] == 0 and not before["has_agency"] and not before["has_creator"]  # a first visit
    other = signup(client, "Quiet Otter")
    play_gates(client, other, 1)
    seen = client.get("/commons", headers=auth)
    body = seen.json()
    assert "Quiet Otter" not in seen.text and body["nickname"] == "Tester"
    assert body["people"] == before["people"] + 1 and body["stand_ins"] >= 12
    assert body["taps"] > before["taps"] and body["known"] == body["taps"] + body["checks"] + body["told"] + body["lessons"]
    assert body["known_mine"] <= body["known"] and body["people_today"] >= 2
    first = body["happenings"][0]
    assert set(first) == {"who", "text", "when", "mine"} and first["when"] == "now"
    assert any(h["text"] == "A new person joined." and not h["mine"] for h in body["happenings"])
    assert any(h["mine"] for h in client.get("/commons", headers=other).json()["happenings"])


def test_the_ripple_shows_a_person_their_own_taps_reaching_their_own_agency(client, auth):
    import market
    play_gates(client, auth, 1)
    alone = client.get("/me/ripple", headers=auth).json()
    assert not alone["agency"] and not alone["creator"]
    assert alone["links"][0]["src"] == "player" and alone["links"][0]["dst"] == "everyone" and alone["links"][0]["n"] > 0
    client.post("/me/consent", headers=auth, json={"data_income": True})
    others = [signup(client, f"Ripple{i}") for i in range(market.MIN_TWINS)]
    for o in others:
        play_gates(client, o, 1)
        client.post("/me/consent", headers=o, json={"data_income": True})
    client.post("/agency", headers=auth, json={"name": "Ripple Works"})
    asked = client.post("/agency/campaigns", headers=auth, json={"question_id": "q-price", "audience": "all", "pay": 2, "depth": "members"})
    assert asked.status_code == 200
    seen = client.get("/me/ripple", headers=auth)
    body = seen.json()
    assert body["agency"] and "Ripple0" not in seen.text
    own = next(link for link in body["links"] if link["src"] == "agency" and link["dst"] == "player")
    assert own["n"] == 1 and own["credits"] > 0
    out = next(link for link in body["links"] if link["src"] == "agency" and link["dst"] == "everyone")
    assert "paid" in out["text"] and out["credits"] >= market.MIN_TWINS * 4
    got = next(link for link in client.get("/me/ripple", headers=others[0]).json()["links"] if link["src"] == "everyone" and link["dst"] == "player")
    assert got["n"] == 1
    for o in others + [auth]:
        client.post("/me/consent", headers=o, json={"data_income": False})
