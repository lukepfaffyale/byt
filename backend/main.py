"""FastAPI entry point: .env loading, CORS, and the game routes.

The .env file is looked for in backend/, then the repo folder, then one folder above the repo
(where the teaching staff keep theirs). The first file that defines a variable wins.
"""
from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timedelta, timezone
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")
for _env in (ROOT / "backend" / ".env", ROOT / ".env", ROOT.parent / ".env"):
    load_dotenv(_env)

import agent as agents  # noqa: E402
import json  # noqa: E402

import db  # noqa: E402
import life  # noqa: E402
import market  # noqa: E402
import mirror as mirror_rules  # noqa: E402
import rps  # noqa: E402
import verifier  # noqa: E402
import work as work_rules  # noqa: E402
from content import (CARDS, GATE_BY_ID, GATES, ONTOLOGY, PACK_BY_STEP, PACKS, RIGHT_KINDS, SKILL_BY_ID, TOPICS,  # noqa: E402
                     TOPIC_AREA, TOPIC_NAME, Card, Gate, score, topic_id)
from models import (  # noqa: E402
    FeedbackIn,
    FeedbackOut,
    FeedbackRow,
    Activity,
    ActivityItem,
    Agency,
    BriefIn,
    BriefOut,
    AskIn,
    AskOut,
    AutoIn,
    NeedOut,
    Plan,
    PlanOption,
    SponsorIn,
    SponsorOut,
    World,
    Commons,
    Ripple,
    RippleLink,
    Happening,
    MadeOut,
    MoveOut,
    PostIn,
    PostOut,
    PackCard,
    PackOut,
    StepIn,
    MeetIn,
    Meets,
    MetAnswer,
    MetTwin,
    OneToOneIn,
    SkillPick,
    AgentUsage,
    AreaHit,
    AudienceOut,
    Hub,
    PairOut,
    WantedOut,
    FactOut,
    FactsOut,
    Judgment,
    RetryOut,
    SureRow,
    SureTap,
    RpsIn,
    RpsOut,
    RpsRival,
    RpsRound,
    RpsTell,
    LearnOut,
    LessonOut,
    TierOut,
    CampaignIn,
    CampaignOut,
    AgencyMoney,
    AgentCost,
    ConsentIn,
    CreatorSeat,
    DepositIn,
    Money,
    WalletLine,
    WalletOut,
    Wallets,
    MoneyLine,
    Export,
    ExportReview,
    ExportTap,
    OrgCreate,
    QuestionOut,
    AxisOut,
    BinOut,
    FacultyOut,
    PathOut,
    SkillRef,
    Skills,
    Sphere,
    SphereFrame,
    Vertical,
    SkillStepOut,
    SkillTreeOut,
    Mirror,
    SelfReport,
    StyleOut,
    Told,
    BattleResult,
    BattleStart,
    BattleStarted,
    BattleSummary,
    BoardOut,
    CardOut,
    Cert,
    CertOut,
    Deleted, CodeBase, SymCode,
    Left,
    GateCards,
    GateOut,
    Health,
    JobOut,
    JobResult,
    Jobs,
    Journey,
    Me,
    OptionOut,
    Player,
    PlayerCreate,
    PlayerCreated,
    ResponseIn,
    ResponseOut,
    ReviewIn,
    SplitRow,
    WorkItem,
    TendencyOut,
    UsageSummary,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.ensure_schema()
    db.ensure_ledger(market.FUND_START, market.STEP_KIND)
    for posted in db.all_postings():
        register_posting(posted)
    life.seats()
    pulse = asyncio.create_task(_life()) if os.getenv("BYT_LIFE", "on") != "off" else None
    yield
    if pulse:
        pulse.cancel()


def warm_bots(most: int | None = None) -> None:
    """Refresh what is kept about the free Syms, oldest first, so a visitor's request never has to read all of them.
    `most` limits how many are refreshed in one go; None refreshes every one."""
    ids = db.free_twin_ids()
    ids.sort(key=lambda pid: _bot_facts[pid][0] if pid in _bot_facts else 0.0)
    for pid in ids[:most] if most else ids:
        _bot_facts[pid] = (time.monotonic(), _twin_facts(pid, True))


async def _life() -> None:
    """While the server is awake, one BOT Sym does one thing every so often. Plain code, no model."""
    try:
        await asyncio.to_thread(warm_bots)  # once at the start, in the background
    except Exception:
        logging.getLogger("byt.life").exception("warming the free Syms failed")
    while True:
        await asyncio.sleep(LIFE_SECONDS)
        try:
            await asyncio.to_thread(life.step)
            await asyncio.to_thread(warm_bots, 24)  # a few at a time: every free Sym is refreshed long before it goes stale
        except Exception:  # a bot's move must never take the server down
            logging.getLogger("byt.life").exception("a BOT move failed")


app = FastAPI(title="BYT", lifespan=lifespan)

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ---------- small in-memory rate limit (addresses are never stored) ----------

_hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(request: Request | None, name: str, limit: int, window: float = 60.0) -> None:
    if request is None:  # a BOT seat, moved by the game's own code (life.py), not by a caller
        return
    # behind a host's proxy every caller arrives from the proxy's address, so the first forwarded address is the
    # caller. Without this, everyone playing at once would share one limit.
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    key = f"{name}:{forwarded or (request.client.host if request.client else 'unknown')}"
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "That was too fast. Please wait one minute, then try again.")
    q.append(now)


# ---------- identity: a random token in the Authorization header ----------

def current_player(authorization: str | None = Header(default=None)) -> Player:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please start a game first.")
    player = db.player_by_token(authorization[7:].strip())
    if player is None:
        raise HTTPException(401, "We could not find this game. Please start a new one.")
    db.mark_active(player.id)  # one row for each day played: it shows the twin has a living owner
    return player


# ---------- helpers ----------

def recent_days(player_id: str) -> int:
    """How many of the last ACTIVE_WINDOW days the player used the game."""
    from datetime import datetime, timedelta, timezone

    since = (db.utcnow().date() - timedelta(days=market.ACTIVE_WINDOW - 1)).isoformat()
    return sum(1 for day in db.days_played(player_id) if day >= since)


def gate_state(answered: set[str]) -> list[GateOut]:
    out: list[GateOut] = []
    unlocked = True
    for g in GATES:
        done = sum(1 for cid in g.card_ids if cid in answered)
        out.append(
            GateOut(id=g.id, title=g.title, kind=g.kind, deck=g.deck, difficulty=g.difficulty, bin=g.bin,
                    total=len(g.card_ids), done=done, unlocked=unlocked)
        )
        unlocked = unlocked and done == len(g.card_ids)
    return out


def made_cards() -> dict[str, list[str]]:
    """The skill steps creators have built: the pack id, and the cards the creator tapped."""
    return {row.id: json.loads(row.cards) for row in db.made_steps()}


def step_state(answered: set[str], made: dict[str, list[str]] | None = None) -> dict[str, GateOut]:
    """Where a player stands on each step a creator built. A built step is not on the journey: it is played from
    the skills screen, and it opens when the built steps before it in the same skill are finished."""
    made = made_cards() if made is None else made
    out: dict[str, GateOut] = {}
    for skill in ONTOLOGY["skills"]:
        unlocked = True
        for step in skill["steps"]:
            pack = PACK_BY_STEP.get((skill["id"], step["name"]))
            ids = made.get(pack.id) if pack else None
            if pack is None or not ids:
                continue
            done = sum(1 for cid in ids if cid in answered)
            out[pack.id] = GateOut(id=pack.id, title=pack.title, kind=pack.kind, deck=pack.deck, difficulty=pack.difficulty,
                                   bin=pack.bin, total=len(ids), done=done, unlocked=unlocked)
            unlocked = unlocked and done == len(ids)
    return out


def state_of(gate_id: str, answered: set[str], made: dict[str, list[str]] | None = None) -> GateOut | None:
    """A gate on the journey, or a step a creator built. None for a pack no creator has built."""
    return next((g for g in gate_state(answered) if g.id == gate_id), None) or step_state(answered, made).get(gate_id)


def card_out(card: Card) -> CardOut:
    board = BoardOut(game=card.board.game, rows=list(card.board.rows), to_move=card.board.to_move, seq=list(card.board.seq)) if card.board else None
    return CardOut(id=card.id, kind=card.kind, prompt=card.prompt,
                   options=[OptionOut(id=o.id, label=o.label) for o in card.options], board=board)


def choice_label(card: Card, choice: str | None) -> str:
    if choice is None:
        return "I do not know"
    return next((o.label for o in card.options if o.id == choice), choice)


def gates_done(states: list[GateOut]) -> int:
    return sum(1 for g in states if g.done == g.total)


def cert_out(c: Cert) -> CertOut:
    return CertOut(kind=c.kind, topic=c.topic, level=c.level, accuracy=round(c.accuracy, 3),
                   baseline=None if c.baseline is None else round(c.baseline, 3), n=c.n, issued_at=db.iso(c.issued_at))


def battle_result(player: Player, gate: Gate) -> BattleResult:
    """Score a battle from the stored predictions and real picks, and issue the cert if it is earned. All code."""
    battle = db.battle_for(player.id, gate.id)
    if battle is None:
        raise HTTPException(404, "This battle has not started yet.")
    rows = db.predictions_for(battle.id)
    answered = [r for r in rows if r.actual is not None]
    s = verifier.score_battle([(r.predicted, r.baseline, r.actual or "") for r in answered])
    complete = len(answered) == battle.n
    cert = None
    note = "The battle is not finished yet."
    if complete:
        if battle.twin_matches is None:
            db.close_battle(battle.id, s.twin_matches, s.baseline_matches)
        earned, note = verifier.earns_twin_cert(s, battle.twin_kind)
        if earned:
            cert = cert_out(db.issue_cert(player.id, "twin", battle.topic, "", s.accuracy, s.baseline_accuracy, s.n))
    hits: dict[str, list[int]] = {}
    for r in answered:  # which brain area each real pick fell in, and whether the twin had guessed it
        card = CARDS.get(r.card_id)
        option = next((o for o in card.options if o.id == r.actual), None) if card else None
        for f in ONTOLOGY["faculties"]:
            if option is not None and option.trait in f["traits"]:
                tally = hits.setdefault(f["id"], [0, 0])
                tally[0] += 1 if r.predicted == r.actual else 0
                tally[1] += 1
    areas = [AreaHit(key=f["id"], name=f["name"], region=f["region"], color=f["color"], right=hits[f["id"]][0], total=hits[f["id"]][1])
             for f in ONTOLOGY["faculties"] if f["id"] in hits]
    record = [f"{b.twin_matches}/{b.n}" for b in sorted(db.battles_for(player.id), key=lambda b: b.created_at) if b.twin_matches is not None]
    return BattleResult(gate_id=gate.id, topic=battle.topic, n=battle.n, answered=len(answered), complete=complete, areas=areas, record=record,
                        twin_kind=battle.twin_kind, twin_matches=s.twin_matches, baseline_matches=s.baseline_matches,
                        cert=cert, note=note)


# ---------- work: jobs the twin does ----------

def job_out(job: work_rules.Job, row, cleared: int) -> JobOut:
    state = "locked" if cleared < job.after_gates else "open" if row is None else "review" if row.verdict is None else "done"
    out = JobOut(id=job.id, requester=job.requester, requester_kind=job.requester_kind, question=job.question,
                 feeds=job.feeds, pay=job.pay, after_gates=job.after_gates, state=state)
    if row is not None:
        out.options = [OptionOut(id=o.id, label=o.label) for o in job.card.options]
        out.twin_kind, out.answer, out.reason = row.twin_kind, row.answer, row.reason
        out.verdict, out.final_choice, out.credits = row.verdict, row.final_choice, row.credits
    return out


POSTED_BY = "An agency in the game"  # a player never learns which agency posted a job


def register_posting(p) -> None:
    """A job an agency posted becomes a job like any other: one of the fixed questions, at the pay the agency set."""
    q = market.QUESTION_BY_ID.get(p.question_id)
    if q is not None:
        work_rules.JOB_BY_ID[p.id] = work_rules.Job(p.id, POSTED_BY, q.kind, market.JOB_AFTER_GATES, p.pay, q.question,
                                                    "What an agency wants to know",
                                                    Card(p.id, "", "job", "work", None, q.question, q.card.options))


def job_list(player: Player, cleared: int) -> list[JobOut]:
    """The jobs we wrote, then the jobs agencies posted that still have a place. Never the player's own job."""
    rows = {w.job_id: w for w in db.work_for(player.id)}
    out = [job_out(j, rows.get(j.id), cleared) for j in work_rules.JOBS]
    mine = db.org_for(player.id, "agency")
    for p in db.all_postings():
        job = work_rules.JOB_BY_ID.get(p.id)
        if job is None or (mine is not None and p.org_id == mine.id):
            continue
        if p.id not in rows and (p.closed or db.seats_taken(p.id) >= p.seats):
            continue
        out.append(job_out(job, rows.get(p.id), cleared))
    return out


def cleared_gates(player: Player) -> int:
    return gates_done(gate_state(db.answered_card_ids(player.id)))


def is_certified(player: Player) -> bool:
    return any(c.kind == "twin" for c in db.certs_for(player.id))


def work_items(player_id: str) -> list[WorkItem]:
    out = []
    for w in db.work_for(player_id):
        job = work_rules.JOB_BY_ID.get(w.job_id)
        if job is None:
            continue
        out.append(WorkItem(requester=job.requester, question=job.question, twin_answer=choice_label(job.card, w.answer),
                            your_answer=choice_label(job.card, w.final_choice) if w.final_choice else "Not checked yet",
                            verdict=w.verdict or "waiting for you", credits=w.credits))
    return out


def collective(job: work_rules.Job) -> tuple[list[str], int]:
    """Every Sym's answer to a job: real players' confirmed answers plus the made-up sample Syms, who
    answer by the zero-token rule of thumb. Returns (choices, how many of them are sample Syms)."""
    real = db.confirmed_choices(job.id)
    samples = []
    for pid in db.sample_player_ids():
        choice = verifier.rule_of_thumb(job.card, db.trait_counts(pid, include_held_out=True), job.card.options[0].id)
        samples.append(choice)
    return real + samples, len(samples)


# ---------- routes ----------

@app.get("/health", response_model=Health)
def health() -> Health:
    return Health()


@app.post("/players", response_model=PlayerCreated, status_code=201)
def create_player(body: PlayerCreate, request: Request) -> PlayerCreated:
    rate_limit(request, "signup", 10)
    player, token = db.create_player(body.nickname.strip())
    return PlayerCreated(token=token, nickname=player.nickname)


