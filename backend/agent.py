"""The BYT agents inside the class safe harness (PydanticAI).

Two agents, each with its own prompt file and one read-only tool:
- Profiler: reads a player's picks (get_picks) and writes the tendencies, which are the Sym's knowledge.
- Sym: reads the tendencies and the cards to predict (get_brief) and returns one prediction per card.

The five pieces:
- Tools: tools.py, typed and read-only. Facts come from tools.
- Memory: the database is the durable state (tendencies); TwinDeps carries the player id and the cards.
- Stopping rules: a finish instruction in the prompts plus UsageLimits in code, a daily token budget,
  and a fixed vocabulary of stop reasons.
- Guardrails: allow-listed model, the player's identity never reaches the model, model output is
  validated against the real cards and options, the prompt guard runs on text the model wrote before
  another agent reads it, and no model can issue a certificate (verifier.py does that).
- Audit: every graph node goes to backend/output/audit.jsonl (local); the compact trail of the loop goes
  to output/audit_trail.json (committed, counts only, no player text). Token usage goes to the usage table.

No exception reaches a route: every run returns an outcome with a stop reason, and the caller falls
back to the zero-token practice Sym when there is no usable result.
"""
from __future__ import annotations

import os
import re
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI
from pydantic_ai import Agent
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIResponsesModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import UsageLimits
from pydantic_graph import End

import db
import market
from audit import AuditLogger
from content import CARDS, TOPIC_NAME, topic_id
from models import GuideDraft, ProfileOut, TwinOut, Usage, WorkDraft
from prompt_guard import append_flags, strip_injections
from tools import TwinDeps, register_guide_tools, register_profiler_tools, register_twin_tools, register_worker_tools
from verifier import popular_choice, rule_of_thumb
from work import Job

HERE = Path(__file__).resolve().parent
PROMPTS = HERE / "prompts"
PORTKEY_BASE_URL = "https://api.portkey.ai/v1"
DEFAULT_MODEL = "gpt-6-luna"
ALLOWED_MODELS = {"gpt-6-luna"}  # the only model the course key may use
LIMITS = UsageLimits(request_limit=4, tool_calls_limit=3)  # a normal run is 2 requests and 1 tool call
OUTPUT_TOOL = "final_result"

# USD per 1M tokens (the price table used in Lecture 11). Input tokens reported by the API include the cached ones.
PRICES = {"gpt-6-luna": {"input": 0.10, "cached": 0.01, "output": 0.50}}
PRICE_NOTE = "gpt-6-luna: 0.10 USD per 1M input tokens, 0.01 per 1M cached input, 0.50 per 1M output."

MODEL_OVERRIDE: Model | None = None  # tests set this so no key or network is needed
_models: dict[str, Model] = {}
_agents: dict[str, Agent[TwinDeps, Any]] = {}


def daily_token_budget() -> int:
    return int(os.environ.get("DAILY_TOKEN_BUDGET") or 2_000_000)


def get_model_name() -> str:
    name = (os.environ.get("OPENAI_MODEL") or DEFAULT_MODEL).strip()
    if name not in ALLOWED_MODELS:
        raise RuntimeError(f"OPENAI_MODEL {name!r} is not allowed. Use one of {sorted(ALLOWED_MODELS)}")
    return name


def build_model() -> Model:
    if MODEL_OVERRIDE is not None:
        return MODEL_OVERRIDE
    name = get_model_name()
    if name not in _models:
        key = (os.environ.get("PORTKEY_API_KEY") or "").strip()
        direct = (os.environ.get("OPENAI_API_KEY") or "").strip()
        if key == "your-key-here":
            key = ""
        if direct == "your-key-here":
            direct = ""
        # an OpenAI key saved under the Portkey name is used as what it is: Portkey would refuse it
        if key.startswith("sk-"):
            direct, key = direct or key, ""
        if key:
            # the course route: every call goes through the Portkey gateway
            client = AsyncOpenAI(api_key=key, base_url=PORTKEY_BASE_URL, default_headers={"x-portkey-api-key": key}, max_retries=3)
        elif direct:
            # no Portkey key: the same model, asked from OpenAI directly
            client = AsyncOpenAI(api_key=direct, max_retries=3)
        else:
            raise RuntimeError("PORTKEY_API_KEY is not set. Put it in .env (see .env.example).")
        provider = OpenAIProvider(openai_client=client)
        _models[name] = (
            OpenAIResponsesModel(name, provider=provider) if name.startswith("gpt-6") else OpenAIChatModel(name, provider=provider)
        )
    return _models[name]


