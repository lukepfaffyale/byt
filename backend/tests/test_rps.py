"""Rock, paper, scissors against the Sym, the league of Syms, and the dot pattern gates. All plain code."""
import rps


def test_hide_the_light_guess_is_plain_and_checkable():
    assert rps.find_guess([]) == ("b", "I have not seen you hide it yet, so I guessed.")
    guess, why = rps.find_guess(["a", "a", "a"])  # after left then left came left: the Sym looks left
    assert guess == "a" and "left cup" in why
    assert rps.found("a", "a") == "twin" and rps.found("a", "c") == "you"
    assert rps.tells(["a", "c", "a", "c", "a", "c", "a"], rps.CUPS)[0][:2] in (("a", "c"), ("c", "a"))
from content import CARDS, GATE_BY_ID, GATES, pattern_cells

from tests.conftest import signup


def test_the_twin_reads_habits_and_counters_them():
    assert rps.twin_throw([]) == ("p", "I have not seen you throw yet, so I guessed.")
    throw, why = rps.twin_throw(["r", "r", "r"])  # after rock then rock came rock: the twin plays paper
    assert throw == "p" and "rock" in why and "paper" in why
    # after paper this person always throws scissors: the twin expects scissors and plays rock
    assert rps.twin_throw(["p", "s", "r", "p", "s", "r", "p"])[0] == "r"
    assert rps.outcome("r", "s") == "you" and rps.outcome("r", "p") == "twin" and rps.outcome("s", "s") == "draw"
    assert set(rps.tells(["p", "s", "p", "s", "p", "s", "p"])) == {("s", "p", 3, 3), ("p", "s", 3, 3)}
    a, b = ["r"] * 12, ["p"] * 12  # a twin that only throws rock loses every round to one that only throws paper
    assert rps.match(a, b, "seed") == (0, rps.MATCH_ROUNDS, 0) and rps.match(a, b, "seed") == rps.match(a, b, "seed")


def test_rounds_are_stored_and_the_twin_starts_to_win(client, auth):
    assert client.get("/rps", headers=auth).json()["rounds"] == 0
    assert client.post("/rps", headers=auth, json={"throw": "x"}).status_code == 422
    first = client.post("/rps", headers=auth, json={"throw": "r"}).json()
    assert first["round"] == {"mine": "r", "twin": "p", "outcome": "twin", "why": "I have not seen you throw yet, so I guessed."}
    for _ in range(11):
        out = client.post("/rps", headers=auth, json={"throw": "r"}).json()
    assert out["round"]["twin"] == "p" and out["round"]["outcome"] == "twin" and "rock" in out["round"]["why"]
    assert out["rounds"] == 12 and out["twin"] == 12 and out["you"] == 0 and len(out["last"]) == 12
    assert out["tells"] == [{"after": "r", "then": "r", "n": 11, "of": 11}]

    # with 10 throws the twin is in the league. Other twins have a number, never a name.
    assert out["need"] == 0 and out["rivals"] and out["of"] == len(out["rivals"]) + 1 and 1 <= out["rank"] <= out["of"]
    assert all(r["name"].startswith("Sym ") and r["won"] + r["lost"] + r["drawn"] == rps.MATCH_ROUNDS for r in out["rivals"])
    other = signup(client, "Few Throws")
    assert client.get("/rps", headers=other).json()["need"] == rps.ARENA_MIN and client.get("/rps", headers=other).json()["rivals"] == []


