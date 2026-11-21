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


def test_the_code_says_how_it_differs_from_other_syms_as_counts(client):
    import db
    import main

    code = main.sym_code(db.player_by_id(db.bot_ids()[0][1]))
    assert code.others >= market.MIN_TWINS and 0 <= code.same <= code.others
    assert len(code.near) == 2 and code.near[0] <= code.near[1]
    assert code.apart == sum(1 for b in code.bases if b.apart) or code.total > main.CODE_SHOWN
    assert "BOT Sym " not in code.line  # counts, never another Sym's name