def _prompt(name: str) -> str:
    return (PROMPTS / "prompt.md").read_text(encoding="utf-8") + "\n\n" + (PROMPTS / f"{name}.md").read_text(encoding="utf-8")


def get_agent(name: str) -> Agent[TwinDeps, Any]:
    """One agent per name for the process. The model is passed per run."""
    if name not in _agents:
        if name == "profiler":
            agent: Agent[TwinDeps, Any] = Agent(None, deps_type=TwinDeps, output_type=ProfileOut, instructions=_prompt("profiler"), retries=2, name="byt_profiler")
            register_profiler_tools(agent)
        elif name == "twin":
            agent = Agent(None, deps_type=TwinDeps, output_type=TwinOut, instructions=_prompt("twin"), retries=2, name="byt_twin")
            register_twin_tools(agent)
        elif name == "worker":
            agent = Agent(None, deps_type=TwinDeps, output_type=WorkDraft, instructions=_prompt("worker"), retries=2, name="byt_worker")
            register_worker_tools(agent)
        elif name == "guide":
            agent = Agent(None, deps_type=TwinDeps, output_type=GuideDraft, instructions=_prompt("guide"), retries=2, name="byt_guide")
            register_guide_tools(agent)
        else:
            raise ValueError(f"unknown agent {name!r}")
        _agents[name] = agent
    return _agents[name]


# Built from code points so this file never contains the banned character itself.
_EM_DASH_RE = re.compile(r"\s*[" + chr(0x2014) + chr(0x2015) + r"]\s*")
_EN_DASH_RE = re.compile(chr(0x2013))


def strip_em_dashes(text: str) -> str:
    """House style: no em dashes. A dash between words becomes a comma; an en dash becomes a hyphen."""
    out = _EM_DASH_RE.sub(", ", text)
    out = _EN_DASH_RE.sub("-", out)
    out = re.sub(r",\s*([,.;:!?])", r"\1", out)
    out = re.sub(r"\(\s*,\s*", "(", out)
    out = re.sub(r"^\s*,\s*", "", out, flags=re.M)
    return re.sub(r"[ \t]{2,}", " ", out)


def cost_usd(model: str, input_tokens: int, cached_tokens: int, output_tokens: int) -> float:
    p = PRICES.get(model, PRICES[DEFAULT_MODEL])
    uncached = max(input_tokens - cached_tokens, 0)
    return round((uncached * p["input"] + cached_tokens * p["cached"] + output_tokens * p["output"]) / 1e6, 8)


@dataclass
class RunOutcome:
    output: Any | None
    stopped_reason: str  # completed, usage_limit, budget, no_key, no_result, or an exception class name
    input_tokens: int = 0
    cached_tokens: int = 0
    output_tokens: int = 0
    requests: int = 0
    cost_usd: float = 0.0
    ms: int = 0


def _node_summary(node: Any) -> dict[str, Any]:
    """Compact, text-only view of a graph node for the local forensic log."""
    out: dict[str, Any] = {"node": type(node).__name__}
    resp = getattr(node, "model_response", None)
    if resp is not None:
        parts = []
        for p in getattr(resp, "parts", []) or []:
            entry: dict[str, Any] = {"part": type(p).__name__}
            if hasattr(p, "tool_name"):
                entry["tool"] = p.tool_name
                entry["args"] = str(getattr(p, "args", ""))[:300]
            elif hasattr(p, "content"):
                entry["text"] = str(p.content)[:300]
            parts.append(entry)
        out["parts"] = parts
    req = getattr(node, "request", None)
    if req is not None:
        obs = []
        for p in getattr(req, "parts", []) or []:
            if type(p).__name__ == "ToolReturnPart":
                obs.append({"tool": getattr(p, "tool_name", None), "result": str(getattr(p, "content", ""))[:300]})
            elif type(p).__name__ == "RetryPromptPart":
                obs.append({"retry": str(getattr(p, "content", ""))[:200]})
        if obs:
            out["observations"] = obs
    return out


