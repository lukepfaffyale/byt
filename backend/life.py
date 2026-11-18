"""The life of the BOT Syms. Plain code, no model, no tokens.

The game ships with one BOT Sym for each United Nations country. They exist to show a working economy while few
people play: some BOT Syms keep playing cards, a few run BOT agencies that ask questions and pay for the answers,
and a few run BOT creator seats that ask groups what they need. Every move goes through the same routes and the
same rules as a person's move, so the books stay honest: a BOT agency pays real players exactly what a person's
agency would. The credits a BOT seat spends are play credits from outside the game, like any deposit.

Nothing here is random in a hidden way that matters: which bot acts next is chance, what it answers is its own
fixed leaning. A bot never types, never reads a person's answers, and sees only what its seat would see.
"""
from __future__ import annotations

import random

from fastapi import HTTPException

import db
import market
from models import BriefIn, CampaignIn

BOT_AGENCIES = 6  # how many BOT Syms also run an agency
BOT_CREATORS = 4  # how many also run a creator seat
LOW = 1500  # a BOT seat with fewer credits than this adds play credits before it asks
_rng = random.Random()


def seats() -> tuple[list[str], list[str]]:
    """Open the BOT seats if they are missing. Returns the player ids of the bot agencies and the bot creators.
    The seats are spread across the list of countries, not bunched at its start."""
    ids = [pid for _, pid in db.bot_ids()]
    step = max(1, len(ids) // (BOT_AGENCIES + BOT_CREATORS))
    chosen = ids[step - 1::step][: BOT_AGENCIES + BOT_CREATORS]
    agencies, creators = chosen[:BOT_AGENCIES], chosen[BOT_AGENCIES:]
    for n, pid in enumerate(agencies, 1):
        if db.org_for(pid, "agency") is None:
            db.create_org(pid, "agency", f"BOT agency {n:02d}", market.START_BUDGET)
    for n, pid in enumerate(creators, 1):
        if db.org_for(pid, "creator") is None:
            db.create_org(pid, "creator", f"BOT creator {n:02d}", market.START_BUDGET)
    return agencies, creators


def step(rng: random.Random | None = None) -> str:
    """One thing happens. Returns a word for what it was (for the log and the tests)."""
    import main  # the routes hold the rules; a bot goes through them like anyone else

    rng = rng or _rng
    agencies, creators = seats()
    roll = rng.random()
    try:
        if roll < 0.5 or not agencies:
            return "play" if db.bot_play(rng) else "rest"
        if roll < 0.85 or not creators:
            pid = rng.choice(agencies)
            if db.wallet_balance(pid, "agency") < LOW:
                db.deposit(pid, "agency", max(market.DEPOSIT_CHOICES))
            body = CampaignIn(question_id=rng.choice(market.QUESTIONS).id,
                              audience=rng.choice(["all", "all", "all"] + [a for a, _ in market.AUDIENCES]),
                              pay=rng.choice(market.PAY_CHOICES))
            main.run_campaign(body, None, db.player_by_id(pid))
            return "ask"
        pid = rng.choice(creators)
        if db.wallet_balance(pid, "creator") < LOW:
            db.deposit(pid, "creator", max(market.DEPOSIT_CHOICES))
        main.run_brief(BriefIn(kind="survey", topic=rng.choice(market.QUESTIONS).id, audience="all"), None, db.player_by_id(pid))
        return "survey"
    except HTTPException:
        return "rest"  # the group was too small, or the seat was short: nothing happened and nothing was charged