@app.get("/me", response_model=Me)
def me(background: BackgroundTasks, player: Player = Depends(current_player)) -> Me:
    background.add_task(auto_work, player)  # a twin that may work by itself starts a job now, if its owner said so
    states = gate_state(db.answered_card_ids(player.id))
    return Me(nickname=player.nickname, points=player.points, level=player.level,
              gates_done=gates_done(states), gates_total=len(GATES), certs=len(db.certs_for(player.id)),
              credits=db.credits_for(player.id), twins=db.twin_count(), people=db.people_count(),
              together=market.together(sum(1 for w in db.work_for(player.id) if w.verdict),
                                       sum(1 for e in db.earnings_for(player.id) if e.kind != market.STEP_KIND),
                                       db.data_income_on(player.id)),
              active_days=recent_days(player.id), income_share=market.activity_share(db.days_since_active(player.id)),
              jobs_open=sum(1 for j in job_list(player, gates_done(states)) if j.state in ("open", "review")))


@app.get("/journey", response_model=Journey)
def journey(player: Player = Depends(current_player)) -> Journey:
    states = gate_state(db.answered_card_ids(player.id))
    used = {g.bin for g in states}
    bins = [BinOut(id=b["id"], name=b["name"], about=b["about"]) for b in ONTOLOGY["bins"] if b["id"] in used]
    return Journey(gates=states, bins=bins)


@app.get("/gates/{gate_id}/cards", response_model=GateCards)
def gate_cards(gate_id: str, player: Player = Depends(current_player)) -> GateCards:
    gate: Gate | None = GATE_BY_ID.get(gate_id)
    if gate is None:
        raise HTTPException(404, "We could not find that gate.")
    answered = db.answered_card_ids(player.id)
    made = made_cards()
    state = state_of(gate_id, answered, made)
    if state is None:
        raise HTTPException(404, "We could not find that gate.")
    if not state.unlocked:
        raise HTTPException(403, "This gate is not open yet.")
    if gate.kind == "battle" and db.battle_for(player.id, gate.id) is None:
        raise HTTPException(409, "Please start the battle first, so your Sym can make its guesses.")
    todo = [card_out(CARDS[cid]) for cid in made.get(gate.id, gate.card_ids) if cid not in answered]
    if gate.kind == "pattern":
        for c in todo:
            c.bet_sure = pattern_bet(player.id, CARDS[c.id])[1]
    return GateCards(gate=state, cards=todo)


BET_PRIOR = 2  # how many puzzles the crowd's record counts for, next to the player's own record
BET_CROWD_DEFAULT = 0.6  # the share assumed right when no one else has tried a puzzle


def pattern_bet(player_id: str, card: Card) -> tuple[bool, int]:
    """The Sym's bet on one pattern puzzle: will its human get it, and how sure is the Sym, 50 to 100.
    Plain counting: the human's record on every right-or-wrong card outside this gate, pulled toward how other
    players did on this puzzle. It uses nothing from inside the gate, so the bet is fixed before the gate starts."""
    mine = [r for r in db.responses_for(player_id) if r.is_correct is not None and CARDS.get(r.card_id) is not None
            and CARDS[r.card_id].gate_id != card.gate_id]
    others = db.picks_by_others(card.id, player_id)
    crowd = sum(1 for c in others if c in card.winning) / len(others) if others else BET_CROWD_DEFAULT
    p = (sum(1 for r in mine if r.is_correct) + BET_PRIOR * crowd) / (len(mine) + BET_PRIOR)
    return p >= 0.5, round(max(p, 1 - p) * 100)


def sure_record(player_id: str, card_ids: list[str] | None = None) -> list[SureRow]:
    """How often the player was right at each level of sureness they tapped: 3 sure, 2 think so, 1 a guess.
    With card_ids it covers those cards only (one gate); without, every gate the player has played."""
    rows = [r for r in db.responses_for(player_id) if r.sure is not None and r.is_correct is not None
            and (card_ids is None or r.card_id in card_ids)]
    return [SureRow(level=level, right=sum(1 for r in rows if r.sure == level and r.is_correct),
                    total=sum(1 for r in rows if r.sure == level)) for level in (3, 2, 1)]


@app.post("/battles", response_model=BattleStarted)
async def start_battle(body: BattleStart, request: Request, player: Player = Depends(current_player)) -> BattleStarted:
    """The Sym commits its predictions before the player sees a single card. Idempotent per gate."""
    rate_limit(request, "battle", 6)
    gate = GATE_BY_ID.get(body.gate_id)
    if gate is None or gate.kind != "battle":
        raise HTTPException(404, "We could not find that battle.")
    answered = db.answered_card_ids(player.id)
    if not next(g for g in gate_state(answered) if g.id == gate.id).unlocked:
        raise HTTPException(403, "This gate is not open yet.")
    battle = db.battle_for(player.id, gate.id)
    if battle is None:
        twin_kind, predictions, baseline = await agents.predict_battle(player.id, gate.card_ids)
        rows = [(cid, predictions[cid][0], predictions[cid][1], baseline[cid], predictions[cid][2]) for cid in gate.card_ids]
        battle = db.create_battle(player.id, gate.id, gate.deck, twin_kind, rows)
    sure = {r.card_id: round(r.confidence * 100) for r in db.predictions_for(battle.id)}
    return BattleStarted(gate_id=gate.id, n=battle.n, twin_kind=battle.twin_kind, sure=sure)


@app.post("/battles/{gate_id}/learn", response_model=LearnOut)
async def learn_from_battle(gate_id: str, request: Request, player: Player = Depends(current_player)) -> LearnOut:
    """The Sym learns from a finished battle. Its picks stop being held back and become proof. If it guessed any
    wrong, the Profiler reads the misses and rewrites the beliefs that failed. Code then records what changed.
    Runs once for a battle; after that it returns the same lessons."""
    rate_limit(request, "battle", 6)
    gate = GATE_BY_ID.get(gate_id)
    if gate is None or gate.kind != "battle":
        raise HTTPException(404, "We could not find that battle.")
    if not battle_result(player, gate).complete:
        raise HTTPException(409, "Please finish the battle first.")
    battle = db.battle_for(player.id, gate.id)
    rows = db.predictions_for(battle.id)
    missed = [r for r in rows if r.actual and r.predicted != r.actual]
    saved = db.lessons_for(battle.id)
    if not saved:
        db.release_picks(player.id, [r.card_id for r in rows])
        before = {t.topic: t.statement for t in db.tendencies_for(player.id)}
        drafts: list[tuple[str, str, str, str]] = []
        if missed:
            await agents.profile_player(player.id, [
                {"card": CARDS[r.card_id].prompt, "twin_guessed": choice_label(CARDS[r.card_id], r.predicted),
                 "person_picked": choice_label(CARDS[r.card_id], r.actual), "twin_was_sure": round(r.confidence, 2),
                 "tendency_leaned_on": r.because} for r in missed])
            after = {t.topic: t.statement for t in db.tendencies_for(player.id)}
            drafts += [("changed", topic, before[topic], text_) for topic, text_ in after.items() if topic in before and before[topic] != text_]
            drafts += [("new", topic, "", text_) for topic, text_ in after.items() if topic not in before]
            drafts += [("dropped", topic, text_, "") for topic, text_ in before.items() if topic not in after]
            if not drafts:  # no model, or it changed nothing: the picks still count from now on, and code says so
                drafts = [("count", CARDS[r.card_id].prompt, f"I guessed: {choice_label(CARDS[r.card_id], r.predicted)}",
                           f"You picked: {choice_label(CARDS[r.card_id], r.actual)}. I count that pick from now on.") for r in missed[:5]]
        else:
            drafts = [("held", "Every guess was right", "", "My beliefs held, so I kept them. Your picks in this battle now count as proof for them.")]
        saved = db.add_lessons(player.id, battle.id, drafts)
    return LearnOut(twin_kind=battle.twin_kind, misses=len(missed), picks_added=len(rows),
                    lessons=[LessonOut(kind=x.kind, topic=x.topic, before=x.before, after=x.after) for x in saved])


@app.get("/battles/{gate_id}", response_model=BattleResult)
def get_battle(gate_id: str, player: Player = Depends(current_player)) -> BattleResult:
    gate = GATE_BY_ID.get(gate_id)
    if gate is None or gate.kind != "battle":
        raise HTTPException(404, "We could not find that battle.")
    return battle_result(player, gate)


@app.post("/responses", response_model=ResponseOut)
def respond(body: ResponseIn, request: Request, background: BackgroundTasks,
            player: Player = Depends(current_player)) -> ResponseOut:
    rate_limit(request, "respond", 240)
    card = CARDS.get(body.card_id)
    if card is None:
        raise HTTPException(404, "We could not find that card.")
    if body.choice not in {o.id for o in card.options}:
        raise HTTPException(422, "That is not one of the choices.")
    answered = db.answered_card_ids(player.id)
    if card.id in answered:
        raise HTTPException(409, "You already answered this card. Answers cannot be changed.")
    made = made_cards()
    before = state_of(card.gate_id, answered, made)
    if before is None or not before.unlocked or card.id not in made.get(card.gate_id, [card.id]):
        raise HTTPException(403, "This gate is not open yet.")
    gate = GATE_BY_ID[card.gate_id]
    battle = db.battle_for(player.id, gate.id) if gate.kind == "battle" else None
    if gate.kind == "battle" and battle is None:
        raise HTTPException(409, "Please start the battle first, so your Sym can make its guesses.")

    is_correct, points = score(card, body.choice)
    bet = pattern_bet(player.id, card) if gate.kind == "pattern" else None  # worked out before this pick is stored
    after = gate_state(answered | {card.id})
    level = gates_done(after) + 1
    updated = db.record_response(player.id, card.id, body.choice, is_correct, body.response_ms, points, level,
                                 held_out=gate.kind == "battle", sure=body.sure if is_correct is not None else None)
    if updated is None:
        raise HTTPException(409, "You already answered this card. Answers cannot be changed.")
    gate_after = state_of(card.gate_id, answered | {card.id}, made) or before
    complete = gate_after.done == gate_after.total
    out = ResponseOut(is_correct=is_correct, points_earned=points, points=updated.points, level=updated.level,
                      gate_complete=complete)

    if battle is not None:
        revealed = db.reveal_prediction(battle.id, card.id, body.choice)
        if revealed is not None:
            out.twin_choice = choice_label(card, revealed.predicted)
            out.twin_match = revealed.predicted is not None and revealed.predicted == body.choice
            out.twin_sure, out.twin_because = round(revealed.confidence * 100), revealed.because
            out.crowd_match = revealed.baseline == body.choice
    if gate.kind == "pattern":  # the same puzzle, played by everyone: how the others did on it
        others = db.picks_by_others(card.id, player.id)
        out.others_right, out.others_total = sum(1 for c in others if c in card.winning), len(others)
        if bet is not None:
            out.twin_bet, out.twin_bet_sure = bet
        # the pick is stored and cannot be changed, so the right square may now be shown on the board
        out.right_choice = card.board.answer if card.board is not None else None
    if body.sure is not None and is_correct is not None:
        out.sure_record = sure_record(player.id)  # every gate so far
        out.sure_gate = sure_record(player.id, made.get(gate.id, gate.card_ids))  # this gate, this run
    if battle is None and complete and gate.kind in RIGHT_KINDS:
        ids = made.get(gate.id, gate.card_ids)
        mine = {r.card_id: r for r in db.responses_for(player.id)}
        correct = sum(1 for cid in ids if mine.get(cid) is not None and mine[cid].is_correct)
        counts = [len(CARDS[cid].options) for cid in ids]
        out.cert_need, out.cert_right = verifier.cert_need(counts), correct
        if verifier.earns_skill_cert(correct, counts):
            topic = "Strategy" if gate.kind == "strategy" else "Patterns" if gate.kind == "pattern" else SKILL_BY_ID[gate.deck]["cert"]
            out.cert = cert_out(db.issue_cert(player.id, "skill", topic, gate.difficulty or "", correct / len(ids), None, len(ids)))
            # money flows to progress: passing a skill step is paid from the growth fund, as far as the fund reaches.
            # The player is paid first. The creator who built the step gets a royalty, but not for passing its own step.
            fund = max(0, db.fund_balance(market.FUND_START, market.STEP_KIND))
            bonus = min(market.STEP_BONUS, fund)
            maker = db.step_owner(gate.id) if gate.id in made else None
            royalty = min(market.STEP_ROYALTY, fund - bonus) if maker is not None and maker != player.id else 0
            if bonus > 0 and db.pay_step_bonus(player.id, f"step:{gate.id}", market.STEP_KIND, bonus,
                                               maker if royalty > 0 else None, royalty):
                out.bonus = bonus
                if gate.id in made:  # an agency that sponsors this skill pays the player and the creator too
                    out.sponsored = db.pay_sponsor(gate.deck, player.id, maker if maker != player.id else None,
                                                   market.SPONSOR_PLAYER, market.SPONSOR_MAKER)
    elif complete and gate.kind in ("preference", "feedback"):
        # The twin learns in the background, so it is ready before the next battle.
        background.add_task(agents.profile_player, player.id)
    return out


@app.get("/me/activity", response_model=Activity)
def activity(player: Player = Depends(current_player)) -> Activity:
    items = []
    for r in db.responses_for(player.id):
        card = CARDS.get(r.card_id)
        if card is None:
            continue
        items.append(ActivityItem(card_id=r.card_id, gate=GATE_BY_ID[card.gate_id].title, prompt=card.prompt,
                                  choice=choice_label(card, r.choice), is_correct=r.is_correct,
                                  response_ms=r.response_ms, created_at=db.iso(r.created_at)))
    return Activity(
        nickname=player.nickname, points=player.points, level=player.level, joined=db.iso(player.created_at),
        responses=items,
        tendencies=[TendencyOut(topic=t.topic, statement=t.statement, evidence_count=t.evidence_count, scope=t.scope)
                    for t in db.tendencies_for(player.id)],
        battles=[BattleSummary(topic=b.topic, n=b.n, twin_kind=b.twin_kind, twin_matches=b.twin_matches,
                               baseline_matches=b.baseline_matches, created_at=db.iso(b.created_at))
                 for b in db.battles_for(player.id)],
        certs=[cert_out(c) for c in db.certs_for(player.id)],
        told=told_out(db.self_report_for(player.id)) if db.self_report_for(player.id) else None,
        work=work_items(player.id), credits=db.credits_for(player.id), days_played=db.days_played(player.id),
    )


def told_out(row: SelfReport | None) -> Told:
    if row is None:
        return Told()
    return Told(ei=row.ei, sn=row.sn, tf=row.tf, jp=row.jp, analyse=row.analyse, organise=row.organise,
                explore=row.explore, connect=row.connect, sign=row.sign, animal=row.animal)


MIRROR_NOTE = (
    "Simple code counts your own taps. It does not use AI. We wrote these cards ourselves. This is not the "
    "official test of any publisher. A letter stays open until at least 3 picks point the same way."
)


def skill_refs(group_id: str) -> list[SkillRef]:
    return [SkillRef(id=sid, name=SKILL_BY_ID[sid]["name"]) for sid in mirror_rules.INFO[group_id].get("skills", [])]


def gates_feeding(group_id: str) -> list[str]:
    """Titles of the gates that have a card offering one of this area's traits. Many gates feed one area."""
    traits = set(mirror_rules.INFO[group_id]["traits"])
    out: list[str] = []
    for g in GATES:
        if g.title not in out and any(o.trait in traits for cid in g.card_ids for o in CARDS[cid].options):
            out.append(g.title)
    return out