def _trail_node(audit: AuditLogger, node: Any, counts: dict[str, int]) -> None:
    """Tool calls, tool results and retries into the committed trail. Names and sizes only, never player text."""
    resp = getattr(node, "model_response", None)
    if resp is not None:
        for p in getattr(resp, "parts", []) or []:
            tool = getattr(p, "tool_name", None)
            if tool and tool != OUTPUT_TOOL:
                counts["tool_calls"] += 1
                audit.trail("tool_call", tool=tool)
    req = getattr(node, "request", None)
    if req is not None:
        counts["requests"] += 1
        for p in getattr(req, "parts", []) or []:
            kind = type(p).__name__
            if kind == "ToolReturnPart" and getattr(p, "tool_name", None) != OUTPUT_TOOL:
                content = getattr(p, "content", None)
                ok = content.get("ok") if isinstance(content, dict) else None
                audit.trail("tool_result", tool=p.tool_name, ok=ok, chars=len(str(content)))
            elif kind == "RetryPromptPart":
                audit.trail("retry", tool=getattr(p, "tool_name", None))


async def run_harnessed(agent_name: str, task: str, deps: TwinDeps) -> RunOutcome:
    """One harnessed run: check the budget, iterate the graph, audit each node, enforce limits, record usage.
    Never raises to the caller."""
    run_id = uuid.uuid4().hex[:12]
    audit = AuditLogger(run_id)
    started = time.perf_counter()
    counts = {"requests": 0, "tool_calls": 0}
    outcome = RunOutcome(output=None, stopped_reason="completed")
    model_name = os.environ.get("OPENAI_MODEL") or DEFAULT_MODEL
    audit.log("task", thought=task, extra={"agent": agent_name})
    audit.trail("turn", agent=agent_name, task=task)

    run_ref: Any = None
    try:
        if db.tokens_last_day() >= daily_token_budget():
            outcome.stopped_reason = "budget"
            audit.trail("guard", check="daily_token_budget", result="budget spent, the model was not called")
        else:
            model = build_model()
            if MODEL_OVERRIDE is None:
                model_name = get_model_name()
            async with get_agent(agent_name).iter(task, deps=deps, usage_limits=LIMITS, model=model) as run:
                run_ref = run
                async for node in run:
                    if isinstance(node, End):
                        continue
                    audit.log("loop", extra=_node_summary(node))
                    _trail_node(audit, node, counts)
                result = run.result
                if result is None:
                    outcome.stopped_reason = "no_result"
                else:
                    outcome.output = result.output
    except UsageLimitExceeded as exc:
        outcome.stopped_reason = "usage_limit"
        audit.log("stop", thought=str(exc)[:200])
    except RuntimeError as exc:
        outcome.stopped_reason = "no_key" if "PORTKEY_API_KEY" in str(exc) else type(exc).__name__
        audit.log("error", thought=f"{type(exc).__name__}: {str(exc)[:200]}")
    except Exception as exc:  # noqa: BLE001
        outcome.stopped_reason = type(exc).__name__
        audit.log("error", thought=f"{type(exc).__name__}: {str(exc)[:200]}")

    if run_ref is not None:
        try:
            usage = run_ref.usage
            usage = usage() if callable(usage) else usage
            outcome.input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
            outcome.cached_tokens = int(getattr(usage, "cache_read_tokens", 0) or 0)
            outcome.output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
            outcome.requests = int(getattr(usage, "requests", 0) or counts["requests"])
        except Exception:  # noqa: BLE001  (usage is best effort; a run without it still counts)
            pass
    outcome.cost_usd = cost_usd(model_name, outcome.input_tokens, outcome.cached_tokens, outcome.output_tokens)
    outcome.ms = int((time.perf_counter() - started) * 1000)

    audit.log("harness_complete", thought=outcome.stopped_reason)
    audit.trail("stop", agent=agent_name, stop_reason=outcome.stopped_reason, requests=counts["requests"],
                tool_calls=counts["tool_calls"], input_tokens=outcome.input_tokens, cached_tokens=outcome.cached_tokens,
                output_tokens=outcome.output_tokens, ms=outcome.ms)
    try:
        db.record_usage(Usage(run_id=run_id, agent=agent_name, player_id=deps.player_id, model=model_name,
                              input_tokens=outcome.input_tokens, cached_tokens=outcome.cached_tokens,
                              output_tokens=outcome.output_tokens, requests=outcome.requests, cost_usd=outcome.cost_usd,
                              stopped_reason=outcome.stopped_reason, ms=outcome.ms), market.USD_PER_CREDIT)
    except Exception:  # noqa: BLE001  (the ledger must never break a run)
        pass
    return outcome


