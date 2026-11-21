"""The Sym's code is the person's own inputs, in order, as four letters. It stores nothing new."""
import market
from conftest import signup


def test_the_code_starts_empty_and_grows_with_each_seat(client):
    who = signup(client, "CodeWriter")
    assert client.get("/me/code").status_code in (401, 403, 422)
    first = client.get("/me/code", headers=who).json()
    assert first["total"] == 0 and first["bases"] == [] and len(first["gaps"]) >= 5
    client.post("/creator", json={"name": "Code Studio"}, headers=who)
    client.post("/wallets/deposit", json={"seat": "creator", "credits": 1000}, headers=who)
    assert client.post("/creator/briefs", json={"kind": "survey", "topic": market.QUESTIONS[0].id, "audience": "all"}, headers=who).status_code == 200
    after = client.get("/me/code", headers=who).json()
    assert after["counts"]["C"] == 1 and after["total"] == 1 and after["bases"][-1]["letter"] == "C"
    assert set(after["counts"]) == {"T", "G", "A", "C"} and "CodeWriter" not in str(after)
    assert after["bases"][-1]["what"] == "A survey" and after["bases"][-1]["prompt"] == ""  # a creator block says what it was


def test_the_code_says_how_it_differs_from_other_syms_as_counts(client):
    import db
    import main

    code = main.sym_code(db.player_by_id(db.bot_ids()[0][1]))
    assert code.others >= market.MIN_TWINS and 0 <= code.same <= code.others
    assert len(code.near) == 2 and code.near[0] <= code.near[1]
    assert code.apart == sum(1 for b in code.bases if b.apart) or code.total > main.CODE_SHOWN
    assert "BOT Sym " not in code.line  # counts, never another Sym's name


def test_a_block_tells_its_own_story_and_the_others_only_as_counts(client):
    import db
    import main

    code = main.sym_code(db.player_by_id(db.bot_ids()[0][1]))
    taps = [b for b in code.bases if b.letter == "T" and b.prompt]
    assert taps and all(b.what for b in code.bases)
    for b in taps:
        card = next(c for c in main.CARDS.values() if c.prompt == b.prompt and b.picked in {o.label for o in c.options} | {o.id for o in c.options})
        assert b.gate == main.GATE_BY_ID[card.gate_id].title  # the gate and the card are the person's own
        assert 0 <= b.same <= b.of <= code.others  # the others are counts, and never more than were compared
        assert b.of == 0 or b.of >= market.MIN_TWINS  # no count about a crowd under the minimum
        assert b.apart == (b.of > 0 and b.same * 2 < b.of)
    dumped = code.model_dump_json()
    assert "BOT Sym " not in dumped and not any(pid in dumped for _, pid in db.bot_ids())  # never a name or an id