def build_mirror(player: Player) -> Mirror:
    picks = [(r.card_id, r.choice) for r in db.responses_for(player.id)]
    told = told_out(db.self_report_for(player.id))
    axes = mirror_rules.read_axes(picks)
    styles = mirror_rules.read_styles(picks)
    top = mirror_rules.top_styles(styles)
    told_letters = [told.ei, told.sn, told.tf, told.jp]
    bands = {"analyse": told.analyse, "organise": told.organise, "explore": told.explore, "connect": told.connect}
    return Mirror(
        suggested_type=mirror_rules.suggested_type(axes),
        axes=[AxisOut(name=a.name, first=a.first, second=a.second, first_picks=a.first_picks,
                      second_picks=a.second_picks, suggested=a.letter, told=t,
                      verdict=mirror_rules.axis_verdict(a.letter, t)) for a, t in zip(axes, told_letters)],
        styles=[StyleOut(key=s.key, name=s.name, picks=s.picks, chances=s.chances, share=round(s.share, 3),
                         told=bands[s.key], about=mirror_rules.INFO[s.key]["about"],
                         strength=mirror_rules.INFO[s.key]["strength"], watch=mirror_rules.INFO[s.key]["watch"],
                         skills=skill_refs(s.key)) for s in styles],
        top_styles=top,
        faculties=[FacultyOut(key=f.key, name=f.name, region=mirror_rules.REGION[f.key], picks=f.picks,
                              chances=f.chances, share=round(f.share, 3), about=mirror_rules.INFO[f.key]["about"],
                              fact=mirror_rules.INFO[f.key]["fact"], skills=skill_refs(f.key),
                              feeds=gates_feeding(f.key))
                   for f in mirror_rules.read_styles(picks, mirror_rules.FACULTIES)],
        paths=[PathOut(kind=kind, style=s.name, skills=skill_refs(s.key)) for kind, s in mirror_rules.growth_paths(styles)],
        style_verdict=mirror_rules.style_verdict(top, bands), told=told,
        picks_used=sum(a.first_picks + a.second_picks for a in axes), note=MIRROR_NOTE,
    )


@app.get("/jobs", response_model=Jobs)
def jobs(player: Player = Depends(current_player)) -> Jobs:
    earned = db.earnings_for(player.id)
    asked = [e for e in earned if e.kind != market.STEP_KIND]
    return Jobs(jobs=job_list(player, cleared_gates(player)), credits=db.credits_for(player.id), certified=is_certified(player),
                data_income=db.data_income_on(player.id), data_credits=sum(e.credits for e in asked), data_answers=len(asked),
                one_to_one=db.one_to_one_on(player.id), meet_price=market.MEET_PRICE, meets=db.times_met(player.id),
                auto_per_day=db.auto_limit(player.id), auto_choices=list(market.AUTO_CHOICES),
                earned_credits=sum(w.credits for w in db.work_for(player.id)) + sum(e.credits for e in earned),
                upkeep_credits=round(sum(u.cost_usd for u in db.usage_rows() if u.player_id == player.id) / market.USD_PER_CREDIT, 2))


_auto_busy: set[str] = set()


async def auto_work(player: Player) -> None:
    """The Sym starts open jobs by itself, up to the number its owner chose for one day. It only answers: nothing
    is paid until the owner checks the answer, the same as for a job the owner sent it to."""
    limit = db.auto_limit(player.id)
    if limit <= 0 or player.id in _auto_busy or db.work_started_today(player.id) >= limit:
        return
    _auto_busy.add(player.id)
    try:
        for j in job_list(player, cleared_gates(player)):
            job = work_rules.JOB_BY_ID.get(j.id)
            if j.state != "open" or job is None:
                continue
            if db.work_started_today(player.id) >= limit:
                break
            twin_kind, answer, reason = await agents.do_job(player.id, job)
            db.start_work(player.id, job.id, twin_kind, answer, reason)
    finally:
        _auto_busy.discard(player.id)


@app.post("/me/auto", response_model=Jobs)
def set_auto(body: AutoIn, player: Player = Depends(current_player)) -> Jobs:
    """Choose how many jobs the Sym may start by itself each day. 0 turns it off."""
    if body.per_day not in market.AUTO_CHOICES:
        raise HTTPException(422, "Please choose from the list.")
    db.set_auto(player.id, body.per_day)
    return jobs(player)


@app.post("/me/one-to-one", response_model=Jobs)
def set_one_to_one(body: OneToOneIn, player: Player = Depends(current_player)) -> Jobs:
    """Opt in or out of one to one meetings: a seat may pay a royalty to see this Sym's nickname and its answers."""
    db.set_one_to_one(player.id, body.on)
    return jobs(player)


@app.post("/me/consent", response_model=Jobs)
def set_consent(body: ConsentIn, player: Player = Depends(current_player)) -> Jobs:
    """Opt in or out of data income: agencies may ask this Sym batch questions and see counts only."""
    db.set_data_income(player.id, body.data_income)
    return jobs(player)


# ---------- the agency seat ----------

LIFE_SECONDS = 15  # how often one BOT Sym does one thing while the server is awake
BOT_FACTS_SECONDS = 1200  # a free Sym changes slowly; the server refreshes these in the background, so no visitor waits
SEAT_BOTS_SECONDS = 120
_seat_bots: dict[bool, tuple[float, dict[str, list[dict]]]] = {}
_bot_facts: dict[str, tuple[float, market.TwinFacts]] = {}


def twin_facts(player_id: str, sample: bool) -> market.TwinFacts:
    # a free Sym changes slowly, and there are many of them: what is known about one is kept for a short while
    if sample:
        kept = _bot_facts.get(player_id)
        if kept and time.monotonic() - kept[0] < BOT_FACTS_SECONDS:
            return kept[1]
        facts = _twin_facts(player_id, True)
        _bot_facts[player_id] = (time.monotonic(), facts)
        return facts
    return _twin_facts(player_id, False)


def _twin_facts(player_id: str, sample: bool) -> market.TwinFacts:
    picks = [(r.card_id, r.choice) for r in db.responses_for(player_id)]
    counts = db.trait_counts(player_id, include_held_out=True)
    top = mirror_rules.top_styles(mirror_rules.read_styles(picks))
    return market.TwinFacts(player_id=player_id, sample=sample, picks=sum(counts.values()),
                            # a certificate vouches for a twin with a living owner: a free twin does not carry one
                            certified=not sample and any(c.kind == "twin" for c in db.certs_for(player_id)),
                            leading_style=top[0] if top else None, trait_counts=counts,
                            topics=frozenset(topic_id(t.topic) for t in db.tendencies_for(player_id)))


def market_twins() -> list[market.TwinFacts]:
    """Every Sym a group question may reach: the free Syms, and the Syms of players who chose to earn."""
    return [twin_facts(pid, True) for pid in db.free_twin_ids()] + [twin_facts(pid, False) for pid in db.opted_in_player_ids()]


def campaign_out(c) -> CampaignOut:
    q = market.QUESTION_BY_ID[c.question_id]
    counts = json.loads(c.counts)
    total = sum(counts.values()) or 1
    first = math.ceil(market.tier_base(c.sample_twins, c.twins - c.sample_twins, c.pay, c.depth))
    return CampaignOut(kind=q.kind, question=q.question, audience=market.AUDIENCE_NAME.get(c.audience, c.audience), group=c.audience,
                       depth=market.TIER_NAME.get(c.depth, c.depth),
                       pay=c.pay, twins=c.twins, sample_twins=c.sample_twins, spent=c.spent, total=round(c.spent + db.share_of(c.spent), 2), extra=max(0, c.spent - first),
                       split=[SplitRow(label=o.label, count=counts.get(o.id, 0), share=round(counts.get(o.id, 0) / total, 3))
                              for o in q.card.options],
                       created_at=db.iso(c.created_at))


def agency_out(player: Player) -> Agency:
    org = db.org_for(player.id, "agency")
    base = Agency(exists=org is not None, platform_share=db.PLATFORM_SHARE, min_twins=market.MIN_TWINS, pay_choices=list(market.PAY_CHOICES))
    if org is None:
        return base
    base.name, base.budget = org.name, db.wallet_balance(player.id, "agency")
    base.questions = [QuestionOut(id=q.id, kind=q.kind, question=q.question,
                                  options=[OptionOut(id=o.id, label=o.label) for o in q.card.options]) for q in market.QUESTIONS]
    base.audiences = [AudienceOut(id=a, name=n) for a, n in market.AUDIENCES]
    base.campaigns = [campaign_out(c) for c in db.campaigns_for(org.id)]
    base.price_times = {a: market.price_times(db.earlier_asks(org.id, a)) for a, _ in market.AUDIENCES}
    base.tiers = [TierOut(id=key, name=name, times=times) for key, name, times in market.TIERS]
    base.free_share, base.meet_price = market.FREE_SHARE, market.MEET_PRICE
    twins = market_twins()
    for a, _ in market.AUDIENCES:
        base.reach[a] = {}
        for key, _name, _times in market.TIERS:
            asked = [t for t in twins if market.matches(t, a) and market.in_tier(t, key)]
            free = sum(1 for t in asked if t.sample)
            base.reach[a][key] = [free, len(asked) - free] if len(asked) >= market.MIN_TWINS else None
    base.fund = db.fund_balance(market.FUND_START, market.STEP_KIND)
    base.job_pay_choices, base.job_seats = list(market.JOB_PAY_CHOICES), list(market.JOB_SEATS)
    base.hold_times = round(work_rules.CERT_MULTIPLIER * (1 + market.REACH_SHARE), 2)
    base.sponsor_budgets = list(market.SPONSOR_BUDGETS)
    base.sponsor_skills = [AudienceOut(id=sid, name=SKILL_BY_ID[sid]["name"]) for sid in sorted({p.deck for p in PACKS})]
    base.sponsorships = [SponsorOut(skill=SKILL_BY_ID[b.skill]["name"], budget=b.budget, spent=b.spent, passes=b.passes, open=not b.closed)
                         for b in db.sponsorships_for(org.id)]
    base.postings = [post_out(p) for p in db.postings_for(org.id)]
    return base


def post_out(p) -> PostOut:
    """A posted job as its agency sees it: counts only. The made-up sample Syms answer too, and are counted apart."""
    q = market.QUESTION_BY_ID[p.question_id]
    job = work_rules.JOB_BY_ID.get(p.id)
    choices, n_samples = collective(job) if job else ([], 0)
    total = len(choices) or 1
    taken = db.seats_taken(p.id)
    return PostOut(id=p.id, kind=q.kind, question=q.question, pay=p.pay, seats=p.seats, taken=taken,
                   checked=len(choices) - n_samples, held=p.hold * p.seats, open=not p.closed and taken < p.seats,
                   sample_twins=n_samples,
                   split=[SplitRow(label=label, count=count, share=round(count / total, 3))
                          for _, label, count in (work_rules.split(job, choices) if job else [])],
                   created_at=db.iso(p.created_at))


def brief_out(b, made: dict[str, list[str]]) -> BriefOut:
    counts = json.loads(b.counts)
    audience = market.AUDIENCE_NAME.get(b.audience, "")
    if b.kind in ("skill", "build"):
        pack = PACK_BY_STEP.get((b.topic, counts.get("step", "")))
        live = pack is not None and pack.id in made
        if b.kind == "build":
            title = f"Skill step built: {counts.get('step', '')}"
            note = (f"Players can play it now. You earn {market.STEP_ROYALTY} credits each time another player passes it."
                    if live else "This step is closed.")
        else:
            title = f"Skill step claimed: {counts.get('step', '')}"
            note = "You built this step. Players can play it." if live else "This step is yours. Tap Build my step to pick its cards."
        return BriefOut(kind=b.kind, title=title, audience=SKILL_BY_ID[b.topic]["name"],
                        twins=0, sample_twins=0, spent=b.spent, fee=b.spent, total=b.spent, created_at=db.iso(b.created_at), note=note)
    total = sum(counts.values()) or 1
    if b.kind == "survey":
        q = market.QUESTION_BY_ID[b.topic]
        title, rows = q.question, [(o.id, o.label) for o in q.card.options]
    else:
        title, rows = f"Test: {SKILL_BY_ID[b.topic]['name']}", list(market.BANDS)
    return BriefOut(kind=b.kind, title=title, audience=audience, twins=b.twins, sample_twins=b.sample_twins, spent=b.spent,
                    fee=market.CREW_FEE, total=round(b.spent + db.share_of(b.spent - market.CREW_FEE), 2), created_at=db.iso(b.created_at),
                    split=[SplitRow(label=label, count=counts.get(key, 0), share=round(counts.get(key, 0) / total, 3)) for key, label in rows])


def needs_out(made: dict[str, list[str]]) -> list[NeedOut]:
    """What agencies are paying for, by skill, as one sum for each skill. No agency is named."""
    left: dict[str, int] = {}
    for b in db.open_sponsorships():
        left[b.skill] = left.get(b.skill, 0) + b.budget - b.spent
    built = {p.deck for p in PACKS if p.id in made}
    return [NeedOut(skill=sid, name=SKILL_BY_ID[sid]["name"], left=n, built=sid in built) for sid, n in left.items() if n > 0]


EMERGE_MIN = 2  # agencies that must want two skills together before the pair is shown to creators


def skills_of_question(question_id: str) -> set[str]:
    """The skills a market question touches: those whose areas share a trait with one of its options."""
    q = market.QUESTION_BY_ID.get(question_id)
    traits = {o.trait for o in q.card.options if o.trait} if q else set()
    return {s["id"] for s in ONTOLOGY["skills"] if market.skill_traits(s["id"]) & traits}


def demand(made: dict[str, list[str]]) -> tuple[list[WantedOut], list[PairOut]]:
    """What agencies are asking about, by skill, from everything they did: questions, jobs and skills they back.
    Then the pairs of skills that at least EMERGE_MIN agencies want together: a new need that emerges from use and
    that no one listed by hand. Counts of agencies only; no agency is named. Plain counting, no model.
    (Letting new groupings emerge from what is asked for together follows VoiceMem: docs/SOURCES.md.)"""
    by_org: dict[str, set[str]] = {}
    for c in db.all_campaigns():
        by_org.setdefault(c.org_id, set()).update(skills_of_question(c.question_id))
    for p in db.all_postings():
        by_org.setdefault(p.org_id, set()).update(skills_of_question(p.question_id))
    for b in db.open_sponsorships():
        by_org.setdefault(b.org_id, set()).add(b.skill)
    built = {p.deck for p in PACKS if p.id in made}
    wanted = []
    for s in ONTOLOGY["skills"]:
        n = sum(1 for skills in by_org.values() if s["id"] in skills)
        if n:
            wanted.append(WantedOut(skill=s["id"], name=s["name"], agencies=n, built=s["id"] in built,
                                    waiting=sum(1 for step in s["steps"] if not step.get("gate") and PACK_BY_STEP.get((s["id"], step["name"])) is not None
                                                and PACK_BY_STEP[(s["id"], step["name"])].id not in made)))
    pairs: dict[tuple[str, str], int] = {}
    for skills in by_org.values():
        ordered = sorted(skills)
        for i, a in enumerate(ordered):
            for b in ordered[i + 1:]:
                pairs[(a, b)] = pairs.get((a, b), 0) + 1
    emerging = [PairOut(a=SKILL_BY_ID[a]["name"], b=SKILL_BY_ID[b]["name"], agencies=n)
                for (a, b), n in sorted(pairs.items(), key=lambda kv: -kv[1]) if n >= EMERGE_MIN][:5]
    return sorted(wanted, key=lambda w: -w.agencies), emerging