async def profile_player(player_id: str, misses: list[dict[str, Any]] | None = None) -> str:
    """Run the Profiler and store the tendencies it wrote, cleaned. Returns the stop reason.
    After a battle it is given the guesses the Sym got wrong, so the beliefs that failed are the ones rewritten."""
    task = ("The Sym guessed some picks wrong. Read the missed predictions and profile this player again."
            if misses else "Profile this player from their picks.")
    outcome = await run_harnessed("profiler", task, TwinDeps(player_id=player_id, misses=misses))
    if not isinstance(outcome.output, ProfileOut):
        return outcome.stopped_reason
    kept: list[tuple[str, str, int]] = []
    seen: set[str] = set()
    # one belief for each topic, the best supported first, so a belief has one name that lasts
    for t in sorted(outcome.output.tendencies[:10], key=lambda d: -d.evidence_count):
        # The Twin will read these lines, so text one model wrote is guarded like any other untrusted text.
        statement, flags = strip_injections(strip_em_dashes(t.statement).strip(), source="profiler_output", channel="model_output")
        if flags:
            append_flags(flags)
            continue
        topic = TOPIC_NAME[topic_id(strip_em_dashes(t.topic))]
        if statement and topic not in seen:
            seen.add(topic)
            kept.append((topic, statement[:200], t.evidence_count, t.scope))
    if kept:
        db.replace_tendencies(player_id, kept)
    return outcome.stopped_reason if kept else "no_result"


async def predict_battle(player_id: str, card_ids: list[str]) -> tuple[str, dict[str, tuple[str | None, float, str | None]], dict[str, str]]:
    """Predictions for a battle: (Sym kind, {card id: (choice or None, confidence, the belief leaned on)},
    {card id: baseline choice}).

    The Sym agent answers when it can. When it cannot (no key, budget spent, a limit, an error, or an
    answer that fits none of the cards) the zero-token practice Sym answers instead, and says so.
    """
    cards = [CARDS[cid] for cid in card_ids if cid in CARDS]
    baseline = {c.id: popular_choice(c, db.picks_by_others(c.id, player_id)) for c in cards}

    if not db.tendencies_for(player_id):
        await profile_player(player_id)

    predictions: dict[str, tuple[str | None, float, str | None]] = {}
    beliefs = {t.topic.strip().lower(): t.statement for t in db.tendencies_for(player_id)}
    if beliefs:
        outcome = await run_harnessed(
            "twin", f"Predict your human's pick on each of the {len(cards)} cards.",
            TwinDeps(player_id=player_id, battle_card_ids=[c.id for c in cards]),
        )
        if isinstance(outcome.output, TwinOut):
            by_id = {c.id: c for c in cards}
            for p in outcome.output.predictions:
                card = by_id.get(p.card_id)
                if card is None or p.card_id in predictions:
                    continue  # a card that was not asked, or asked twice: dropped
                valid = p.choice in {o.id for o in card.options}
                # the twin names a topic; code looks up the belief, so the words shown are the stored ones
                leaned = beliefs.get((p.because or "").strip().lower())
                predictions[card.id] = (p.choice if valid else None, p.confidence if valid else 0.0, leaned if valid else None)

    if any(guess[0] is not None for guess in predictions.values()):
        for c in cards:
            predictions.setdefault(c.id, (None, 0.0, None))
        return "model", predictions, baseline

    counts = db.trait_counts(player_id)
    return "offline", {c.id: (rule_of_thumb(c, counts, baseline[c.id]), 0.5, None) for c in cards}, baseline


