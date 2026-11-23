from content import CARDS, GATES, Board, board_moves


def test_every_strategy_card_has_a_winning_move():
    boards = [c for c in CARDS.values() if c.board]
    assert boards
    for c in boards:
        assert c.winning, c.id
        assert c.winning <= {o.id for o in c.options}


def test_board_rules():
    _, win = board_moves(Board("tictactoe", ("XX.", ".O.", "O.."), "X"))
    assert win == {"0,2"}
    _, win = board_moves(Board("connect4", (".......", ".......", ".......", "..RY...", ".RYR...", "RYYY..."), "R"))
    assert win == {"3"}


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


def test_signup_validation(client):
    ok = {"nickname": "Sam", "consent": True, "adult": True}
    assert client.post("/players", json={**ok, "consent": False}).status_code == 422
    assert client.post("/players", json={**ok, "adult": False}).status_code == 422
    assert client.post("/players", json={**ok, "nickname": "x"}).status_code == 422
    assert client.post("/players", json={**ok, "nickname": "<b>hi</b>"}).status_code == 422
    assert client.post("/players", json={**ok, "email": "a@b.c"}).status_code == 422


def test_needs_a_token(client):
    assert client.get("/journey").status_code == 401
    assert client.get("/journey", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_journey_unlocks_in_order(client, auth):
    gates = client.get("/journey", headers=auth).json()["gates"]
    assert [g["unlocked"] for g in gates][:2] == [True, False]
    assert client.get(f"/gates/{gates[1]['id']}/cards", headers=auth).status_code == 403

    cards = client.get(f"/gates/{gates[0]['id']}/cards", headers=auth).json()["cards"]
    last = None
    for c in cards:
        last = client.post("/responses", headers=auth, json={"card_id": c["id"], "choice": c["options"][0]["id"], "response_ms": 900})
        assert last.status_code == 200
        assert last.json()["is_correct"] is None
    assert last.json()["gate_complete"] is True
    assert last.json()["points"] == 10 * len(cards)
    assert last.json()["level"] == 2
    assert client.get(f"/gates/{gates[1]['id']}/cards", headers=auth).status_code == 200


def test_no_double_answers_and_only_real_options(client, auth):
    first = GATES[0].card_ids[0]
    body = {"card_id": first, "choice": "a", "response_ms": 500}
    assert client.post("/responses", headers=auth, json={**body, "choice": "zzz"}).status_code == 422
    assert client.post("/responses", headers=auth, json=body).status_code == 200
    assert client.post("/responses", headers=auth, json=body).status_code == 409


def test_strategy_is_scored_and_the_answer_never_leaves(client, auth):
    for cid in GATES[0].card_ids:
        client.post("/responses", headers=auth, json={"card_id": cid, "choice": "a", "response_ms": 400})
    raw = client.get(f"/gates/{GATES[1].id}/cards", headers=auth)
    assert "winning" not in raw.text and "correct" not in raw.text
    cards = raw.json()["cards"]
    assert cards[0]["board"]["game"] == "tictactoe"

    right = sorted(CARDS[cards[0]["id"]].winning)[0]
    r = client.post("/responses", headers=auth, json={"card_id": cards[0]["id"], "choice": right, "response_ms": 1500}).json()
    assert r["is_correct"] is True and r["points_earned"] == 25

    wrong = next(o["id"] for o in cards[1]["options"] if o["id"] not in CARDS[cards[1]["id"]].winning)
    r = client.post("/responses", headers=auth, json={"card_id": cards[1]["id"], "choice": wrong, "response_ms": 1500}).json()
    assert r["is_correct"] is False and r["points_earned"] == 5


def test_activity_and_delete(client, auth):
    first = GATES[0].card_ids[0]
    client.post("/responses", headers=auth, json={"card_id": first, "choice": "a", "response_ms": 700})
    act = client.get("/me/activity", headers=auth).json()
    assert act["nickname"] == "Tester"
    assert len(act["responses"]) == 1
    assert act["responses"][0]["created_at"].endswith("Z")
    assert act["responses"][0]["choice"] == CARDS[first].options[0].label

    assert client.delete("/me", headers=auth).json() == {"deleted": True}
    assert client.get("/me", headers=auth).status_code == 401


def test_players_only_see_their_own(client, auth):
    other = client.post("/players", json={"nickname": "Other", "consent": True, "adult": True}).json()["token"]
    client.post("/responses", headers=auth, json={"card_id": GATES[0].card_ids[0], "choice": "a", "response_ms": 700})
    act = client.get("/me/activity", headers={"Authorization": f"Bearer {other}"}).json()
    assert act["responses"] == []


def test_a_midway_sym_starts_at_the_first_battle_with_real_rules(client):
    made = client.post("/players/midway", json={"nickname": "Midway", "consent": True, "adult": True})
    assert made.status_code == 201
    auth = {"Authorization": f"Bearer {made.json()['token']}"}
    gates = client.get("/journey", headers=auth).json()["gates"]
    done = [g for g in gates if g["done"] == g["total"]]
    assert len(done) == 5 and all(g["kind"] != "battle" for g in done)  # five gates by sample taps, no battle among them
    nxt = next(g for g in gates if g["done"] < g["total"])
    assert nxt["kind"] == "battle" and nxt["unlocked"] and nxt["done"] == 0  # the first Sym battle is the next thing to play
    assert client.get("/jobs", headers=auth).json()["data_income"] is True  # earning is on
    assert client.get("/me", headers=auth).json()["certs"] >= 1  # the boards were scored by code, like anyone's
    # the account is the visitor's own: it can be deleted like any other
    assert client.delete("/me", headers=auth).status_code in (200, 204)