def stand_on(skill_id: str, crowd: list[market.TwinFacts]) -> dict[str, int]:
    """How many Syms are strong in, partway through or new to one skill. Counts only; nothing for a small crowd."""
    if len(crowd) < market.MIN_TWINS:
        return {}
    traits = market.skill_traits(skill_id)
    bands = [market.band(t, traits) for t in crowd]
    return {key: sum(1 for b in bands if b == key) for key, _ in market.BANDS}


def creator_out(player: Player) -> CreatorSeat:
    org = db.org_for(player.id, "creator")
    if org is None:
        return CreatorSeat(exists=False)
    briefs = db.briefs_for(org.id)
    mine = {(b.topic, json.loads(b.counts).get("step", "")) for b in briefs if b.kind == "skill"}
    taken = {(b.topic, json.loads(b.counts).get("step", "")) for b in db.skill_claims()}
    made = made_cards()
    income = db.maker_income(player.id)
    skills_out, packs_out, made_out = [], [], []
    everyone = market_twins()
    crowd = [t for t in everyone if market.matches(t, "all")]
    sizes = {a: sum(1 for t in everyone if market.matches(t, a)) for a, _ in market.AUDIENCES}
    for skill in ONTOLOGY["skills"]:
        names = [st["name"] for st in skill["steps"] if not st.get("gate")]
        skills_out.append(SkillPick(
            id=skill["id"], name=skill["name"], about=skill["about"],
            claimed=[n for n in names if (skill["id"], n) in mine],
            waiting=[n for n in names if (skill["id"], n) in PACK_BY_STEP and (skill["id"], n) not in taken],
            later=[n for n in names if (skill["id"], n) not in PACK_BY_STEP],
            **stand_on(skill["id"], crowd)))
        for n in names:
            pack = PACK_BY_STEP.get((skill["id"], n))
            if pack is None or (skill["id"], n) not in mine:
                continue
            if pack.id in made:
                passes, earned = income.get(f"step:{pack.id}", (0, 0.0))
                made_out.append(MadeOut(skill=skill["name"], step=n, cards=len(made[pack.id]), passes=passes, earned=earned))
            else:
                # the cards to tap from. The right answers stay on the server.
                packs_out.append(PackOut(id=pack.id, skill=skill["name"], step=n,
                                         cards=[PackCard(id=cid, prompt=CARDS[cid].prompt, options=[o.label for o in CARDS[cid].options])
                                                for cid in pack.card_ids]))
    return CreatorSeat(
        exists=True, name=org.name, budget=db.wallet_balance(player.id, "creator"), min_twins=market.MIN_TWINS, platform_share=db.PLATFORM_SHARE,
        pay=market.CREATOR_PAY, crew_fee=market.CREW_FEE, claim_fee=market.CLAIM_FEE,
        step_cards=market.STEP_CARDS, step_royalty=market.STEP_ROYALTY, packs=packs_out, made=made_out,
        needs=needs_out(made), wanted=demand(made)[0], emerging=demand(made)[1], reach_earned=db.came_in(player.id, "creator", "reach"),
        sponsor_earned=db.came_in(player.id, "creator", "sponsor"),
        reach={a: n if n >= market.MIN_TWINS else 0 for a, n in sizes.items()},
        questions=[QuestionOut(id=q.id, kind=q.kind, question=q.question,
                               options=[OptionOut(id=o.id, label=o.label) for o in q.card.options]) for q in market.QUESTIONS],
        audiences=[AudienceOut(id=a, name=n) for a, n in market.AUDIENCES], skills=skills_out,
        briefs=[brief_out(b, made) for b in briefs])


SHORT = "This wallet does not hold enough credits. Add play credits on My Money. Nothing was charged."


@app.get("/creator", response_model=CreatorSeat)
def get_creator(player: Player = Depends(current_player)) -> CreatorSeat:
    return creator_out(player)


@app.post("/creator/briefs", response_model=CreatorSeat)
def run_brief(body: BriefIn, request: Request, player: Player = Depends(current_player)) -> CreatorSeat:
    """Send the creator's crew on one job, chosen by taps from fixed lists: a survey (one fixed question to a group),
    a test (where a group stands on a skill) or a claim on a waiting skill step. Counts only come back."""
    rate_limit(request, "campaign", 20)
    org = db.org_for(player.id, "creator")
    if org is None:
        raise HTTPException(404, "Please open a creator seat first.")
    if body.kind == "skill":
        skill = SKILL_BY_ID.get(body.topic)
        mine = next((sk for sk in creator_out(player).skills if sk.id == body.topic), None)
        if skill is None or mine is None or not mine.waiting:
            raise HTTPException(409, "No step of that skill is waiting for a maker.")
        done = db.run_brief(org.id, "skill", body.topic, "", 0, 0, json.dumps({"step": mine.waiting[0]}), [], 0, market.CLAIM_FEE, "claim")
        if done is None:
            raise HTTPException(409, SHORT)
        return creator_out(player)
    known = market.QUESTION_BY_ID.get(body.topic) if body.kind == "survey" else SKILL_BY_ID.get(body.topic)
    if known is None or body.audience not in market.AUDIENCE_NAME:
        raise HTTPException(422, "Please choose from the lists.")
    twins = [twin_facts(pid, True) for pid in db.free_twin_ids()] + [twin_facts(pid, False) for pid in db.opted_in_player_ids()]
    asked = [t for t in twins if market.matches(t, body.audience)]
    if len(asked) < market.MIN_TWINS:
        raise HTTPException(409, f"Fewer than {market.MIN_TWINS} Syms match that group. No one was asked, and nothing was charged.")
    if body.kind == "survey":
        counts = market.tally(known, [market.answer(known, t) for t in asked])
    else:
        traits = market.skill_traits(body.topic)
        bands = [market.band(t, traits) for t in asked]
        counts = {key: sum(1 for b in bands if b == key) for key, _ in market.BANDS}
    samples = sum(1 for t in asked if t.sample)
    done = db.run_brief(org.id, body.kind, body.topic, body.audience, len(asked), samples, json.dumps(counts),
                        [(t.player_id, market.CREATOR_PAY) for t in asked if not t.sample], samples * market.CREATOR_PAY, market.CREW_FEE)
    if done is None:
        raise HTTPException(409, SHORT)
    return creator_out(player)


@app.post("/creator/steps", response_model=CreatorSeat)
def build_step(body: StepIn, request: Request, player: Player = Depends(current_player)) -> CreatorSeat:
    """Build a claimed skill step. The creator taps cards from the pack we wrote, and the step opens for players.
    Nothing is typed, so a creator cannot put its own words in front of a player."""
    rate_limit(request, "campaign", 20)
    org = db.org_for(player.id, "creator")
    if org is None:
        raise HTTPException(404, "Please open a creator seat first.")
    pack = next((p for p in PACKS if p.id == body.pack), None)
    if pack is None:
        raise HTTPException(422, "Please choose from the lists.")
    if not any(b.kind == "skill" and b.topic == pack.deck and json.loads(b.counts).get("step") == pack.title
               for b in db.briefs_for(org.id)):
        raise HTTPException(409, "Please claim this step first.")
    if pack.id in made_cards():
        raise HTTPException(409, "This step is already built.")
    picked = set(body.cards)
    if len(body.cards) != market.STEP_CARDS or len(picked) != market.STEP_CARDS or not picked <= set(pack.card_ids):
        raise HTTPException(422, f"Please tap {market.STEP_CARDS} cards from the list.")
    done = db.publish_step(org.id, pack.id, pack.deck, json.dumps({"step": pack.title}),
                           json.dumps([cid for cid in pack.card_ids if cid in picked]), market.CREW_FEE)
    if done is None:
        raise HTTPException(409, SHORT)
    return creator_out(player)


# ---------- one to one: a seat pays a large royalty to meet one twin and see who it is ----------

def met_out(m) -> MetTwin:
    sample = m.player_id in set(db.sample_player_ids())
    if not sample and not db.one_to_one_on(m.player_id):
        return MetTwin(open=False, paid=m.paid, at=db.iso(m.created_at))
    facts = twin_facts(m.player_id, sample)
    areas = sorted(mirror_rules.read_styles([(r.card_id, r.choice) for r in db.responses_for(m.player_id)], mirror_rules.FACULTIES),
                   key=lambda f: f.share, reverse=True)
    return MetTwin(open=True, nickname=db.nickname_of(m.player_id), sample=sample, strongest=[f.name for f in areas[:2]],
                   answers=[MetAnswer(question=q.question,
                                      answer=next(o.label for o in q.card.options if o.id == market.answer(q, facts)))
                            for q in market.QUESTIONS],
                   paid=m.paid, at=db.iso(m.created_at))


def seat_org(seat: str, player: Player):
    if seat not in ("agency", "creator"):
        raise HTTPException(404, "We could not find that seat.")
    org = db.org_for(player.id, seat)
    if org is None:
        raise HTTPException(404, "Please open that seat first.")
    return org


def meets_out(seat: str, player: Player) -> Meets:
    org = seat_org(seat, player)
    return Meets(price=market.MEET_PRICE, fee=market.CREW_FEE, budget=db.wallet_balance(player.id, seat),
                 audiences=[AudienceOut(id=a, name=n) for a, n in market.AUDIENCES],
                 met=[met_out(m) for m in db.meets_for(org.id)])


@app.get("/seats/{seat}/meets", response_model=Meets)
def get_meets(seat: str, player: Player = Depends(current_player)) -> Meets:
    return meets_out(seat, player)


@app.post("/seats/{seat}/meet", response_model=Meets)
def meet(seat: str, body: MeetIn, request: Request, player: Player = Depends(current_player)) -> Meets:
    """Meet one Sym from a group one to one. Only a Sym whose owner turned one to one on (or a made-up sample
    Sym) can be met. Code picks the Sym; the seat cannot name one. The owner receives the whole royalty."""
    rate_limit(request, "campaign", 20)
    org = seat_org(seat, player)
    if body.audience not in market.AUDIENCE_NAME:
        raise HTTPException(422, "Please choose a group from the list.")
    met = {m.player_id for m in db.meets_for(org.id)}
    pool = [twin_facts(pid, True) for pid in db.sample_player_ids()] + \
           [twin_facts(pid, False) for pid in db.one_to_one_player_ids() if pid != player.id]
    pool = [t for t in pool if t.player_id not in met and market.matches(t, body.audience)]
    if not pool:
        raise HTTPException(409, "No Sym in that group is open to a one to one meeting right now. Nothing was charged.")
    pick = max(pool, key=lambda t: (not t.sample, t.picks))  # a real twin before a sample; then the one that knows most
    if db.meet_twin(org.id, pick.player_id, pick.sample, market.MEET_PRICE, market.CREW_FEE) is None:
        raise HTTPException(409, SHORT)
    return meets_out(seat, player)


@app.post("/creator", response_model=CreatorSeat)
def open_creator(body: OrgCreate, request: Request, player: Player = Depends(current_player)) -> CreatorSeat:
    """Open the creator seat under a made-up name. Like an agency, it starts with play credits, so the first
    thing a new creator does is send its crew, not look for a way to pay."""
    rate_limit(request, "org", 10)
    db.create_org(player.id, "creator", body.name.strip(), market.START_BUDGET)
    return creator_out(player)


@app.get("/agency", response_model=Agency)
def get_agency(player: Player = Depends(current_player)) -> Agency:
    return agency_out(player)


@app.post("/agency", response_model=Agency)
def open_agency(body: OrgCreate, request: Request, player: Player = Depends(current_player)) -> Agency:
    rate_limit(request, "org", 10)
    db.create_org(player.id, "agency", body.name.strip(), market.START_BUDGET)
    return agency_out(player)


@app.post("/agency/campaigns", response_model=Agency)
def run_campaign(body: CampaignIn, request: Request, player: Player = Depends(current_player)) -> Agency:
    """Ask every matching Sym one question. Counts only come back, and only for MIN_TWINS Syms or more."""
    rate_limit(request, "campaign", 20)
    org = db.org_for(player.id, "agency")
    if org is None:
        raise HTTPException(404, "Please open an agency first.")
    q = market.QUESTION_BY_ID.get(body.question_id)
    if q is None or body.audience not in market.AUDIENCE_NAME or body.pay not in market.PAY_CHOICES:
        raise HTTPException(422, "Please choose a question, who to ask and a price from the lists.")
    asked = [t for t in market_twins() if market.matches(t, body.audience) and market.in_tier(t, body.depth)]
    if len(asked) < market.MIN_TWINS:
        raise HTTPException(409, f"Fewer than {market.MIN_TWINS} Syms match that group. No one was asked, and nothing was charged.")
    free = sum(1 for t in asked if t.sample)
    member_pay = body.pay * market.TIER_TIMES[body.depth]  # deeper tiers pay each member more
    # asking the same group again costs more each time; the twins are paid the same and the extra goes to the growth fund
    cost, _extra = market.tier_cost(free, len(asked) - free, body.pay, body.depth, db.earlier_asks(org.id, body.audience))
    if db.wallet_balance(player.id, "agency") < cost:
        raise HTTPException(409, "You do not have enough credits to ask that many Syms at that price.")
    counts = market.tally(q, [market.answer(q, t) for t in asked])
    done = db.run_campaign(org.id, q.id, q.kind, body.audience, body.pay, len(asked), free,
                           json.dumps(counts),
                           [(t.player_id, market.twin_pay(member_pay, db.days_since_active(t.player_id)))
                            for t in asked if not t.sample], cost, depth=body.depth,
                           to_samples=free * body.pay * market.FREE_SHARE)
    if done is None:
        raise HTTPException(409, "You do not have enough credits to ask that many Syms at that price.")
    return agency_out(player)


def job_hold(pay: int) -> int:
    """Credits held for one place on a posted job: double pay in case the Sym has a certificate, plus the share
    that goes to creators whose skill steps the Sym's owner passed."""
    return round(pay * work_rules.CERT_MULTIPLIER * (1 + market.REACH_SHARE))


@app.post("/agency/sponsor", response_model=Agency)
def sponsor_skill(body: SponsorIn, request: Request, player: Player = Depends(current_player)) -> Agency:
    """Put credits behind a skill. Each time a player passes a built step of that skill, part goes to the player
    and part to the creator who built it. This is how an agency asks creators to build what it needs."""
    rate_limit(request, "campaign", 20)
    org = db.org_for(player.id, "agency")
    if org is None:
        raise HTTPException(404, "Please open an agency first.")
    if body.skill not in {p.deck for p in PACKS} or body.budget not in market.SPONSOR_BUDGETS:
        raise HTTPException(422, "Please choose a skill and an amount from the lists.")
    if db.sponsor(org.id, body.skill, body.budget) is None:
        raise HTTPException(409, SHORT)
    return agency_out(player)