OFFLINE_REASON = "My picks point this way most often."


async def do_job(player_id: str, job: Job) -> tuple[str, str | None, str]:
    """The Sym answers one job as its human: (Sym kind, option id or None, one-line reason).

    The Worker agent answers when it can. Otherwise the zero-token practice Sym answers from the trait
    counts, and says so. Either way the human reviews the answer before anything is paid.
    """
    if not db.tendencies_for(player_id):
        await profile_player(player_id)
    if db.tendencies_for(player_id):
        outcome = await run_harnessed("worker", "Do this job as your human would.", TwinDeps(player_id=player_id, job_id=job.id))
        draft = outcome.output
        if isinstance(draft, WorkDraft) and draft.choice in {o.id for o in job.card.options}:
            # The reason is model text shown to a person: cleaned, guarded and cut to length.
            reason, flags = strip_injections(strip_em_dashes(draft.reason).strip(), source="worker_output", channel="model_output")
            if flags:
                append_flags(flags)
                reason = ""
            return "model", draft.choice, reason[:200]
    counts = db.trait_counts(player_id, include_held_out=True)
    best = max(job.card.options, key=lambda o: counts.get(o.trait or "", 0))  # the first option wins a tie
    if counts.get(best.trait or "", 0) == 0:
        return "offline", None, ""
    return "offline", best.id, OFFLINE_REASON


NOTE_BLOCKED = re.compile(
    r"@|https?:|www\.|\d{3,}|diagnos|medic|illness|disease|depress|anxi|therap|pregnan|disab|religi|politic|sexual|ethnic|salary|debt",
    re.IGNORECASE)


CALENDAR = re.compile(r"(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|"
                      r"August|September|October|November|December)s?")


def clean_note(note: Any) -> tuple[str, str, str] | None:
    """A fact the Guide wants to keep, checked by code: (scope, topic, statement), or None when it is refused.
    It must be one plain sentence about "this person" in the Sym's words, with no name (no capital letter after
    the first), no number, no address, and nothing about health, money, belief or other sensitive ground."""
    if note is None:
        return None
    statement, flags = strip_injections(strip_em_dashes(note.statement).strip(), source="guide_note", channel="model_output")
    topic = re.sub(r"[^a-z ]", "", strip_em_dashes(note.topic).strip().lower())[:30].strip()
    if flags:
        append_flags(flags)
        return None
    topic = TOPIC_NAME[topic_id(topic)].lower()
    if not statement.startswith("This person ") or len(statement) > 160:
        return None
    plain = CALENDAR.sub("", statement[1:])  # the names of days and months are not names of people or places
    if re.search(r"[A-Z]", plain) or NOTE_BLOCKED.search(statement) or NOTE_BLOCKED.search(topic):
        return None
    return note.scope, topic, statement


async def talk(player_id: str, said: str, situation: dict[str, Any], moves: set[str]) -> tuple[str, str, str | None, tuple[str, str, str] | None]:
    """The Sym answers one line from its human: (Sym kind, what it says, a move id or None).

    The human's words travel in the tool result, last, and never in the task message, so they stay out of the
    committed trail. The answer is model text shown to a person: cleaned, guarded and cut to length. A move the
    model names is used only if it is on the list code gave it. Returns ("offline", "", None) when there is no
    usable answer, and the caller then answers by plain code.
    """
    outcome = await run_harnessed("guide", "Answer your human, and offer one move.",
                                  TwinDeps(player_id=player_id, situation={**situation, "human_said": said}))
    draft = outcome.output
    if isinstance(draft, GuideDraft):
        say, flags = strip_injections(strip_em_dashes(draft.say).strip(), source="guide_output", channel="model_output")
        if flags:
            append_flags(flags)
        elif say:
            return "model", say[:320], draft.move if draft.move in moves else None, clean_note(draft.note)
    return "offline", "", None, None
