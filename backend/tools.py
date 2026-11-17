"""The typed tools the agents may call. Read-only, and each agent sees only its own player's data.

Facts come from these tools, never from the model: the picks, the trait counts, the tendencies and
the cards to predict are all read from the database or the content files by code.
The nickname, the token and the player id are never placed in a tool result.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from pydantic_ai import Agent, RunContext

import db
from content import CARDS, TOPICS, Card
from work import JOB_BY_ID

MAX_PICKS = 80


@dataclass
class TwinDeps:
    """State injected into a run. The player id stays here, on the server side of the tool."""
    player_id: str
    battle_card_ids: list[str] = field(default_factory=list)
    job_id: str | None = None
    misses: list[dict[str, Any]] | None = None  # for the Profiler after a battle: the guesses the twin got wrong
    situation: dict[str, Any] | None = None  # for the Guide: built by code in main, with what the human said last
    calls: dict[str, int] = field(default_factory=dict)


def _visible_picks(player_id: str) -> list[dict[str, Any]]:
    """The player's preference and tone picks, minus anything held out for a battle."""
    out: list[dict[str, Any]] = []
    for r in db.responses_for(player_id):
        card = CARDS.get(r.card_id)
        if card is None or r.held_out or card.kind not in ("preference", "feedback", "battle"):
            continue
        option = next((o for o in card.options if o.id == r.choice), None)
        if option is None:
            continue
        rejected = [o.label for o in card.options if o.id != r.choice]
        out.append({"topic": card.deck, "card": card.prompt, "picked": option.label, "over": rejected,
                    "trait": option.trait, "seconds": round(r.response_ms / 1000, 1)})
    for w in db.work_for(player_id):
        # A job the human reviewed is a pick too: confirming or correcting the twin teaches it.
        job = JOB_BY_ID.get(w.job_id)
        option = next((o for o in job.card.options if o.id == w.final_choice), None) if job else None
        if job is None or option is None:
            continue
        out.append({"topic": "work", "card": job.question, "picked": option.label,
                    "over": [o.label for o in job.card.options if o.id != option.id], "trait": option.trait, "seconds": None})
    return out[-MAX_PICKS:]


def card_brief(card: Card) -> dict[str, Any]:
    """A card as the Sym may see it: the question and the options. No trait tags, no answers."""
    return {"card_id": card.id, "card": card.prompt, "options": [{"id": o.id, "label": o.label} for o in card.options]}


def register_profiler_tools(agent: Agent[TwinDeps, Any]) -> None:
    @agent.tool
    def get_picks(ctx: RunContext[TwinDeps]) -> dict[str, Any]:
        """Return this player's picks so far (what they chose, what they passed over, how fast) and a
        count of how often each trait was chosen. Call once."""
        ctx.deps.calls["get_picks"] = ctx.deps.calls.get("get_picks", 0) + 1
        picks = _visible_picks(ctx.deps.player_id)
        if not picks:
            return {"ok": False, "error": "This player has no picks yet."}
        out = {"ok": True, "picks": picks, "trait_counts": db.trait_counts(ctx.deps.player_id),
               "topics": [t["name"] for t in TOPICS]}
        told = [{"scope": f.scope, "topic": f.topic, "statement": f.statement} for f in db.facts_for(ctx.deps.player_id)]
        if told:
            out["told_by_person"] = told
        if ctx.deps.misses:
            out["missed_predictions"] = ctx.deps.misses
        return out


def register_twin_tools(agent: Agent[TwinDeps, Any]) -> None:
    @agent.tool
    def get_brief(ctx: RunContext[TwinDeps]) -> dict[str, Any]:
        """Return what you know about your human (the tendencies) and the cards to predict. Call once."""
        ctx.deps.calls["get_brief"] = ctx.deps.calls.get("get_brief", 0) + 1
        tendencies = db.tendencies_for(ctx.deps.player_id)
        cards = [card_brief(CARDS[cid]) for cid in ctx.deps.battle_card_ids if cid in CARDS]
        if not cards:
            return {"ok": False, "error": "There are no cards to predict."}
        return {
            "ok": True,
            "tendencies": [{"topic": t.topic, "scope": t.scope, "statement": t.statement, "evidence_count": t.evidence_count} for t in tendencies],
            "told_by_person": [{"scope": f.scope, "topic": f.topic, "statement": f.statement} for f in db.facts_for(ctx.deps.player_id)],
            "cards": cards,
        }


def register_worker_tools(agent: Agent[TwinDeps, Any]) -> None:
    @agent.tool
    def get_job(ctx: RunContext[TwinDeps]) -> dict[str, Any]:
        """Return what you know about your human (the tendencies) and the job: one question and its options. Call once."""
        ctx.deps.calls["get_job"] = ctx.deps.calls.get("get_job", 0) + 1
        job = JOB_BY_ID.get(ctx.deps.job_id or "")
        if job is None:
            return {"ok": False, "error": "There is no job."}
        tendencies = db.tendencies_for(ctx.deps.player_id)
        if not tendencies:
            return {"ok": False, "error": "You know nothing about your human yet."}
        return {
            "ok": True,
            "tendencies": [{"topic": t.topic, "statement": t.statement, "evidence_count": t.evidence_count} for t in tendencies],
            "job": {"asked_by": job.requester_kind, "question": job.question,
                    "options": [{"id": o.id, "label": o.label} for o in job.card.options]},
        }


def register_guide_tools(agent: Agent[TwinDeps, Any]) -> None:
    @agent.tool
    def get_situation(ctx: RunContext[TwinDeps]) -> dict[str, Any]:
        """Return what you know about your human, where they stand in the game, the moves you may offer, and the
        line they just said to you. Call once."""
        ctx.deps.calls["get_situation"] = ctx.deps.calls.get("get_situation", 0) + 1
        if not ctx.deps.situation:
            return {"ok": False, "error": "There is nothing to answer yet."}
        return {"ok": True, **ctx.deps.situation}