@app.post("/agency/jobs", response_model=Agency)
def post_job(body: PostIn, request: Request, player: Player = Depends(current_player)) -> Agency:
    """Post a job for Syms to take: one of the fixed questions, a pay and a number of places, all by taps.
    The pay for every place is held now. Each Sym answers with the Worker agent and its owner checks the answer."""
    rate_limit(request, "campaign", 20)
    org = db.org_for(player.id, "agency")
    if org is None:
        raise HTTPException(404, "Please open an agency first.")
    if (body.question_id not in market.QUESTION_BY_ID or body.pay not in market.JOB_PAY_CHOICES
            or body.seats not in market.JOB_SEATS):
        raise HTTPException(422, "Please choose a question, a pay and a number of Syms from the lists.")
    posted = db.post_job(org.id, body.question_id, body.pay, body.seats, job_hold(body.pay))
    if posted is None:
        raise HTTPException(409, SHORT)
    register_posting(posted)
    return agency_out(player)


@app.post("/agency/jobs/{job_id}/close", response_model=Agency)
def close_job(job_id: str, player: Player = Depends(current_player)) -> Agency:
    """Close a posted job to new Syms. The credits held for places no Sym took come back."""
    org = db.org_for(player.id, "agency")
    if org is None or not db.close_posting(org.id, job_id):
        raise HTTPException(404, "We could not find that open job.")
    return agency_out(player)


@app.post("/jobs/{job_id}/run", response_model=JobOut)
async def run_job(job_id: str, request: Request, player: Player = Depends(current_player)) -> JobOut:
    """Send the Sym to do a job. It answers once; the human reviews before anything is paid."""
    rate_limit(request, "job", 6)
    job = work_rules.JOB_BY_ID.get(job_id)
    if job is None:
        raise HTTPException(404, "We could not find that job.")
    cleared = cleared_gates(player)
    if cleared < job.after_gates:
        raise HTTPException(403, "This job is not open yet.")
    row = db.work_on(player.id, job.id)
    posted = db.posting(job.id)
    if row is None and posted is not None:
        mine = db.org_for(player.id, "agency")
        if mine is not None and posted.org_id == mine.id:
            raise HTTPException(403, "Your own Sym cannot take a job you posted.")
        if posted.closed or db.seats_taken(job.id) >= posted.seats:
            raise HTTPException(409, "This job is full.")
    if row is None:
        twin_kind, answer, reason = await agents.do_job(player.id, job)
        row = db.start_work(player.id, job.id, twin_kind, answer, reason)
    return job_out(job, row, cleared)


@app.post("/jobs/{job_id}/review", response_model=JobResult)
def review_job(job_id: str, body: ReviewIn, request: Request, background: BackgroundTasks,
               player: Player = Depends(current_player)) -> JobResult:
    """The human confirms or corrects the Sym. Code pays the credits and adds the answer to the collective."""
    rate_limit(request, "review", 30)
    job = work_rules.JOB_BY_ID.get(job_id)
    row = db.work_on(player.id, job_id) if job else None
    if job is None or row is None:
        raise HTTPException(404, "Your Sym has not done this job yet.")
    if row.verdict is not None:
        raise HTTPException(409, "You already checked this job.")
    if body.verdict == "approved":
        if row.answer is None:
            raise HTTPException(422, "Your Sym did not know. Please choose the answer yourself.")
        final = row.answer
    else:
        if body.choice not in {o.id for o in job.card.options} or body.choice == row.answer:
            raise HTTPException(422, "Please choose the answer that is really yours.")
        final = body.choice
    certified = is_certified(player)
    earned = work_rules.pay_for(job, body.verdict, certified)
    posted = db.posting(job.id)  # an agency's job is paid from the credits the agency put on hold
    payer = db.posting_owner(job.id) if posted else None
    makers = [m for m in db.makers_reached(player.id) if m != payer] if payer else []
    row = db.review_work(player.id, job.id, body.verdict, final, earned, payer, posted.hold if posted else 0,
                         makers, int(earned * db.MILLI * market.REACH_SHARE) if makers else 0)
    if row is None:
        raise HTTPException(409, "You already checked this job.")
    background.add_task(agents.profile_player, player.id)  # a reviewed job is a pick: the twin learns from it

    choices, n_samples = collective(job)
    total = len(choices) or 1
    # An insight certificate: something new was learned. Either the twin was wrong and its human taught it, or the
    # human's confirmed answer is not the one most twins give. Plain counting decides, as for every certificate.
    others = list(choices)
    if final in others:
        others.remove(final)
    insight = None
    if others:
        crowd = max(job.card.options, key=lambda o: sum(1 for c in others if c == o.id)).id
        level = "My Sym learned this from me" if body.verdict == "corrected" else "I see this differently from most" if final != crowd else ""
        if level:
            insight = cert_out(db.issue_cert(player.id, "insight", job.question[:120], level,
                                             sum(1 for c in others if c == final) / len(others), None, len(others)))
    split = [SplitRow(label=label, count=count, share=round(count / total, 3), yours=oid == final)
             for oid, label, count in work_rules.split(job, choices)]
    note = ("Your Sym answered the way you would. It received the full pay." if body.verdict == "approved"
            else "Your Sym was wrong, so it received a small pay. It has learned from your answer.")
    if body.verdict == "approved" and certified:
        note = "Your Sym answered the way you would. It has a certificate, so it received double pay."
    return JobResult(job=job_out(job, row, cleared_gates(player)), credits_earned=earned, credits=db.credits_for(player.id),
                     certified=certified, taps=len(db.responses_for(player.id)), beliefs=len(db.tendencies_for(player.id)),
                     twins=len(choices), sample_twins=n_samples, split=split, note=note, insight=insight)


FACULTY_GROUPS = tuple((f["id"], f["name"], frozenset(f["traits"])) for f in ONTOLOGY["faculties"])
# gates that are a step in a skill tree: finishing one pays the growth bonus
STEP_GATES = frozenset(step["gate"] for skill in ONTOLOGY["skills"] for step in skill["steps"] if step.get("gate"))


def sphere_at(picks: list[tuple[str, str]]) -> list[Vertical]:
    """The player's sphere after exactly these picks: one area per faculty."""
    states = {g.id: g for g in gate_state({cid for cid, _ in picks})}
    built = step_state({cid for cid, _ in picks})

    def at(skill_id: str, step: dict) -> GateOut | None:
        """The gate behind a skill step: one on the journey, or one a creator built."""
        pack = PACK_BY_STEP.get((skill_id, step["name"]))
        return states.get(step.get("gate", "")) or (built.get(pack.id) if pack else None)

    read = {s.key: s for s in mirror_rules.read_styles(picks, FACULTY_GROUPS)}
    played = {cid for cid, _ in picks}
    out = []
    for f in ONTOLOGY["faculties"]:
        # the open gate that would add the most to this area: plain counting, so the player can plan their time
        traits = frozenset(f["traits"])
        best, adds = None, 0
        for gate in GATES:
            st = states.get(gate.id)
            if st is None or not st.unlocked or st.done == st.total:
                continue
            n = sum(1 for cid in gate.card_ids
                    if cid not in played and cid in CARDS and any(o.trait in traits for o in CARDS[cid].options))
            if n > adds:
                best, adds = gate, n
        done = total = 0
        for sid in f.get("skills", []):
            for step in SKILL_BY_ID[sid]["steps"]:
                total += 1
                g = at(sid, step)
                done += 1 if g is not None and g.done == g.total else 0
        level = round(min(1.0, read[f["id"]].chances / mirror_rules.FULL_EVIDENCE), 3)
        count = read[f["id"]].picks
        # two different numbers, each named for what it counts. The first is the one the Brain tab shows.
        seen = read[f["id"]].chances
        details = ([f"You picked this area {count} of the {seen} times you could: {round(100 * count / seen)} percent. The Brain tab shows the same number."]
                   if seen else ["No card for this area has come up yet."])
        details.append(f"I have seen {min(seen, mirror_rules.FULL_EVIDENCE)} of the {mirror_rules.FULL_EVIDENCE} cards I need here, "
                       f"so this part of me is {round(level * 100)} percent drawn.")
        if total:
            details.append(f"{done} of {total} skill steps {'is' if done == 1 else 'are'} done.")
        if best is None:
            # no picks left to give here: the next open skill step in this area is the best use of time
            for sid in f.get("skills", []):
                for step in SKILL_BY_ID[sid]["steps"]:
                    st = at(sid, step)
                    if best is None and st is not None and st.unlocked and st.done < st.total:
                        best = GATE_BY_ID[st.id]
            if best is not None:
                details.append(f"Next skill step: {best.title}. Finishing it pays {market.STEP_BONUS} credits.")
        elif best is not None:
            details.append(f"Best next gate: {best.title}. It has {adds} {'card' if adds == 1 else 'cards'} for this area.")
            if best.id in STEP_GATES:
                details.append(f"It is a skill step. Finishing it pays {market.STEP_BONUS} credits.")
        if best is None:
            details.append("No open gate feeds this area right now. More gates will come later.")
        out.append(Vertical(key=f["id"], name=f["name"], color=f["color"], level=level,
                            earned=round(done / total, 3) if total else 0.0, picks=count,
                            steps_done=done, steps_total=total, details=details,
                            next_gate=best.id if best is not None else None,
                            next_title=best.title if best is not None else None))
    return out


def frame(label: str, at, areas: list[Vertical]) -> SphereFrame:
    return SphereFrame(label=label, at=db.iso(at), levels=[a.level for a in areas], earned=[a.earned for a in areas])


JOURNEY_IDS = frozenset(g.id for g in GATES)


def plan_for(player: Player) -> list[PlanOption]:
    """Where the player's next few minutes count most, best first. Plain counting: work that is waiting, work that
    is open, a skill step, the least filled area, the next gate, and earning while away."""
    answered = db.answered_card_ids(player.id)
    states = gate_state(answered)
    nxt = next((g for g in states if g.unlocked and g.done < g.total), None)
    jobs_now = job_list(player, gates_done(states))
    out: list[PlanOption] = []
    waiting = [j for j in jobs_now if j.state == "review"]
    if waiting:
        out.append(PlanOption(id="work", title="Check your Sym's answer", why="Your Sym did the job. It is paid only after you check.",
                              credits=sum(j.pay for j in waiting), minutes=1))
    open_jobs = sorted((j for j in jobs_now if j.state == "open"), key=lambda j: -j.pay)
    if open_jobs:
        out.append(PlanOption(id="work", title="Send your Sym to work",
                              why=f"{len(open_jobs)} {'job is' if len(open_jobs) == 1 else 'jobs are'} open. The best one pays {open_jobs[0].pay} credits.",
                              credits=open_jobs[0].pay, minutes=1))
    step = next((g for g in step_state(answered).values() if g.unlocked and g.done < g.total), None)
    if step is not None:
        out.append(PlanOption(id=f"gate:{step.id}", title=f"Extra step: {step.title}",
                              why=f"An extra skill step a creator built. It is not one of the {len(GATES)} gates of the journey. Passing it gives a certificate.",
                              credits=market.STEP_BONUS, minutes=2))
    areas = [a for a in sphere_at([(r.card_id, r.choice) for r in db.responses_for(player.id)]) if a.next_gate]
    if areas:
        weak = min(areas, key=lambda a: a.level)
        # a step a creator built is extra: it is not one of the journey's gates, and the words say so
        out.append(PlanOption(id=f"gate:{weak.next_gate}", title=f"{'Play' if weak.next_gate in JOURNEY_IDS else 'Extra step'}: {weak.next_title}",
                              why=f"It adds cards to {weak.name}, the part of me that is least drawn ({round(weak.level * 100)} percent).",
                              credits=market.STEP_BONUS if weak.next_gate in STEP_GATES else 0, minutes=2))
    if nxt is not None and all(o.id != f"gate:{nxt.id}" for o in out):
        out.append(PlanOption(id=f"gate:{nxt.id}", title=f"Play: {nxt.title}", why="The next gate on your journey. It opens the one after it.",
                              credits=market.STEP_BONUS if nxt.id in STEP_GATES else 0, minutes=2))
    for gate in retry_gates(player)[:1]:
        out.insert(0, PlanOption(id=f"retry:{gate.id}", title=f"Try again: {gate.title}",
                                 why="You missed the certificate. The wait is over, so you may try once more.", credits=market.STEP_BONUS, minutes=2))
    if len(db.throws_for(player.id)) < rps.ARENA_MIN:
        out.append(PlanOption(id="arena", title="Play rock, paper, scissors with your Sym",
                              why=f"It learns how you throw. After {rps.ARENA_MIN} rounds it plays the other Syms.", credits=0, minutes=1))
    if not db.data_income_on(player.id):
        out.append(PlanOption(id="work", title="Let your Sym earn while you are away",
                              why="Agencies and creators pay it for group questions. You choose this on the work screen.", credits=0, minutes=1))
    return out[:4]


@app.get("/me/plan", response_model=Plan)
def my_plan(player: Player = Depends(current_player)) -> Plan:
    return Plan(options=plan_for(player))


def rps_out(player: Player, just: RpsRound | None = None) -> RpsOut:
    rows = db.throws_for(player.id)
    mine = [t.mine for t in rows]
    results = [rps.outcome(t.mine, t.twin) for t in rows]
    out = RpsOut(rounds=len(rows), you=results.count("you"), twin=results.count("twin"), draws=results.count("draw"), round=just,
                 last=[RpsRound(mine=t.mine, twin=t.twin, outcome=rps.outcome(t.mine, t.twin)) for t in rows[-12:]][::-1],
                 tells=[RpsTell(after=a, then=b, n=n, of=of) for a, b, n, of in rps.tells(mine)[:3]],
                 need=max(0, rps.ARENA_MIN - len(rows)))
    if out.need == 0:
        # the league: every twin throws the way its owner throws. Other twins have a number, never a name.
        others = [(pid, thrown, False) for pid, thrown in db.throw_histories(rps.ARENA_MIN).items() if pid != player.id]
        others += [(pid, rps.sample_history(i), True) for i, pid in enumerate(db.sample_player_ids())]
        table = []
        for i, (pid, thrown, free) in enumerate(sorted(others, key=lambda o: o[0])):
            won, lost, drawn = rps.match(mine, thrown, f"{player.id}:{pid}:{len(mine)}:{len(thrown)}")
            table.append(RpsRival(name=f"Sym {i + 1}", free=free, won=won, lost=lost, drawn=drawn))
        beaten = sum(1 for r in table if r.won > r.lost)
        out.rivals = sorted(table, key=lambda r: r.won - r.lost, reverse=True)
        out.rank, out.of = len(table) - beaten + 1, len(table) + 1
    return out


