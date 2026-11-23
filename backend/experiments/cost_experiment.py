"""The cost experiment in the report: four ways to guess a person's hidden picks, and what each costs.

Run from the `backend` folder, on the local database, with a model key in `.env`:

    venv/Scripts/python experiments/cost_experiment.py        (Windows)
    venv/bin/python experiments/cost_experiment.py            (macOS or Linux)

For each of the first six local test accounts with at least 30 usable picks, 10 picks are held back (the hidden
picks). Nothing built from those 10 is shown to any method. Then, on the same 10 cards:

  crowd     the most common pick among the other Syms (nearly all of them BOT Syms with random tastes)
  practice  the practice Sym: plain code that counts the traits a person chose. It sees each card's trait tags.
  beliefs   the AI Twin reading short beliefs that the Profiler writes fresh from the other picks (the game's design)
  raw       the AI Twin reading every other raw pick, with no Profiler

The AI methods run through the game's own harness, so limits, the audit trail and the usage table all apply.
The result is written to `output/cost_experiment.json`. It holds no name and no player id: accounts are numbered,
and each is marked as scripted (a small program that always picks by a fixed list of traits) or played by hand.
The test accounts are not real players, and this file says so in its first line.
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import random
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

BACKEND = Path(__file__).resolve().parent.parent
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))
os.environ["BYT_LIFE"] = "off"  # the BOT Syms stay still while this runs

import main  # noqa: E402,F401  (loads .env the way the server does)
import agent  # noqa: E402
import db  # noqa: E402
import tools  # noqa: E402
from content import CARDS  # noqa: E402
from models import Player, ProfileOut, TwinOut  # noqa: E402
from sqlmodel import Session, select  # noqa: E402
from verifier import popular_choice, rule_of_thumb  # noqa: E402

HIDDEN = 10  # picks held back from each account
ACCOUNTS = 6
SCRIPTED = "Fair Test"  # the nickname the scripted test players were made with
OUT = BACKEND.parent / "output" / "cost_experiment.json"
rng = random.Random(409)
real_visible, real_tend, real_traits, real_facts = tools._visible_picks, db.tendencies_for, db.trait_counts, db.facts_for


def wilson(right: int, n: int) -> list[float]:
    """The 95 percent range for a share, as two percents."""
    if n == 0:
        return [0.0, 0.0]
    z = 1.96
    p = right / n
    mid = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [round(100 * (mid - half), 1), round(100 * (mid + half), 1)]


async def one(player: Player) -> dict | None:
    pid = player.id
    rows = [r for r in db.responses_for(pid) if (c := CARDS.get(r.card_id)) is not None and c.kind in ("preference", "battle")
            and not r.held_out and any(o.id == r.choice for o in c.options)]
    if len(rows) < 30:
        return None
    test = rng.sample(rows, HIDDEN)
    test_ids = [r.card_id for r in test]
    truth = {r.card_id: r.choice for r in test}
    hidden = {CARDS[cid].prompt for cid in test_ids}
    train = [r for r in rows if r.card_id not in truth]
    counts = Counter(o.trait for r in train for o in CARDS[r.card_id].options if o.id == r.choice and o.trait)

    tools._visible_picks = lambda player_id: [p for p in real_visible(player_id) if p["card"] not in hidden and p["topic"] != "work"]
    db.trait_counts = lambda player_id, include_held_out=False: dict(counts)
    db.facts_for = lambda player_id: []
    out: dict = {"kind": "scripted" if player.nickname == SCRIPTED else "played by hand", "picks_to_learn_from": len(train), "hidden_picks": HIDDEN,
                 "chance": round(sum(1 / len(CARDS[cid].options) for cid in test_ids), 2)}
    try:
        # the Profiler writes beliefs from the other picks; they stay in memory and replace nothing in the database
        prof = await agent.run_harnessed("profiler", "Profile this player from their picks.", tools.TwinDeps(player_id=pid))
        beliefs = []
        if isinstance(prof.output, ProfileOut):
            beliefs = [SimpleNamespace(topic=t.topic, scope=t.scope, statement=t.statement[:200], evidence_count=t.evidence_count) for t in prof.output.tendencies[:10]]
        out["profiler"] = {"stop": prof.stopped_reason, "input_tokens": prof.input_tokens, "output_tokens": prof.output_tokens, "usd": round(prof.cost_usd, 6), "beliefs": len(beliefs)}

        raw = [SimpleNamespace(topic=CARDS[r.card_id].deck, scope="topic", evidence_count=1,
                               statement=f"Card: {CARDS[r.card_id].prompt} Picked: {next(o.label for o in CARDS[r.card_id].options if o.id == r.choice)}"[:200]) for r in train]

        async def twin(known) -> dict:
            db.tendencies_for = lambda player_id: known
            res = await agent.run_harnessed("twin", f"Predict your human's pick on each of the {HIDDEN} cards.", tools.TwinDeps(player_id=pid, battle_card_ids=test_ids))
            guess: dict[str, str] = {}
            if isinstance(res.output, TwinOut):
                for pr in res.output.predictions:
                    if pr.card_id in truth and pr.card_id not in guess:
                        guess[pr.card_id] = pr.choice
            # a card with no guess counts as wrong
            return {"stop": res.stopped_reason, "input_tokens": res.input_tokens, "output_tokens": res.output_tokens, "usd": round(res.cost_usd, 6),
                    "ms": res.ms, "answered": len(guess), "right": sum(1 for cid, ch in guess.items() if truth[cid] == ch)}

        out["beliefs"] = await twin(beliefs) if beliefs else {"stop": "no_beliefs", "answered": 0, "right": 0, "input_tokens": 0, "output_tokens": 0, "usd": 0}
        out["raw"] = await twin(raw)
        base = {cid: popular_choice(CARDS[cid], db.picks_by_others(cid, pid)) for cid in test_ids}
        out["practice"] = {"right": sum(1 for cid in test_ids if rule_of_thumb(CARDS[cid], dict(counts), base[cid]) == truth[cid])}
        out["crowd"] = {"right": sum(1 for cid in test_ids if base[cid] == truth[cid])}
    finally:
        tools._visible_picks, db.tendencies_for, db.trait_counts, db.facts_for = real_visible, real_tend, real_traits, real_facts
    return out


async def go() -> None:
    with Session(db.get_engine()) as s:
        people = list(s.exec(select(Player).where(~Player.nickname.startswith("BOT Sym "))).all())
    accounts = []
    for player in people:
        if len(accounts) >= ACCOUNTS:
            break
        r = await one(player)
        if r:
            accounts.append({"account": len(accounts) + 1, **r})
            print(f"account {len(accounts)} done ({r['kind']})")
    n = len(accounts) * HIDDEN

    def total(group, arm, key):
        return sum((a.get(arm) or {}).get(key, 0) or 0 for a in group)

    def table(group):
        m = len(group) * HIDDEN
        rows = {arm: {"right": total(group, arm, "right"), "of": m, "range_95": wilson(total(group, arm, "right"), m)} for arm in ("crowd", "practice", "beliefs", "raw")}
        rows["chance"] = {"right": round(sum(a["chance"] for a in group), 1), "of": m}
        return rows

    result = {
        "what_this_is": "Test accounts, not real players. Scripted accounts pick by a fixed list of traits and are easy to predict.",
        "run_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "model": agent.get_model_name(),
        "seed": 409,
        "hidden_picks": n,
        "all_accounts": table(accounts),
        "scripted_accounts": table([a for a in accounts if a["kind"] == "scripted"]),
        "hand_played_accounts": table([a for a in accounts if a["kind"] != "scripted"]),
        "cost_usd": {"twin_on_beliefs": round(total(accounts, "beliefs", "usd"), 6), "profiler_for_beliefs": round(total(accounts, "profiler", "usd"), 6),
                     "twin_on_raw_picks": round(total(accounts, "raw", "usd"), 6)},
        "tokens": {"twin_on_beliefs": [total(accounts, "beliefs", "input_tokens"), total(accounts, "beliefs", "output_tokens")],
                   "profiler_for_beliefs": [total(accounts, "profiler", "input_tokens"), total(accounts, "profiler", "output_tokens")],
                   "twin_on_raw_picks": [total(accounts, "raw", "input_tokens"), total(accounts, "raw", "output_tokens")]},
        "notes": ["The practice Sym sees each card's trait tags. The AI Twin sees only the card's words.",
                  "Each AI method ran once for each account. A card with no guess counts as wrong.",
                  "The crowd is the most common pick among the other Syms, nearly all of them BOT Syms with random tastes."],
        "accounts": accounts,
    }
    OUT.write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    print("written:", OUT.name)
    print(json.dumps({k: result[k] for k in ("hidden_picks", "all_accounts", "scripted_accounts", "hand_played_accounts", "cost_usd")}))


if __name__ == "__main__":
    asyncio.run(go())