def test_dot_patterns_are_worked_out_by_code_and_the_answer_stays_on_the_server(client, auth):
    assert pattern_cells({"kind": "step", "order": "ring", "start": 0, "step": 1}, 2, 2, 5) == ["0,0", "0,1", "1,1", "1,0", "0,0"]
    gate = GATE_BY_ID["pattern-four"]
    assert gate.kind == "pattern" and all(CARDS[c].board.answer in CARDS[c].winning for c in gate.card_ids)
    from tests.test_twin import play_until
    play_until(client, auth, "pattern-four")
    cards = client.get("/gates/pattern-four/cards", headers=auth).json()["cards"]
    assert cards[0]["board"]["game"] == "pattern" and cards[0]["board"]["seq"] == list(CARDS[cards[0]["id"]].board.seq)
    assert "answer" not in cards[0]["board"]
    wrong = next(o["id"] for o in cards[0]["options"] if o["id"] not in CARDS[cards[0]["id"]].winning)
    assert all(50 <= c["bet_sure"] <= 100 for c in cards)  # the twin has bet on every puzzle; the bet itself stays sealed
    miss = client.post("/responses", headers=auth, json={"card_id": cards[0]["id"], "choice": wrong, "response_ms": 900, "sure": 3}).json()
    assert miss["is_correct"] is False and miss["others_total"] >= 0 and miss["others_right"] <= miss["others_total"]
    assert isinstance(miss["twin_bet"], bool) and miss["twin_bet_sure"] == cards[0]["bet_sure"]
    assert miss["sure_record"][0] == {"level": 3, "right": 0, "total": 1}  # sure, and wrong
    assert client.post("/responses", headers=auth, json={"card_id": cards[1]["id"], "choice": wrong, "response_ms": 900, "sure": 9}).status_code == 422
    for c in cards[1:]:
        last = client.post("/responses", headers=auth, json={"card_id": c["id"], "choice": CARDS[c["id"]].board.answer, "response_ms": 900, "sure": 2}).json()
        assert last["is_correct"] is True and last["twin_bet_sure"] == c["bet_sure"]  # the bet did not move during the gate
    assert last["sure_record"][1] == {"level": 2, "right": 3, "total": 3}
    # 3 of 4 on four squares could be luck 5 times in 100, so it earns no certificate and the screen is told why
    assert last["cert"] is None and last["cert_need"] == 4 and last["cert_right"] == 3 and last["bonus"] == 0


def test_judgment_counts_sure_against_right_on_any_card_with_a_right_answer(client, auth):
    from tests.test_twin import play_until
    assert client.get("/me/judgment", headers=auth).json()["taps"] == []
    play_until(client, auth, "strategy-easy")
    cards = client.get("/gates/strategy-easy/cards", headers=auth).json()["cards"]
    for c in cards:  # three strategy cards, all right, all tapped Sure
        out = client.post("/responses", headers=auth, json={"card_id": c["id"], "choice": sorted(CARDS[c["id"]].winning)[0], "response_ms": 800, "sure": 3}).json()
    assert out["sure_record"][0] == {"level": 3, "right": 3, "total": 3}
    judged = client.get("/me/judgment", headers=auth).json()
    assert judged["rows"][0] == {"level": 3, "right": 3, "total": 3} and len(judged["taps"]) == 3
    assert "I need 5" in judged["says"]  # 3 Sure answers are too few to say anything about that feeling
    # play on to the next strategy gate, tapping Sure on every card with a right answer, all right
    ids = [g.id for g in GATES]
    for g in GATES[ids.index("strategy-easy") + 1:ids.index("strategy-medium") + 1]:
        if g.kind == "battle":
            assert client.post("/battles", headers=auth, json={"gate_id": g.id}).status_code == 200
        for c in client.get(f"/gates/{g.id}/cards", headers=auth).json()["cards"]:
            board = CARDS[c["id"]].board
            body = {"card_id": c["id"], "choice": sorted(CARDS[c["id"]].winning)[0] if board else c["options"][0]["id"], "response_ms": 800}
            assert client.post("/responses", headers=auth, json=body | ({"sure": 3} if board else {})).status_code == 200
    judged = client.get("/me/judgment", headers=auth).json()
    sure = judged["rows"][0]
    assert sure["total"] >= 5 and sure["right"] == sure["total"]
    assert f"In these puzzles, Sure was right {sure['total']} of {sure['total']}. You can trust it here." in judged["says"]