RETRY_HOURS = 12  # how long after a missed certificate a skill gate may be tried again


def retry_gates(player: Player) -> list[Gate]:
    """Skill gates the player finished without the certificate, long enough ago to try again. A certificate that
    was earned is never put at risk: only a miss can be retried."""
    mine = {r.card_id: r for r in db.responses_for(player.id)}
    made = made_cards()
    out = []
    for gate in GATES + PACKS:
        if gate.kind not in RIGHT_KINDS:
            continue
        ids = made.get(gate.id, gate.card_ids) if gate in PACKS else gate.card_ids
        if gate in PACKS and gate.id not in made:
            continue
        rows = [mine[cid] for cid in ids if cid in mine]
        if len(rows) < len(ids) or not rows:
            continue
        need = verifier.cert_need([len(CARDS[cid].options) for cid in ids])
        newest = max(r.created_at for r in rows)
        if need is not None and sum(1 for r in rows if r.is_correct) < need and datetime.now(timezone.utc) - (newest if newest.tzinfo else newest.replace(tzinfo=timezone.utc)) >= timedelta(hours=RETRY_HOURS):
            out.append(gate)
    return out


@app.post("/gates/{gate_id}/retry", response_model=RetryOut)
def retry_gate(gate_id: str, request: Request, player: Player = Depends(current_player)) -> RetryOut:
    """Open a skill gate again after a missed certificate and a cool-off. The earlier answers to it are removed."""
    rate_limit(request, "retry", 10)
    gate = next((g for g in retry_gates(player) if g.id == gate_id), None)
    if gate is None:
        raise HTTPException(409, f"This gate cannot be tried again yet. A missed certificate can be tried again after {RETRY_HOURS} hours.")
    ids = made_cards().get(gate.id, gate.card_ids)
    return RetryOut(gate_id=gate.id, cards=db.clear_answers(player.id, ids))


JUDGE_MIN = 3  # answers at one level of sureness before the game says anything about it
JUDGE_TRUST = 0.8  # right this often when sure: the feeling can be trusted


@app.get("/me/judgment", response_model=Judgment)
def my_judgment(player: Player = Depends(current_player)) -> Judgment:
    """How sure the caller said they were against how often they were right. Their own rows only. Plain counting."""
    marked = [r for r in db.responses_for(player.id) if r.is_correct is not None]
    taps = [r for r in marked if r.sure is not None]
    unsaid = len(marked) - len(taps)  # right-or-wrong answers given with no "how sure" tap: they are in no row
    rows = sure_record(player.id)
    sure, guess = rows[0], rows[2]
    if not taps:
        says = "You have not told me how sure you are yet. Play a pattern or a strategy gate, and tap how sure you feel."
    elif sure.total < JUDGE_MIN:
        says = f"I have {len(taps)} answers where you said how sure you were. I need {JUDGE_MIN} where you said Sure before I can judge that feeling."
    elif sure.right / sure.total >= JUDGE_TRUST:
        says = f"Over all your gates, when you say you are sure, you are right {sure.right} of {sure.total} times. That feeling can be trusted."
    else:
        says = (f"Over all your gates, when you say you are sure, you are right {sure.right} of {sure.total} times. "
                "You feel sure more often than you are right. Check once more before a choice that is hard to undo.")
    if guess.total >= JUDGE_MIN and guess.right / guess.total >= 0.6:
        says += f" When you call it a guess, you are still right {guess.right} of {guess.total} times. You know more than you think."
    if taps and unsaid:  # say what the numbers cover, so they are not read as every answer
        says += f" Only answers with a how sure tap are counted: {len(taps)} of {len(marked)}."
    return Judgment(rows=rows, says=says, unsaid=unsaid,
                    taps=[SureTap(at=db.iso(r.created_at), level=r.sure, right=bool(r.is_correct)) for r in taps[-40:]])


@app.get("/rps", response_model=RpsOut)
def rps_state(player: Player = Depends(current_player)) -> RpsOut:
    """Rock, paper, scissors against the caller's own Sym: the score, the habits the Sym has found, and the league."""
    return rps_out(player)


@app.post("/rps", response_model=RpsOut)
def rps_play(body: RpsIn, request: Request, player: Player = Depends(current_player)) -> RpsOut:
    """One round. The Sym's throw is worked out from the earlier throws alone, then both are stored together."""
    rate_limit(request, "rps", 120)
    twin, why = rps.twin_throw([t.mine for t in db.throws_for(player.id)])
    db.add_throw(player.id, body.throw, twin)
    return rps_out(player, RpsRound(mine=body.throw, twin=twin, outcome=rps.outcome(body.throw, twin), why=why))


@app.get("/world", response_model=World)
def world(request: Request) -> World:
    """The whole game as totals, open to anyone: how many Syms, seats and certificates there are, and how many
    credits moved between kinds of wallet. It names no player, no seat and no answer."""
    rate_limit(request, "world", 60)
    return World(**db.world())


def how_long_ago(at: datetime) -> str:
    """A time said loosely on purpose, so a happening cannot be matched to a person by its minute."""
    at = at if at.tzinfo else at.replace(tzinfo=timezone.utc)
    gone = datetime.now(timezone.utc) - at
    if gone < timedelta(hours=1):
        return "now"
    if gone < timedelta(days=1):
        return "today"
    return "week" if gone < timedelta(days=7) else "earlier"


@app.get("/commons", response_model=Commons)
def commons(player: Player = Depends(current_player)) -> Commons:
    """The first screen after signing in: who is here, what everyone knows together, and the last few things that
    happened. Counts and nameless lines only. A time is said loosely (now, today, this week, earlier)."""
    facts = db.commons(player.id)
    seen = [Happening(who=who, text=words, when=how_long_ago(at), mine=mine) for at, who, words, mine in facts.pop("happenings")]
    return Commons(nickname=player.nickname, happenings=seen, **facts)


def times(n: int, one: str, many: str | None = None) -> str:
    return f"{n} {one if n == 1 else many or one + 's'}"


@app.get("/me/ripple", response_model=Ripple)
def ripple(player: Player = Depends(current_player)) -> Ripple:
    """What this person set moving: how their taps as a player reach their own agency and studio, how those seats
    reach people, and what came back. Plain counting from their own rows. Other people appear only as counts."""
    c = db.ripple(player.id)
    links: list[RippleLink] = []

    def add(src: str, dst: str, n: int, text: str, credits: float = 0) -> None:
        if n > 0:
            links.append(RippleLink(src=src, dst=dst, n=n, credits=round(credits, 2), text=text))

    add("player", "everyone", c["taps"], f"You gave {times(c['taps'], 'tap')}. Each one is now part of what everyone knows together.")
    add("player", "everyone", c["checks"], f"You checked your Sym {times(c['checks'], 'time')}. Those answers can be trusted now.", c["check_credits"])
    add("everyone", "player", c["asks"], f"Other agencies asked your Sym {times(c['asks'], 'time')} and paid you.", c["ask_credits"])
    add("player", "everyone", c["steps_passed"], f"You passed {times(c['steps_passed'], 'skill step')} that someone built. Passing pays you, and it pays the creator who built it.")
    add("agency", "player", c["own_asks"], f"Your own agency asked your own Sym {times(c['own_asks'], 'time')}. Your taps as a player became answers on your agency desk.", c["own_ask_credits"])
    add("player", "creator", c["own_steps_passed"], f"You passed {times(c['own_steps_passed'], 'step')} that your own studio built. It grew your Sym. A studio is not paid by its own owner.")
    add("agency", "everyone", c["campaigns"], f"Your agency asked {times(c['campaigns'], 'question')}. They reached {times(c['syms_asked'], 'Sym')}" + (f" and paid {times(c['people_paid'], 'other person', 'other people')}." if c["people_paid"] else ". No other real person was among them yet."), c["paid_credits"])
    add("agency", "everyone", c["jobs"], f"Your agency posted {times(c['jobs'], 'job')}. " + (f"People checked {times(c['jobs_checked'], 'answer')} for you and were paid." if c["jobs_checked"] else "No one has checked an answer yet."), c["job_credits"])
    add("agency", "everyone", c["backed_passes"], f"A skill your agency backed was passed {times(c['backed_passes'], 'time')}. Your credits paid the player and the creator.", c["backed_credits"])
    add("creator", "everyone", c["built"], f"Your studio built {times(c['built'], 'skill step')}. Anyone can play them.")
    add("everyone", "creator", c["passes"], f"Other people passed your steps {times(c['passes'], 'time')}. Each pass paid your studio.", c["royalties"])
    add("creator", "everyone", c["crew_asked"], f"Your studio asked {times(c['crew_asked'], 'Sym')} what to build next.")
    return Ripple(agency=c["agency"], creator=c["creator"], links=links)


def money_facts(player: Player) -> dict:
    """The player's own wallet as the Guide may read it: totals and the last few moves, by kind. No names."""
    purse = next(w for w in wallets_out(player).wallets if w.seat == "player")
    by_kind: dict[str, float] = {}
    for m in purse.lines:
        by_kind[m.label] = round(by_kind.get(m.label, 0) + m.credits, 2)
    return {"holds": purse.balance, "came_in": purse.came_in, "went_out": purse.went_out, "totals_by_kind": by_kind,
            "last_moves": [{"what": m.label, "credits": m.credits} for m in purse.lines[:5]],
            "note": "Credits are play money. A token fee is what the Sym's AI runs cost."}


def situation_for(player: Player) -> tuple[dict, dict[str, str], str, str | None, CardOut | None]:
    """Where a player stands, as the Guide may read it, with no identity in it. Also the moves the Sym may offer
    (id to label), a plain answer for when no model is available, the move that goes with it, and one card the
    Sym can ask right now. All of it is plain counting."""
    answered = db.answered_card_ids(player.id)
    states = gate_state(answered)
    nxt = next((g for g in states if g.unlocked and g.done < g.total), None)
    areas = sphere_at([(r.card_id, r.choice) for r in db.responses_for(player.id)])
    jobs = job_list(player, gates_done(states))
    open_jobs = [j for j in jobs if j.state == "open"]
    waiting = sum(1 for j in jobs if j.state == "review")
    moves: dict[str, str] = {}
    moves["work"] = "Go to work"  # the work screen also holds the two choices that let a twin earn while away
    if nxt is not None:
        moves[f"gate:{nxt.id}"] = f"Play: {nxt.title}"
    steps = [g for g in step_state(answered).values() if g.unlocked and g.done < g.total]
    for g in steps[:2]:
        moves[f"gate:{g.id}"] = f"Play: {g.title}"
    for a in sorted(areas, key=lambda v: v.level):
        if a.next_gate and len(moves) < 5:
            moves.setdefault(f"gate:{a.next_gate}", f"Play: {a.next_title}")
    plan = plan_for(player)
    for option in plan:
        moves.setdefault(option.id, option.title)
    moves["mine"] = "See what my Sym knows"
    moves["money"] = "See my money"
    weakest = min(areas, key=lambda v: v.level) if areas else None
    situation = {
        "beliefs": [t.statement for t in db.tendencies_for(player.id)][:8],
        "progress": {"gates_done": gates_done(states), "gates_total": len(states), "next_gate": nxt.title if nxt else None},
        "areas": [{"name": a.name, "percent_filled": round(a.level * 100), "skill_steps_done": a.steps_done} for a in areas],
        "weakest_area": weakest.name if weakest else None,
        "work": {"open_jobs": [{"asked_by": j.requester_kind, "pays": j.pay} for j in open_jobs], "waiting_for_your_check": waiting,
                 "credits": db.credits_for(player.id), "has_certificate": is_certified(player)},
        "ways_to_earn": {
            "jobs": "Send the Sym to a job, then check its answer. The work screen lists them.",
            "data_income_is_on": db.data_income_on(player.id),
            "data_income": "When it is on, agencies and creators may ask the Sym a group question and pay it. It is turned on or off on the work screen.",
            "one_to_one_is_on": db.one_to_one_on(player.id),
            "one_to_one": f"When it is on, a seat may pay {market.MEET_PRICE} credits to meet the Sym. It is turned on or off on the work screen.",
            "skill_steps_open_now": [g.title for g in steps],
            "skill_step_bonus": f"Passing a skill step pays {market.STEP_BONUS} credits from the growth fund.",
        },
        "money": money_facts(player),
        "topics": [t["name"] for t in TOPICS],
        "told_by_person": [{"scope": f.scope, "topic": f.topic, "statement": f.statement} for f in db.facts_for(player.id)],
        "how_sure_and_how_right": {
            "record": [{"said": {3: "sure", 2: "think so", 1: "a guess"}[row.level], "right": row.right, "of": row.total}
                       for row in sure_record(player.id) if row.total],
            "note": "From the pattern puzzles: how often this person was right at each level of sureness they tapped. "
                    "A gap between sure and right is useful to know before a risky choice. Do not give money or health advice.",
        },
        "best_use_of_time_now": [{"move": o.id, "what": o.title, "why": o.why, "can_pay_credits": o.credits} for o in plan],
        "moves": [{"id": mid, "label": label} for mid, label in moves.items()],
    }
    if waiting:
        plain, move = "I finished a job. Please check my answer, so I can be paid.", "work"
    elif open_jobs:
        plain, move = f"A job is open. It pays {open_jobs[0].pay} credits. May I go to work?", "work"
    elif nxt is not None:
        plain, move = f"The next gate is {nxt.title}. Each gate you play helps me know you better.", f"gate:{nxt.id}"
    else:
        plain, move = "You finished every gate. Look at what I know about you.", "mine"
    learn = None
    if nxt is not None and nxt.kind in ("preference", "feedback"):
        todo = next((cid for cid in GATE_BY_ID[nxt.id].card_ids if cid not in answered), None)
        learn = card_out(CARDS[todo]) if todo else None
    return situation, moves, plain, move, learn


@app.post("/twin/ask", response_model=AskOut)
async def ask_twin(body: AskIn, request: Request, player: Player = Depends(current_player)) -> AskOut:
    """Say one line to your Sym. It answers in a sentence or two, offers one move, and may ask one card back.
    The line passes the prompt guard, goes to the Guide agent, and is not stored."""
    rate_limit(request, "ask", 10)
    said, flags = agents.strip_injections(body.text.strip(), source="player_talk", channel="typed")
    if flags:
        agents.append_flags(flags)
    situation, moves, plain, plain_move, learn = situation_for(player)
    kind, say, move, note = ("offline", "", None, None)
    if said.strip() and not flags:
        kind, say, move, note = await agents.talk(player.id, said.strip()[:200], narrow(situation, said), set(moves))
    if kind == "offline":
        say, move = plain, plain_move
    offer = None
    PENDING.pop(player.id, None)
    if note is not None and len(db.facts_for(player.id)) < MAX_FACTS:
        # the fact waits in memory only. It is written to the database if, and only if, the human taps to keep it
        PENDING[player.id] = (time.monotonic(), note)
        offer = FactOut(scope=note[0], topic=note[1], statement=note[2])
    return AskOut(say=say, twin_kind=kind, move=MoveOut(id=move, label=moves[move]) if move in moves else None, learn=learn, offer=offer)


