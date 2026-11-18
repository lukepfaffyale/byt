"""Real people are asked only in a crowd of real people, and the analyst export holds no names."""
import market
from conftest import signup


def twin(sample: bool) -> market.TwinFacts:
    return market.TwinFacts(player_id="x", sample=sample, picks=99, certified=False, leading_style=None, trait_counts={})


def test_a_lone_real_sym_is_left_out_of_a_group():
    stand_ins = [twin(True) for _ in range(6)]
    few = stand_ins + [twin(False) for _ in range(market.MIN_TWINS - 1)]
    assert all(t.sample for t in market.safe_group(few)) and len(market.safe_group(few)) == 6
    enough = stand_ins + [twin(False) for _ in range(market.MIN_TWINS)]
    assert market.safe_group(enough) == enough
    assert market.safe_group(stand_ins) == stand_ins


def test_battles_export_has_no_names(client):
    who = signup(client, "ExportCheck")
    assert client.get("/export/battles.csv").status_code in (401, 403, 422)
    r = client.get("/export/battles.csv", headers=who)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0] == "battle_id,deck,n,sym_matches,baseline_matches,date"
    assert "ExportCheck" not in r.text and all(len(row.split(",")) == 6 for row in lines)


def test_bot_syms_are_one_per_country_labelled_and_alive(client):
    import random

    import db
    import life

    who = signup(client, "BotWatcher")
    bots = db.bot_ids()
    assert len(bots) == len(db.COUNTRIES) == 193 and len(set(db.COUNTRIES)) == 193
    assert all(db.player_by_id(pid).nickname.startswith("BOT Sym ") for _, pid in bots[:5])
    before = client.get("/commons", headers=who).json()
    assert before["bots"] == 193 and before["bot_agencies"] == life.BOT_AGENCIES and before["bot_creators"] == life.BOT_CREATORS
    rng = random.Random(7)
    done = [life.step(rng) for _ in range(30)]
    assert {"play", "ask", "survey"} <= set(done)
    after = client.get("/commons", headers=who).json()
    said = " ".join(h["text"] for h in after["happenings"])
    assert "BOT" in said and after["people"] == before["people"]  # a bot is never counted as a person