def test_the_sure_record_counts_wrong_answers_and_says_which_gates_it_covers(client, auth):
    """A tester tapped Sure, Think so (wrong) and A guess in one gate and was shown totals from every gate, with the
    wrong answers missing. The gate's own record and the record over all gates are two lists, and both count misses."""
    from tests.test_twin import play_until
    play_until(client, auth, "strategy-easy")
    for c in client.get("/gates/strategy-easy/cards", headers=auth).json()["cards"]:  # an earlier gate: Sure and right, 3 times
        client.post("/responses", headers=auth, json={"card_id": c["id"], "choice": sorted(CARDS[c["id"]].winning)[0], "response_ms": 800, "sure": 3})
    play_until(client, auth, "pattern-four")
    cards = client.get("/gates/pattern-four/cards", headers=auth).json()["cards"]
    right = lambda c: CARDS[c["id"]].board.answer  # noqa: E731
    wrong = lambda c: next(o["id"] for o in c["options"] if o["id"] not in CARDS[c["id"]].winning)  # noqa: E731
    plays = [(right, 3), (wrong, 2), (wrong, 2), (right, 1)]  # sure and right, think so and wrong twice, a guess and right
    for c, (pick, level) in zip(cards, plays):
        out = client.post("/responses", headers=auth, json={"card_id": c["id"], "choice": pick(c), "response_ms": 900, "sure": level}).json()
        assert out["right_choice"] == right(c)  # shown only now, after the pick is stored
    assert out["sure_gate"] == [{"level": 3, "right": 1, "total": 1}, {"level": 2, "right": 0, "total": 2}, {"level": 1, "right": 1, "total": 1}]
    assert out["sure_record"] == [{"level": 3, "right": 4, "total": 4}, {"level": 2, "right": 0, "total": 2}, {"level": 1, "right": 1, "total": 1}]
    judged = client.get("/me/judgment", headers=auth).json()
    assert judged["rows"] == out["sure_record"] and len(judged["taps"]) == 7 and judged["unsaid"] == 0
    # 4 Sure answers are under the minimum of 5, so the line waits instead of judging the feeling
    assert "I need 5" in judged["says"] and "are counted" not in judged["says"]
    # an answer given with no "how sure" tap is in no row, and the line says so instead of looking like a full count
    c = client.get("/gates/strategy-medium/cards", headers=auth).json()["cards"][0]
    bare = client.post("/responses", headers=auth, json={"card_id": c["id"], "choice": sorted(CARDS[c["id"]].winning)[0], "response_ms": 800}).json()
    assert bare["sure_record"] == [] and bare["sure_gate"] == []
    judged = client.get("/me/judgment", headers=auth).json()
    assert judged["unsaid"] == 1 and len(judged["taps"]) == 7 and "are counted: 7 of 8." in judged["says"]


def test_a_certificate_is_earned_by_play_and_never_bought(client, auth):
    import verifier
    from tests.test_twin import play_until
    # the pass mark: two of three at least, and a score that guessing reaches at most 2 times in 100
    assert verifier.cert_need([5, 5, 5]) == 3 and verifier.cert_need([4, 4, 4, 4]) == 4 and verifier.cert_need([12] * 6) == 4
    assert verifier.cert_need([3, 3]) is None  # two cards with three options: even a full score could be luck
    assert all(verifier.luck(counts, verifier.cert_need(counts)) <= verifier.MAX_LUCK for counts in ([5] * 3, [4] * 4, [3] * 4, [12] * 6))

    # every way to move credits, tried by one player: none of them issues a certificate
    play_until(client, auth, "strategy-easy")
    certs = lambda: client.get("/me", headers=auth).json()["certs"]  # noqa: E731
    assert certs() == 0
    client.post("/wallets/deposit", headers=auth, json={"seat": "player", "credits": 1000})
    client.post("/agency", headers=auth, json={"name": "Deep Pockets"})
    client.post("/wallets/deposit", headers=auth, json={"seat": "agency", "credits": 1000})
    assert client.post("/agency/sponsor", headers=auth, json={"skill": "logic", "budget": 200}).status_code == 200
    posted = client.post("/agency/jobs", headers=auth, json={"question_id": "q-price", "pay": 40, "seats": 5})
    assert posted.status_code == 200
    client.post(f"/agency/jobs/{posted.json()['postings'][0]['id']}/close", headers=auth)  # leave no open job for other tests
    client.post("/creator", headers=auth, json={"name": "Deep Studio"})
    client.post("/me/consent", headers=auth, json={"data_income": True})
    assert certs() == 0