# Narrow first, then send little: plain words in the line decide which parts of the situation the Guide is sent.
# Talking is the twin's main running cost, so sending less is what lets it keep more of what it earns.
# (The idea of choosing the topic before the model sees anything follows VoiceMem: docs/SOURCES.md.)
ROUTES: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (("credit", "money", "earn", "pay", "paid", "cost", "wallet", "spend", "income", "royalt"), ("money", "ways_to_earn", "work")),
    (("job", "work"), ("work", "ways_to_earn")),
    (("know", "belie", "about me", "weak", "grow", "strong", "area", "brain", "learn"), ("beliefs", "areas", "weakest_area", "told_by_person")),
    (("sure", "judg", "confiden", "risk", "decid"), ("how_sure_and_how_right", "beliefs")),
    (("next", "should", "what now", "play", "gate"), ("progress", "weakest_area")),
)
ALWAYS_SENT = ("moves", "best_use_of_time_now", "topics")
WHEN_UNSURE = ("beliefs", "told_by_person", "progress")  # a line that names none of the above is most often about the person


def narrow(situation: dict, said: str) -> dict:
    text = said.lower()
    keep = set(ALWAYS_SENT)
    for words, parts in ROUTES:
        if any(w in text for w in words):
            keep.update(parts)
    if keep == set(ALWAYS_SENT):
        keep.update(WHEN_UNSURE)
    return {k: v for k, v in situation.items() if k in keep}


MAX_FACTS = 30  # facts a player may let their twin keep
OFFER_SECONDS = 600  # how long an offered fact waits for a yes
PENDING: dict[str, tuple[float, tuple[str, str, str]]] = {}  # player id to the one fact their twin last offered


def facts_out(player: Player) -> FactsOut:
    return FactsOut(facts=[FactOut(id=f.id, scope=f.scope, topic=f.topic, statement=f.statement) for f in db.facts_for(player.id)])


@app.get("/twin/facts", response_model=FactsOut)
def my_facts(player: Player = Depends(current_player)) -> FactsOut:
    """What the caller told their Sym and chose to keep. Their own rows only."""
    return facts_out(player)


@app.post("/twin/facts", response_model=FactsOut)
def keep_fact(request: Request, player: Player = Depends(current_player)) -> FactsOut:
    """Keep the fact the Sym just offered. The request carries no text: only a line the server itself offered,
    in the Sym's words and checked by code, can be stored. So nothing typed is ever written."""
    rate_limit(request, "facts", 20)
    waiting = PENDING.pop(player.id, None)
    if waiting is None or time.monotonic() - waiting[0] > OFFER_SECONDS:
        raise HTTPException(409, "There is nothing to keep right now.")
    scope, topic, statement = waiting[1]
    db.add_fact(player.id, scope, topic, statement, MAX_FACTS)
    return facts_out(player)


@app.delete("/twin/facts/{fact_id}", response_model=FactsOut)
def forget_fact(fact_id: str, player: Player = Depends(current_player)) -> FactsOut:
    """Make the Sym forget one fact the caller told it."""
    db.remove_fact(player.id, fact_id)
    return facts_out(player)


CODE_SHOWN = 160  # the newest blocks drawn; the counts cover all of them
CODE_SHARED = 8  # another Sym is compared only once it has answered this many of the same cards (or all of them, if fewer)
FACULTY_COLOR = {f["id"]: f["color"] for f in ONTOLOGY["faculties"]}
# what a creator block was, in plain words, by the kind of brief behind it
CODE_BRIEF = {"survey": "A survey", "test": "A skill test", "skill": "A step claimed", "build": "A step built"}


@app.get("/me/code", response_model=SymCode)
def sym_code(player: Player = Depends(current_player)) -> SymCode:
    """The Sym's code: one block for each thing its person did, oldest first. T is a tap as a player, G is growth
    that was proved, A is an act as an agency, C is an act as a creator. Read from the person's own rows."""
    blocks: list[tuple[datetime, CodeBase]] = []

    def add(at: datetime, letter: str, what: str, area: str = "", **facts) -> None:
        blocks.append((at, CodeBase(letter=letter, area=area, color=FACULTY_COLOR.get(area, ""), what=what, **facts)))

    taps = db.responses_for(player.id)
    mine = {r.card_id: r.choice for r in taps}
    # how this person's picks differ from every other Sym's. A Sym is compared only once it shares enough cards,
    # and nothing is said unless the crowd is at least the minimum size.
    need = min(len(mine), CODE_SHARED)
    crowd = [theirs for theirs in db.picks_on(set(mine), player.id).values() if len(theirs) >= need > 0]
    if len(crowd) < market.MIN_TWINS:
        crowd = []
    agree = [(sum(1 for cid, ch in theirs.items() if mine[cid] == ch), len(theirs)) for theirs in crowd]
    for r in taps:
        card = CARDS.get(r.card_id)
        trait = next((o.trait for o in card.options if o.id == r.choice), None) if card else None
        area = next((fid for fid, _, traits in FACULTY_GROUPS if trait in traits), "")
        gave = [theirs[r.card_id] for theirs in crowd if r.card_id in theirs]
        counted = len(gave) >= market.MIN_TWINS  # under the minimum, no count about the others is given
        same = sum(1 for ch in gave if ch == r.choice)
        gate = GATE_BY_ID.get(card.gate_id) if card else None
        add(r.created_at, "T", "A pick you made", area, apart=counted and same * 2 < len(gave),
            gate=gate.title if gate else "", prompt=card.prompt if card else "",
            picked=choice_label(card, r.choice) if card else "", same=same if counted else 0, of=len(gave) if counted else 0)
    for f in db.facts_for(player.id):
        add(f.created_at, "T", "Something you told me", TOPIC_AREA.get(topic_id(f.topic), ""))
    for b in db.battles_for(player.id):
        add(b.created_at, "G", "A gate finished" if b.twin_matches is not None else "A gate started")
    for c in db.certs_for(player.id):
        add(c.issued_at, "G", "A certificate")
    for w in db.work_for(player.id):
        if w.reviewed_at is not None:
            add(w.reviewed_at, "G", "A job checked")
    agency, studio = db.org_for(player.id, "agency"), db.org_for(player.id, "creator")
    if agency is not None:
        for what, rows in (("A question asked", db.campaigns_for(agency.id)), ("A job posted", db.postings_for(agency.id)),
                           ("A skill backed", db.sponsorships_for(agency.id)), ("A meeting", db.meets_for(agency.id))):
            for row in rows:
                add(row.created_at, "A", what)
    if studio is not None:
        for b in db.briefs_for(studio.id):
            add(b.created_at, "C", CODE_BRIEF.get(b.kind, "A creator act"))
    blocks.sort(key=lambda b: b[0])
    counts = {k: sum(1 for _, b in blocks if b.letter == k) for k in "TGAC"}
    have = {b.area for _, b in blocks if b.area}
    same = sum(1 for hit, of in agree if hit == of)
    near = max(agree, key=lambda a: a[0] / a[1]) if agree else None
    apart = sum(1 for _, b in blocks if b.apart)
    gaps = [f["name"] for f in ONTOLOGY["faculties"] if f["id"] not in have]
    total = len(blocks)
    if total == 0:
        line = "My code is empty. Your first tap writes my first block."
    elif crowd and same == 0:
        line = (f"I am made of {total} blocks. I looked at {len(crowd)} other Syms, and not one has your answers. "
                f"The nearest matches you on {near[0]} of {near[1]}. What is yours alone is what you bring to everyone.")
    elif crowd:
        line = (f"I am made of {total} blocks. {same} of {len(crowd)} other Syms {'has' if same == 1 else 'have'} given the same answers as you so far. "
                "Play one more gate, and I become the only one.")
    elif counts["G"] == 0:
        line = f"I am made of {total} blocks, all from your taps. Nothing is proved yet. Finish a gate, and I write my first G."
    elif counts["A"] == 0 and counts["C"] == 0:
        line = f"I am made of {total} blocks: {counts['T']} taps and {counts['G']} proofs. Open an agency or a studio, and my code gains a new letter."
    elif gaps:
        line = f"I am made of {total} blocks. I have none yet in {gaps[0]}. A gate that feeds it fills that gap."
    else:
        line = f"I am made of {total} blocks, from every seat you have sat in. No other Sym has this code."
    return SymCode(bases=[b for _, b in blocks[-CODE_SHOWN:]],
                   total=total, counts=counts, gaps=gaps, line=line, others=len(crowd), same=same, apart=apart,
                   near=list(near) if near else [])


@app.get("/me/sphere", response_model=Sphere)
def sphere(player: Player = Depends(current_player)) -> Sphere:
    """What the Sym's sphere shows now, and how it looked each time a gate was finished, oldest first."""
    rows = db.responses_for(player.id)
    picks: list[tuple[str, str]] = []
    left = {g.id: len(g.card_ids) for g in GATES}
    left.update({pack_id: len(ids) for pack_id, ids in made_cards().items()})
    history: list[SphereFrame] = []
    joins = 0
    for r in rows:
        card = CARDS.get(r.card_id)
        if card is None:
            continue
        picks.append((r.card_id, r.choice))
        offered = {o.trait for o in card.options if o.trait}
        joins += 1 if sum(1 for _, _, traits in FACULTY_GROUPS if offered & traits) > 1 else 0
        if card.gate_id not in left:
            continue
        left[card.gate_id] -= 1
        if left[card.gate_id] == 0:
            history.append(frame(GATE_BY_ID[card.gate_id].title, r.created_at, sphere_at(picks)))
    hubs = [Hub(area=TOPIC_AREA[topic_id(t.topic)], name=TOPIC_NAME[topic_id(t.topic)]) for t in db.tendencies_for(player.id)]
    hubs += [Hub(area=TOPIC_AREA[topic_id(f.topic)], name=TOPIC_NAME[topic_id(f.topic)], told=True) for f in db.facts_for(player.id)]
    return Sphere(verticals=sphere_at(picks), links=joins, history=history, hubs=hubs[:12])


def seat_groups(player: Player, by_weakest: bool) -> dict[str, list[dict]]:
    """Every Sym a seat may look at (the made-up sample Syms and players who turned data income on), sorted into
    groups: by strongest thinking style for an agency, by the style most in need of growth for a creator."""
    out: dict[str, list[dict]] = {key: [] for key, _, _ in market.GROUPS}
    # the free Syms are many and change slowly: they are read in one query and kept for a short while
    kept = _seat_bots.get(by_weakest)
    if kept and time.monotonic() - kept[0] < SEAT_BOTS_SECONDS:
        out = {key: list(rows) for key, rows in kept[1].items()}
        twins = [(pid, False) for pid in db.opted_in_player_ids()]
        fresh = False
    else:
        twins = [(pid, True) for pid in db.free_twin_ids()] + [(pid, False) for pid in db.opted_in_player_ids()]
        fresh = True
    all_picks = db.picks_of([pid for pid, _ in twins])
    bots: dict[str, list[dict]] = {key: [] for key, _, _ in market.GROUPS}
    for pid, sample in twins:
        picks = all_picks.get(pid, [])
        if len(picks) < market.MIN_PICKS:
            continue
        styles = mirror_rules.read_styles(picks)
        ready = all(st.chances >= mirror_rules.MIN_PICKS for st in styles)
        ranked = sorted(styles, key=lambda st: st.share, reverse=not by_weakest)
        key = ranked[0].key if ready else "forming"
        areas = {f.name: f.share for f in mirror_rules.read_styles(picks, mirror_rules.FACULTIES)}
        since = None if sample else db.days_since_active(pid)
        row = {"sample": sample, "progress": min(1.0, len(picks) / market.FULL_PROGRESS), "areas": areas,
               "active": sample or (since is not None and since <= market.ACTIVE_FULL_DAYS)}
        out[key].append(row)
        if sample:
            bots[key].append(row)
    if fresh:
        _seat_bots[by_weakest] = (time.monotonic(), bots)
    return out


@app.get("/seats/{seat}/sphere", response_model=Sphere)
def seat_sphere(seat: str, player: Player = Depends(current_player)) -> Sphere:
    """The sphere of the agency or creator seat: a tight cluster of points for each group it could reach.
    A group smaller than the minimum is hidden. A point's size is progress, never money."""
    if seat not in ("agency", "creator"):
        raise HTTPException(404, "We could not find that seat.")
    groups = seat_groups(player, by_weakest=seat == "creator")
    org = db.org_for(player.id, "agency") if seat == "agency" else None
    camps = db.campaigns_for(org.id) if org else []
    total = sum(len(v) for v in groups.values()) or 1
    reach: dict[str, float] = {}
    asked: dict[str, int] = {}
    for c in camps:
        for key in market.STYLE_GROUPS + ("forming",):
            if c.audience == key or c.audience in ("all", "certified"):
                asked[key] = asked.get(key, 0) + 1
                reach[key] = reach.get(key, 0.0) + (c.twins if c.audience == key else c.twins * len(groups[key]) / total)
    others = {"agencies": db.other_org_count(player.id, "agency"), "creators": db.other_org_count(player.id, "creator")}

    out = []
    for key, name, color in market.GROUPS:
        if key in others:
            n = others[key]
            out.append(Vertical(key=key, name=name, color=color, level=0.0, earned=0.0, picks=0, steps_done=0, steps_total=0,
                                count=n, dots=[0.6] * min(n, market.MAX_DOTS),
                                details=[f"{n} {'seat is' if n == 1 else 'seats are'} open.", "You cannot connect with them yet. This part of the game is not built."]))
            continue
        members = groups[key]
        label = name if key == "forming" else (f"Needs to grow: {name}" if seat == "creator" else f"Strongest in: {name}")
        if len(members) < market.MIN_TWINS:
            out.append(Vertical(key=key, name=label, color=color, level=0.0, earned=0.0, picks=0, steps_done=0, steps_total=0,
                                count=None, hidden=True, details=[f"Fewer than {market.MIN_TWINS} Syms are in this group, so nothing about it is shown."]))
            continue
        names = list(members[0]["areas"])
        mean = {a: sum(m["areas"][a] for m in members) / len(members) for a in names}
        top = sorted(names, key=lambda a: mean[a], reverse=not (seat == "creator"))[:2]
        samples = sum(1 for m in members if m["sample"])
        details = [
            f"{len(members)} Syms are in this group. {samples} of them are BOT Syms: made up, not people.",
            f"{'Where they need the most help' if seat == 'creator' else 'Where they are strongest'}: {top[0]} and {top[1]}.",
            f"On average they are {round(100 * sum(m['progress'] for m in members) / len(members))} percent of the way through the game.",
            f"{sum(1 for m in members if m['active'])} of them played in the last {market.ACTIVE_FULL_DAYS} days. BOT Syms count as active.",
        ]
        if seat == "agency":
            times = asked.get(key, 0)
            details.append("You have not asked this group yet." if times == 0 else f"You have asked this group {times} {'time' if times == 1 else 'times'}.")
        out.append(Vertical(key=key, name=label, color=color, level=0.0, earned=1.0 if asked.get(key) else 0.0, picks=0,
                            steps_done=0, steps_total=0, count=len(members),
                            dots=[round(m["progress"], 2) for m in members[:market.MAX_DOTS]], details=details))
    return Sphere(verticals=out, links=len(camps), history=[], mode="clusters", balance=market.balance(reach) if seat == "agency" else None)


@app.get("/skills", response_model=Skills)
def skills(player: Player = Depends(current_player)) -> Skills:
    """Every skill tree with the player's place on it. A step with no gate yet is "soon". A step a creator built
    is open to play like any other."""
    answered = db.answered_card_ids(player.id)
    states = {g.id: g for g in gate_state(answered)}
    built = step_state(answered)
    earned = [c for c in db.certs_for(player.id) if c.kind == "skill"]
    trees = []
    for skill in ONTOLOGY["skills"]:
        steps = []
        for step in skill["steps"]:
            pack = PACK_BY_STEP.get((skill["id"], step["name"]))
            g = states.get(step.get("gate", "")) or (built.get(pack.id) if pack else None)
            state = "soon" if g is None else "done" if g.done == g.total else "open" if g.unlocked else "locked"
            steps.append(SkillStepOut(name=step["name"], state=state, gate_id=g.id if g else None,
                                      made=pack is not None and pack.id in built))
        grows = [grp["name"] for grp in ONTOLOGY["styles"] + ONTOLOGY["faculties"] if skill["id"] in grp.get("skills", [])]
        trees.append(SkillTreeOut(id=skill["id"], name=skill["name"], about=skill["about"], grows=grows, steps=steps,
                                  done=sum(1 for s in steps if s.state == "done"),
                                  certs=sum(1 for c in earned if c.topic == skill["cert"])))
    return Skills(trees=trees)


@app.get("/me/mirror", response_model=Mirror)
def get_mirror(player: Player = Depends(current_player)) -> Mirror:
    return build_mirror(player)


@app.post("/me/told", response_model=Mirror)
def tell(body: Told, request: Request, player: Player = Depends(current_player)) -> Mirror:
    """Opt-in: what the player says about themselves. It is stored, shown back and never sent to a model."""
    rate_limit(request, "told", 60)
    db.save_self_report(player.id, body.model_dump())
    return build_mirror(player)


@app.delete("/me/told", response_model=Mirror)
def untell(player: Player = Depends(current_player)) -> Mirror:
    db.delete_self_report(player.id)
    return build_mirror(player)


AGENT_LABEL = {"profiler": "Learning about you", "twin": "Sym battles", "worker": "Jobs"}


@app.get("/me/money", response_model=Money)
def money(player: Player = Depends(current_player)) -> Money:
    """Where every credit came from and what the Sym cost to run. The caller's own rows only."""
    lines: list[MoneyLine] = []
    work_total = 0
    for w in db.work_for(player.id):
        job = work_rules.JOB_BY_ID.get(w.job_id)
        if job is None or w.verdict is None:
            continue
        work_total += w.credits
        lines.append(MoneyLine(source="Work", label=f"{job.requester_kind}: {job.requester}",
                               detail="Approved" if w.verdict == "approved" else "You corrected it: small pay",
                               credits=w.credits, at=db.iso(w.reviewed_at or w.created_at)))
    data_total = growth_total = 0
    for e in db.earnings_for(player.id):
        if e.kind == market.STEP_KIND:
            growth_total += e.credits
            step = GATE_BY_ID.get((e.campaign_id or "").removeprefix("step:"))
            lines.append(MoneyLine(source="Growth", label=f"Skill step passed: {step.title if step else 'a skill step'}",
                                   detail="A bonus from the growth fund", credits=e.credits, at=db.iso(e.created_at)))
            continue
        data_total += e.credits
        if e.kind == "One to one":
            lines.append(MoneyLine(source="Data", label="A seat met your Sym one to one",
                                   detail="A royalty. It saw your nickname and your Sym's answers.", credits=e.credits, at=db.iso(e.created_at)))
            continue
        asker = "a creator" if e.kind == "Creator" else "an agency"
        lines.append(MoneyLine(source="Data", label=f"{'A' if e.kind == 'Creator' else e.kind} question from {asker}",
                               detail="One question to many Syms. Only totals were seen.",
                               credits=e.credits, at=db.iso(e.created_at)))
    lines.sort(key=lambda m: m.at, reverse=True)

    by_agent: dict[str, AgentCost] = {}
    for u in db.usage_rows():
        if u.player_id != player.id:
            continue
        a = by_agent.setdefault(u.agent, AgentCost(agent=AGENT_LABEL.get(u.agent, u.agent), runs=0, usd=0.0))
        a.runs += 1
        a.usd = round(a.usd + u.cost_usd, 6)

    agency = None
    org = db.org_for(player.id, "agency")
    if org is not None:
        camps = db.campaigns_for(org.id)
        agency = AgencyMoney(
            name=org.name, started_with=market.START_BUDGET, spent=sum(c.spent for c in camps), left=db.wallet_balance(player.id, "agency"),
            twins_asked=sum(c.twins for c in camps),
            lines=[MoneyLine(source="Agency", label=market.QUESTION_BY_ID[c.question_id].question,
                             detail=f"{market.AUDIENCE_NAME.get(c.audience, c.audience)}, {market.TIER_NAME.get(c.depth, c.depth).lower()}: {c.twins} Syms",
                             credits=-c.spent, at=db.iso(c.created_at)) for c in camps],
        )
    return Money(earned=work_total + data_total + growth_total, work_credits=work_total, data_credits=data_total,
                 growth_credits=growth_total, fund=db.fund_balance(market.FUND_START, market.STEP_KIND), lines=lines,
                 active_days=recent_days(player.id), income_share=market.activity_share(db.days_since_active(player.id)),
                 cost_usd=round(sum(a.usd for a in by_agent.values()), 6), cost_by_agent=list(by_agent.values()),
                 price_note=agents.PRICE_NOTE, agency=agency)


# How a move reads to the owner of the wallet. The other side is named by what it is, never by who it is.
MOVE_LABEL = {
    ("deposit", True): ("Play credits you added", "From outside the game"),
    ("grant", True): ("Starting credits", "Play money to try this seat"),
    ("work", True): ("Work pay", "From a job requester, after you checked the job"),
    ("data", True): ("Data income", "From an agency. The agency saw only totals."),
    ("growth", True): ("Skill step bonus", "From the growth fund"),
    ("data", False): ("Paid to Syms", "For one question"),
    ("samples", False): ("Paid to BOT Syms", "Made-up Syms, one for each country, that keep the game moving. No person is behind them."),
    ("fund_in", False): ("To the growth fund", "The extra for asking a group again, and the part held back from owners who were away"),
    ("fee", False): ("Token fee", "What your agents cost to run"),
    ("share", False): ("Platform share", "10 percent on top of what you spent. This is how the game earns."),
    ("share_back", True): ("Platform share returned", "Held credits came back unused, so their share came back too"),
    ("royalty", True): ("One to one royalty", "A seat paid to meet your Sym. It saw your nickname and your Sym's answers."),
    ("royalty", False): ("Royalty to a Sym's owner", "To meet one Sym one to one"),
    ("crew", False): ("Crew fee", "What your crew costs to send out. It goes to the game."),
    ("hold", False): ("Held for a job or a skill you back", "Held until it is used. What is not used comes back."),
    ("reach", True): ("Reach royalty", "An agency paid a Sym whose owner passed a skill step you built."),
    ("sponsor", True): ("Sponsor pay", "An agency put credits behind this skill. It pays when a player passes a step."),
    ("release", True): ("Came back from a job", "The part of the held credits that was not needed"),
    ("claim", False): ("Claim fee", "To claim a skill step. It goes to the game."),
    ("maker", True): ("Skill royalty", "From the growth fund. A player passed a step you built."),
}
WALLET_NOTE = ("Credits are play money. No real money moves. One credit stands for one cent when a wallet pays a token fee. "
               "A wallet that cannot pay a token fee is not charged: the game covers that run.")


def wallets_out(player: Player) -> Wallets:
    seats = ["player"] + [kind for kind in ("agency", "creator") if db.org_for(player.id, kind) is not None]
    out = []
    for seat in seats:
        lines = []
        for at, kind, _other, amount, moves in db.wallet_moves(player.id, seat):
            label, detail = MOVE_LABEL.get((kind, amount > 0), (kind, ""))
            if kind == "data" and amount > 0 and _other == "creator":
                detail = "From a creator. The creator saw only totals."
            if kind == "data" and amount < 0:
                detail = f"For one question, to {moves} {'Sym' if moves == 1 else 'Syms'}"
            if kind == "work" and amount > 0 and _other == "escrow":
                detail = "From an agency's job, after you checked the answer"
            if kind == "maker" and moves > 1:
                detail = f"From the growth fund. {moves} players passed a step you built."
            lines.append(WalletLine(at=db.iso(at), kind=kind, label=label, detail=detail, credits=round(amount / db.MILLI, 2)))
        out.append(WalletOut(seat=seat, balance=db.wallet_balance(player.id, seat),
                             came_in=round(sum(m.credits for m in lines if m.credits > 0), 2),
                             went_out=round(-sum(m.credits for m in lines if m.credits < 0), 2), lines=lines))
    return Wallets(wallets=out, deposit_choices=list(market.DEPOSIT_CHOICES), note=WALLET_NOTE)


@app.get("/wallets", response_model=Wallets)
def wallets(player: Player = Depends(current_player)) -> Wallets:
    """The caller's own wallets: what each holds, and every move in and out. Never anyone else's."""
    return wallets_out(player)


@app.post("/wallets/deposit", response_model=Wallets)
def deposit(body: DepositIn, request: Request, player: Player = Depends(current_player)) -> Wallets:
    """Add play credits to one of the caller's own wallets. Fixed amounts only. No real money moves."""
    rate_limit(request, "deposit", 20)
    if body.credits not in market.DEPOSIT_CHOICES:
        raise HTTPException(422, "Please choose an amount from the list.")
    if body.seat != "player" and db.org_for(player.id, body.seat) is None:
        raise HTTPException(404, "Please open that seat first.")
    if db.wallet_balance(player.id, body.seat) + body.credits > market.WALLET_CAP:
        raise HTTPException(409, "That wallet is full.")
    db.deposit(player.id, body.seat, body.credits)
    return wallets_out(player)


EXPORT_NOTE = (
    "This file holds what you put in, and any results you brought with you. The cards, questions, skills, "
    "certificates given here, and anything the AI wrote belong to BYT. They are not in this file. You can read "
    "all of them on the My Sym screen, and you can delete them."
)


@app.post("/feedback", response_model=FeedbackOut)
def give_feedback(body: FeedbackIn, request: Request, player: Player = Depends(current_player)) -> FeedbackOut:
    """One tap: was this moment worth it. The caller must be signed in, but who they are is not written down."""
    rate_limit(request, "feedback", 30)
    db.add_feedback(body.seat, body.moment, body.answer)
    return feedback_out()


@app.get("/feedback", response_model=FeedbackOut)
def read_feedback(player: Player = Depends(current_player)) -> FeedbackOut:
    """What people said, as counts for each seat and moment."""
    return feedback_out()


def feedback_out() -> FeedbackOut:
    rows = [FeedbackRow(seat=seat, moment=moment, **counts) for (seat, moment), counts in sorted(db.feedback_counts().items())]
    return FeedbackOut(rows=rows, total=sum(r.yes + r.unsure + r.no for r in rows))


@app.get("/export/battles.csv", response_class=PlainTextResponse)
def export_battles(player: Player = Depends(current_player)) -> PlainTextResponse:
    """For analysts: one row for each finished battle. No nickname and no player id; the battle id is random."""
    rows = ["battle_id,deck,n,sym_matches,baseline_matches,date"]
    for b in db.finished_battles():
        rows.append(f"{b.id},{b.gate_id},{b.n},{b.twin_matches},{b.baseline_matches},{db.iso(b.created_at)[:10]}")
    return PlainTextResponse("\n".join(rows) + "\n", media_type="text/csv")


@app.get("/me/export", response_model=Export)
def export_me(player: Player = Depends(current_player)) -> Export:
    """The download: what the player put in, including results they brought with them. None of our content, no agent output, no certificate issued here."""
    report = db.self_report_for(player.id)
    return Export(
        note=EXPORT_NOTE, nickname=player.nickname, joined=db.iso(player.created_at),
        taps=[ExportTap(card_id=r.card_id, choice=r.choice, response_ms=r.response_ms, at=db.iso(r.created_at))
              for r in db.responses_for(player.id)],
        told=told_out(report) if report else None,
        data_income_opt_in=db.data_income_on(player.id),
        one_to_one_opt_in=db.one_to_one_on(player.id),
        job_reviews=[ExportReview(job_id=w.job_id, verdict=w.verdict, choice=w.final_choice)
                     for w in db.work_for(player.id) if w.verdict],
        days_played=db.days_played(player.id),
        told_twin=[f.statement for f in db.facts_for(player.id)],
        credits=db.credits_for(player.id),
    )


@app.get("/usage/summary", response_model=UsageSummary)
def usage_summary(player: Player = Depends(current_player)) -> UsageSummary:
    """Token counts and cost from real runs. Totals carry no player data; "my" numbers are the caller's own."""
    rows = db.usage_rows()
    by: dict[str, AgentUsage] = {}
    for r in rows:
        a = by.setdefault(r.agent, AgentUsage(agent=r.agent, runs=0, input_tokens=0, cached_tokens=0, output_tokens=0, cost_usd=0.0))
        a.runs += 1
        a.input_tokens += r.input_tokens
        a.cached_tokens += r.cached_tokens
        a.output_tokens += r.output_tokens
        a.cost_usd = round(a.cost_usd + r.cost_usd, 8)
    mine = [r for r in rows if r.player_id == player.id]
    return UsageSummary(
        model=os.environ.get("OPENAI_MODEL") or agents.DEFAULT_MODEL, price_note=agents.PRICE_NOTE,
        runs=len(rows), input_tokens=sum(r.input_tokens for r in rows), cached_tokens=sum(r.cached_tokens for r in rows),
        output_tokens=sum(r.output_tokens for r in rows), cost_usd=round(sum(r.cost_usd for r in rows), 8),
        my_runs=len(mine), my_cost_usd=round(sum(r.cost_usd for r in mine), 8), by_agent=list(by.values()),
    )


@app.post("/me/leave", response_model=Left)
def leave_me(player: Player = Depends(current_player)) -> Left:
    """Leave the game. The login and nickname are removed and the wallets are closed, so this person is paid nothing
    more. The Sym stays as an anonymous free Sym, and what the person's seats made stays for everyone else."""
    db.leave(player.id)
    return Left()


@app.delete("/me", response_model=Deleted)
def delete_me(player: Player = Depends(current_player)) -> Deleted:
    org = db.org_for(player.id, "agency")
    for posted in db.postings_for(org.id) if org else []:
        work_rules.JOB_BY_ID.pop(posted.id, None)  # the jobs this agency posted go with it
    db.delete_player(player.id)
    return Deleted()