def test_reaction_drills_load_as_a_pack_and_a_missed_gate_can_be_tried_again_after_the_wait(client, auth, monkeypatch):
    import main
    from tests.test_twin import play_until
    pack = GATE_BY_ID["made-reflex-2"]
    assert pack.kind == "reflex" and len(pack.card_ids) == 6
    card = CARDS[pack.card_ids[0]]
    assert card.board.game == "reflex" and card.winning == frozenset({"hit"}) and {o.id for o in card.options} == {"hit", "slow", "early", "wrong"}

    play_until(client, auth, "strategy-easy")
    cards = client.get("/gates/strategy-easy/cards", headers=auth).json()["cards"]
    for c in cards:  # every move wrong: no certificate
        wrong = next(o["id"] for o in c["options"] if o["id"] not in CARDS[c["id"]].winning)
        last = client.post("/responses", headers=auth, json={"card_id": c["id"], "choice": wrong, "response_ms": 800}).json()
    assert last["cert"] is None and last["cert_need"] == 3
    assert client.post("/gates/strategy-easy/retry", headers=auth).status_code == 409  # the wait is not over
    monkeypatch.setattr(main, "RETRY_HOURS", 0)
    assert client.get("/me/plan", headers=auth).json()["options"][0]["id"] == "retry:strategy-easy"
    assert client.post("/gates/strategy-easy/retry", headers=auth).json() == {"gate_id": "strategy-easy", "cards": 3}
    again = client.get("/gates/strategy-easy/cards", headers=auth).json()["cards"]
    for c in again:
        last = client.post("/responses", headers=auth, json={"card_id": c["id"], "choice": sorted(CARDS[c["id"]].winning)[0], "response_ms": 800}).json()
    assert last["cert"]["kind"] == "skill"
    assert client.post("/gates/strategy-easy/retry", headers=auth).status_code == 409  # an earned certificate is never retried


def test_hide_the_light_rounds_are_stored_apart_from_rock_paper_scissors(client, auth):
    assert client.get("/duel/hide", headers=auth).json()["rounds"] == 0
    assert client.post("/duel/hide", headers=auth, json={"pick": "x"}).status_code == 422
    assert client.get("/duel/chess", headers=auth).status_code == 404
    for _ in range(4):
        out = client.post("/duel/hide", headers=auth, json={"pick": "a"}).json()
    # the person always hides it on the left: by now the Sym looks there and finds it
    assert out["rounds"] == 4 and out["round"]["twin"] == "a" and out["round"]["outcome"] == "twin" and out["draws"] == 0
    assert client.get("/rps", headers=auth).json()["rounds"] == 0  # the first duel does not see these rows


def test_think_alike_and_keeper_each_keep_their_own_rounds(client, auth):
    # think alike: the person always picks the sun, so the Sym learns to pick it too, and they match
    for _ in range(4):
        out = client.post("/duel/sync", headers=auth, json={"pick": "d"}).json()
    assert out["round"]["twin"] == "d" and out["round"]["outcome"] == "you" and out["rounds"] == 4
    # keeper: the person always dives left, so the Sym shoots somewhere else and scores
    for _ in range(4):
        shot = client.post("/duel/keeper", headers=auth, json={"pick": "g"}).json()
    assert shot["round"]["twin"] != "g" and shot["round"]["outcome"] == "twin" and "least" in shot["round"]["why"]
    assert rps.duel_outcome("keeper", "g", "g") == "you" and rps.duel_outcome("sync", "d", "e") == "draw"
    # a letter of one duel is refused in another, and no duel sees another's rows
    assert client.post("/duel/keeper", headers=auth, json={"pick": "a"}).status_code == 422
    assert client.get("/duel/hide", headers=auth).json()["rounds"] == 0


def test_being_in_step_with_your_sym_is_paid_once_a_day_from_the_growth_fund(client, auth):
    before = client.get("/me", headers=auth).json()["credits"]
    one = client.post("/duel/sync", headers=auth, json={"pick": "d"}).json()  # the Sym has nothing to go on: a miss
    two = client.post("/duel/sync", headers=auth, json={"pick": "d"}).json()  # now it picks the sun too
    three = client.post("/duel/sync", headers=auth, json={"pick": "d"}).json()  # 2 of the day's first 3 matched
    assert (one["bonus"], two["bonus"], three["bonus"]) == (0, 0, 2)
    assert client.post("/duel/sync", headers=auth, json={"pick": "d"}).json()["bonus"] == 0  # never twice in a day
    assert client.get("/me", headers=auth).json()["credits"] == before + 2
    # the other duels pay nothing
    assert client.post("/duel/hide", headers=auth, json={"pick": "a"}).json()["bonus"] == 0
