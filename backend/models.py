"""Database tables (SQLModel) and the typed request and response shapes (Pydantic).

Every request model rejects unknown fields. The TypeScript mirror is frontend/src/api.ts.
"""
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict
from pydantic import Field as PField
from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


# ---------- tables ----------

class Player(SQLModel, table=True):
    __tablename__ = "players"
    id: str = Field(default_factory=new_id, primary_key=True)
    nickname: str
    token_hash: str = Field(unique=True, index=True)
    consent_at: datetime
    points: int = 0
    level: int = 1
    streak_days: int = 0
    created_at: datetime = Field(default_factory=utcnow)


class Response(SQLModel, table=True):
    __tablename__ = "responses"
    __table_args__ = (UniqueConstraint("player_id", "card_id"),)
    id: str = Field(default_factory=new_id, primary_key=True)
    player_id: str = Field(foreign_key="players.id", index=True)
    card_id: str
    choice: str
    is_correct: bool | None = None
    response_ms: int
    held_out: bool = False
    sure: int | None = None  # pattern cards: how sure the player said they were. 3 sure, 2 think so, 1 a guess
    created_at: datetime = Field(default_factory=utcnow)


class Tendency(SQLModel, table=True):
    __tablename__ = "tendencies"
    id: str = Field(default_factory=new_id, primary_key=True)
    player_id: str = Field(foreign_key="players.id", index=True)
    topic: str
    statement: str
    evidence_count: int
    scope: str = "trait"  # "trait": holds for the person anywhere. "topic": holds inside its topic only
    updated_at: datetime = Field(default_factory=utcnow)


class Battle(SQLModel, table=True):
    __tablename__ = "battles"
    __table_args__ = (UniqueConstraint("player_id", "gate_id"),)
    id: str = Field(default_factory=new_id, primary_key=True)
    player_id: str = Field(foreign_key="players.id", index=True)
    gate_id: str
    topic: str
    n: int
    twin_kind: str  # "model" (the Twin agent) or "offline" (the zero-token rule of thumb)
    twin_matches: int | None = None
    baseline_matches: int | None = None
    created_at: datetime = Field(default_factory=utcnow)


class Prediction(SQLModel, table=True):
    __tablename__ = "predictions"
    id: str = Field(default_factory=new_id, primary_key=True)
    battle_id: str = Field(foreign_key="battles.id", index=True)
    player_id: str = Field(foreign_key="players.id", index=True)
    card_id: str
    predicted: str | None = None  # None means the twin said "I do not know"
    confidence: float = 0.0
    baseline: str  # what "always guess the popular pick" would say
    actual: str | None = None
    because: str | None = None  # the belief the twin leaned on for this guess, as it read when the guess was sealed


class Fact(SQLModel, table=True):
    """One thing a player told their Sym, kept as a short line in the Sym's own words. The player's words are
    never stored. A line is written only after the player taps to keep it, and the player can remove it."""
    __tablename__ = "facts"
    id: str = Field(default_factory=new_id, primary_key=True)
    player_id: str = Field(foreign_key="players.id", index=True)
    scope: str  # "trait": true of the person anywhere. "topic": a view about one thing only
    topic: str
    statement: str
    created_at: datetime = Field(default_factory=utcnow)


class Throw(SQLModel, table=True):
    """One round of rock, paper, scissors between a player and their own Sym. The Sym's throw is worked out
    from the earlier rows before this one is written."""
    __tablename__ = "throws"
    id: str = Field(default_factory=new_id, primary_key=True)
    player_id: str = Field(foreign_key="players.id", index=True)
    mine: str  # r, p or s
    twin: str  # r, p or s
    created_at: datetime = Field(default_factory=utcnow)


class Feedback(SQLModel, table=True):
    """One tap of product feedback: was a moment worth it. It holds no player id, so it cannot be tied to a person."""
    __tablename__ = "feedback"
    id: str = Field(default_factory=new_id, primary_key=True)
    seat: str  # player, agency or creator
    moment: str  # gate, job, question or studio
    answer: str  # yes, unsure or no
    day: str  # the date only, so a tap cannot be matched to a moment in someone's history


class Lesson(SQLModel, table=True):
    """One thing a Sym changed after a battle: a belief it rewrote, added or dropped, or a pick it now counts.
    This is the record that the Sym learned from being wrong."""
    __tablename__ = "lessons"
    id: str = Field(default_factory=new_id, primary_key=True)
    player_id: str = Field(foreign_key="players.id", index=True)
    battle_id: str = Field(foreign_key="battles.id", index=True)
    kind: str  # changed, new, dropped, count or held
    topic: str
    before: str = ""
    after: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class Cert(SQLModel, table=True):
    __tablename__ = "certs"
    __table_args__ = (UniqueConstraint("player_id", "kind", "topic", "level"),)
    id: str = Field(default_factory=new_id, primary_key=True)
    player_id: str = Field(foreign_key="players.id", index=True)
    kind: str  # "twin" or "skill"
    topic: str
    level: str = ""
    accuracy: float
    baseline: float | None = None
    n: int
    issued_at: datetime = Field(default_factory=utcnow)


class SelfReport(SQLModel, table=True):
    """What a player chose to tell us about themselves. Opt-in, never sent to a model."""
    __tablename__ = "self_reports"
    player_id: str = Field(foreign_key="players.id", primary_key=True)
    ei: str | None = None
    sn: str | None = None
    tf: str | None = None
    jp: str | None = None
    analyse: int | None = None  # 1 very low to 5 very high, as the player's own report puts it
    organise: int | None = None
    explore: int | None = None
    connect: int | None = None
    sign: str | None = None
    animal: str | None = None
    updated_at: datetime = Field(default_factory=utcnow)


class Work(SQLModel, table=True):
    """One job a Sym did for its human: the Sym's answer, the human's verdict and the play credits paid."""
    __tablename__ = "work"
    __table_args__ = (UniqueConstraint("player_id", "job_id"),)
    id: str = Field(default_factory=new_id, primary_key=True)
    player_id: str = Field(foreign_key="players.id", index=True)
    job_id: str
    twin_kind: str  # "model" or "offline"
    answer: str | None = None  # the option the twin chose; None means it did not know
    reason: str = ""
    verdict: str | None = None  # None until reviewed, then "approved" or "corrected"
    final_choice: str | None = None  # what the human confirmed
    credits: int = 0
    created_at: datetime = Field(default_factory=utcnow)
    reviewed_at: datetime | None = None


class ActiveDay(SQLModel, table=True):
    """One row for each day a player used the game. It shows a Sym has a living owner. No time, no place, no device."""
    __tablename__ = "active_days"
    __table_args__ = (UniqueConstraint("player_id", "day"),)
    id: str = Field(default_factory=new_id, primary_key=True)
    player_id: str = Field(foreign_key="players.id", index=True)
    day: str  # UTC date, YYYY-MM-DD


class Consent(SQLModel, table=True):
    """Choices a player made about their Sym. Off until the player turns one on."""
    __tablename__ = "consents"
    player_id: str = Field(foreign_key="players.id", primary_key=True)
    data_income: bool = False  # agencies may include this twin in batch questions (counts only) and pay it
    updated_at: datetime = Field(default_factory=utcnow)


class Org(SQLModel, table=True):
    """A seat on the other side of the market, opened by a player: an agency (or, later, a skill creator)."""
    __tablename__ = "orgs"
    __table_args__ = (UniqueConstraint("owner_id", "kind"),)
    id: str = Field(default_factory=new_id, primary_key=True)
    owner_id: str = Field(foreign_key="players.id", index=True)
    kind: str  # "agency"
    name: str
    budget: int
    created_at: datetime = Field(default_factory=utcnow)


class Campaign(SQLModel, table=True):
    """One batch question an agency ran. Holds counts only, never who answered what."""
    __tablename__ = "campaigns"
    id: str = Field(default_factory=new_id, primary_key=True)
    org_id: str = Field(foreign_key="orgs.id", index=True)
    question_id: str
    audience: str
    pay: int
    twins: int
    sample_twins: int
    spent: int
    counts: str  # JSON: {option id: how many twins chose it}
    depth: str = "blend"  # the price tier: blend, members or core
    created_at: datetime = Field(default_factory=utcnow)


class Earning(SQLModel, table=True):
    """Passive play credits a player's Sym earned by answering an agency's batch question."""
    __tablename__ = "earnings"
    id: str = Field(default_factory=new_id, primary_key=True)
    player_id: str = Field(foreign_key="players.id", index=True)
    campaign_id: str | None = Field(default=None, index=True)  # cleared if the agency is deleted; the credits stay
    kind: str  # the question kind: Ad, Recruiting, Course
    credits: int
    created_at: datetime = Field(default_factory=utcnow)


class Brief(SQLModel, table=True):
    """One job a creator sent its crew on: a survey, a test or a claim on a skill step. Counts only, never who."""
    __tablename__ = "briefs"
    id: str = Field(default_factory=new_id, primary_key=True)
    org_id: str = Field(foreign_key="orgs.id", index=True)
    kind: str  # survey, test, skill (a claim) or build
    topic: str  # a question id or a skill id
    audience: str
    twins: int
    sample_twins: int
    spent: int
    counts: str  # JSON: {option or band: how many twins}, or {"step": the claimed step}
    created_at: datetime = Field(default_factory=utcnow)


class Posting(SQLModel, table=True):
    """A job an agency posted for Syms to take. The pay is held when the job is posted, and paid when a player
    checks the Sym's answer. What is not used goes back to the agency."""
    __tablename__ = "postings"
    id: str = Field(primary_key=True)  # "post-" and a random id: the job id that work rows carry
    org_id: str = Field(foreign_key="orgs.id", index=True)
    question_id: str  # one of the fixed questions
    pay: int  # credits for one checked answer
    seats: int  # how many twins may take the job
    hold: int  # credits held for each seat: the pay times the certificate multiplier
    closed: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class MadeStep(SQLModel, table=True):
    """A skill step a creator built from a card pack. Players can play it while this row exists."""
    __tablename__ = "made_steps"
    id: str = Field(primary_key=True)  # the pack id, so a step has one maker
    org_id: str = Field(foreign_key="orgs.id", index=True)
    cards: str  # JSON: the ids of the cards the creator tapped, all from the pack
    created_at: datetime = Field(default_factory=utcnow)


class Meet(SQLModel, table=True):
    """One Sym a seat paid to meet one to one. Removed when the Sym's owner or the seat's owner deletes their data."""
    __tablename__ = "meets"
    id: str = Field(default_factory=new_id, primary_key=True)
    org_id: str = Field(foreign_key="orgs.id", index=True)
    player_id: str = Field(foreign_key="players.id", index=True)
    paid: int
    created_at: datetime = Field(default_factory=utcnow)


class Sponsorship(SQLModel, table=True):
    """Credits an agency put behind a skill. Each time a player passes a built step of that skill, part goes to the
    player and part to the creator who built the step, until the credits run out."""
    __tablename__ = "sponsorships"
    id: str = Field(default_factory=new_id, primary_key=True)
    org_id: str = Field(foreign_key="orgs.id", index=True)
    skill: str
    budget: int
    spent: int = 0
    passes: int = 0  # how many passes it has paid for. A count, never who
    closed: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class AutoWork(SQLModel, table=True):
    """A player's choice to let the Sym start jobs by itself. Off (0) until the player chooses a number."""
    __tablename__ = "autowork"
    player_id: str = Field(foreign_key="players.id", primary_key=True)
    per_day: int = 0
    updated_at: datetime = Field(default_factory=utcnow)


class OneToOne(SQLModel, table=True):
    """A player's choice to let a seat meet their Sym one to one for a royalty. Off until the player turns it on."""
    __tablename__ = "one_to_one"
    player_id: str = Field(foreign_key="players.id", primary_key=True)
    on: bool = False
    updated_at: datetime = Field(default_factory=utcnow)


class Wallet(SQLModel, table=True):
    """Where play credits sit. A player, an agency and a creator seat each have one. The game has a few of its own
    (the outside, the growth fund, job requesters, token fees, sample Syms). A wallet holds no name."""
    __tablename__ = "wallets"
    id: str = Field(default_factory=new_id, primary_key=True)
    owner_id: str | None = Field(default=None, foreign_key="players.id", index=True)  # None: the game's own, or closed
    kind: str  # player, agency, creator, or one of the game's own: bank, fund, requesters, platform, samples
    closed: bool = False  # the owner deleted their data: the link to them is cut, the past moves stay so sums hold
    created_at: datetime = Field(default_factory=utcnow)


class Transfer(SQLModel, table=True):
    """One move of play credits from one wallet to another. Never changed, never removed. It names two wallets,
    an amount and a reason: no player, no answer, no question text."""
    __tablename__ = "transfers"
    id: str = Field(default_factory=new_id, primary_key=True)
    from_wallet: str = Field(foreign_key="wallets.id", index=True)
    to_wallet: str = Field(foreign_key="wallets.id", index=True)
    amount: int  # thousandths of a credit, always above zero
    kind: str  # deposit, grant, work, data, samples, fund_in, growth, fee, royalty, crew, claim, maker, hold, release
    ref: str | None = Field(default=None, index=True)  # the campaign, job, step or agent run this move belongs to
    created_at: datetime = Field(default_factory=utcnow)


class Usage(SQLModel, table=True):
    __tablename__ = "usage"
    run_id: str = Field(primary_key=True)
    agent: str
    player_id: str | None = Field(default=None, foreign_key="players.id", index=True)
    model: str
    input_tokens: int = 0
    cached_tokens: int = 0
    output_tokens: int = 0
    requests: int = 0
    cost_usd: float = 0.0
    stopped_reason: str
    ms: int = 0
    created_at: datetime = Field(default_factory=utcnow)


# ---------- what the agents must return ----------

class TendencyDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic: str = PField(min_length=1, max_length=40)
    statement: str = PField(min_length=1, max_length=200)
    evidence_count: int = PField(ge=1, le=200)
    scope: Literal["trait", "topic"] = "trait"


class ProfileOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tendencies: list[TendencyDraft] = PField(max_length=10)


class PredictionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    card_id: str = PField(max_length=60)
    choice: str | None = PField(default=None, max_length=40)
    confidence: float = PField(ge=0, le=1)
    because: str | None = PField(default=None, max_length=60)  # the topic of the tendency it leaned on


class WorkDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    choice: str | None = PField(default=None, max_length=40)
    reason: str = PField(default="", max_length=240)


class GuideDraft(BaseModel):
    """What the Guide agent returns: a short answer to its human and at most one move from the list it was given."""
    model_config = ConfigDict(extra="forbid")
    say: str = PField(default="", max_length=400)
    move: str | None = PField(default=None, max_length=80)
    note: "NoteDraft | None" = None  # one thing worth keeping from what the human said, in the twin's own words


class NoteDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: Literal["trait", "topic"] = "trait"
    topic: str = PField(default="", max_length=40)
    statement: str = PField(default="", max_length=200)


class TwinOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    predictions: list[PredictionDraft] = PField(max_length=30)


# ---------- API shapes ----------

class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Health(Strict):
    ok: bool = True


class PlayerCreate(Strict):
    nickname: str = PField(min_length=2, max_length=20, pattern=r"^[A-Za-z0-9][A-Za-z0-9 _\-]*$")
    consent: Literal[True]
    adult: Literal[True]


class PlayerCreated(Strict):
    token: str
    nickname: str


class Me(Strict):
    nickname: str
    points: int
    level: int
    gates_done: int
    gates_total: int
    certs: int = 0
    credits: float = 0
    jobs_open: int = 0
    twins: int = 0  # every twin in the game: the sky behind the sphere has one point for each
    people: int = 0  # of those Syms, how many have a living person behind them (never a BOT Sym or a Sym left behind)
    together: float = 0.0  # 0 = this twin has only played alone (black and white); 1 = fully connected (full color)
    active_days: int = 0  # days played in the last 14
    income_share: float = 1.0  # the part of data income this twin receives, from how lately its owner played


class GateOut(Strict):
    id: str
    title: str
    kind: str
    deck: str
    difficulty: str | None
    bin: str = "preference"
    total: int
    done: int
    unlocked: bool


class Journey(Strict):
    gates: list[GateOut]
    bins: list["BinOut"] = []


class OptionOut(Strict):
    id: str
    label: str


class BoardOut(Strict):
    game: Literal["tictactoe", "connect4", "pattern", "reflex"]
    rows: list[str]
    to_move: str
    seq: list[str] = []  # pattern: the squares that flash, in order. The next square is never sent.


class CardOut(Strict):
    id: str
    kind: str
    prompt: str
    options: list[OptionOut]
    board: BoardOut | None = None
    bet_sure: int | None = None  # pattern cards: how sure the twin is of its bet on this card. The bet stays sealed.


class GateCards(Strict):
    gate: GateOut
    cards: list[CardOut]


class ResponseIn(Strict):
    card_id: str = PField(min_length=1, max_length=60)
    choice: str = PField(min_length=1, max_length=40)
    response_ms: int = PField(ge=0, le=600_000)
    sure: Literal[1, 2, 3] | None = None  # pattern cards: 3 sure, 2 think so, 1 a guess


class SureRow(Strict):
    """How often the player was right at one level of sureness. The gap between how sure and how right is the
    thing worth knowing before a risky choice."""
    level: int
    right: int
    total: int


class SureTap(Strict):
    """One answer where the player said how sure they were: when, how sure (3, 2 or 1) and whether it was right."""
    at: str
    level: int
    right: bool


class Judgment(Strict):
    """How well the player judges their own answers: right at each level of sureness, the taps in order, and one
    plain line worked out by code."""
    rows: list[SureRow]
    taps: list[SureTap]
    says: str
    unsaid: int = 0  # right-or-wrong answers given with no "how sure" tap; they are in no row


class CertOut(Strict):
    kind: str
    topic: str
    level: str
    accuracy: float
    baseline: float | None
    n: int
    issued_at: str


class ResponseOut(Strict):
    is_correct: bool | None
    points_earned: int
    points: int
    level: int
    gate_complete: bool
    twin_choice: str | None = None  # battle cards: what the twin predicted (label), revealed after the pick
    twin_match: bool | None = None
    twin_sure: int | None = None  # battle cards: how sure the twin said it was, 0 to 100
    twin_because: str | None = None  # battle cards: the belief the twin leaned on
    crowd_match: bool | None = None  # battle cards: whether "what most people pick" was right
    others_right: int | None = None  # pattern cards: how many other players got this one right
    others_total: int | None = None  # and how many other players tried it
    twin_bet: bool | None = None  # pattern cards: the twin bet that the player would get it (true) or miss it
    twin_bet_sure: int | None = None  # and how sure the twin was of that bet, 50 to 100
    sure_record: list[SureRow] = []  # the player's record at each level of sureness, over every gate so far
    sure_gate: list[SureRow] = []  # the same record for the cards of this gate only
    right_choice: str | None = None  # pattern cards: the square the next dot went to, sent only after the pick is stored
    cert_need: int | None = None  # at the end of a skill gate: how many right answers the certificate needed
    cert_right: int | None = None  # and how many the player got
    cert: CertOut | None = None  # a skill cert earned by finishing this gate
    bonus: int = 0  # credits from the growth fund for passing a skill step
    sponsored: int = 0  # credits from an agency that sponsors this skill


class LessonOut(Strict):
    kind: str
    topic: str
    before: str
    after: str


class LearnOut(Strict):
    """What the Sym did with a finished battle. The picks become proof it may learn from, and each lesson is one change."""
    twin_kind: str
    misses: int
    picks_added: int
    lessons: list[LessonOut]


class AreaHit(Strict):
    """One brain area in one battle: of your picks that fell in it, how many the Sym guessed."""
    key: str
    name: str
    region: str
    color: str
    right: int
    total: int


class BattleStart(Strict):
    gate_id: str = PField(min_length=1, max_length=60)


class BattleStarted(Strict):
    gate_id: str
    n: int
    twin_kind: str
    sure: dict[str, int] = {}  # for each card: how sure the twin is, 0 to 100. The guess itself stays sealed.


class BattleResult(Strict):
    gate_id: str
    topic: str
    n: int
    answered: int
    complete: bool
    twin_kind: str
    twin_matches: int
    baseline_matches: int
    cert: CertOut | None = None
    note: str
    areas: list[AreaHit] = []  # where the twin read you right and wrong, by brain area
    record: list[str] = []  # every finished battle in order, as "right/cards", so progress can be seen


class TendencyOut(Strict):
    topic: str
    statement: str
    evidence_count: int
    scope: str = "trait"


class BattleSummary(Strict):
    topic: str
    n: int
    twin_kind: str
    twin_matches: int | None
    baseline_matches: int | None
    created_at: str


class AgentUsage(Strict):
    agent: str
    runs: int
    input_tokens: int
    cached_tokens: int
    output_tokens: int
    cost_usd: float


class UsageSummary(Strict):
    model: str
    price_note: str
    runs: int
    input_tokens: int
    cached_tokens: int
    output_tokens: int
    cost_usd: float
    my_runs: int
    my_cost_usd: float
    by_agent: list[AgentUsage]


class ActivityItem(Strict):
    card_id: str
    gate: str
    prompt: str
    choice: str
    is_correct: bool | None
    response_ms: int
    created_at: str


Sign = Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn",
               "aquarius", "pisces"]
Animal = Literal["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"]


class Told(Strict):
    """What the player says about themselves. Every field is optional; sending it replaces what was stored."""
    ei: Literal["E", "I"] | None = None
    sn: Literal["S", "N"] | None = None
    tf: Literal["T", "F"] | None = None
    jp: Literal["J", "P"] | None = None
    analyse: int | None = PField(default=None, ge=1, le=5)
    organise: int | None = PField(default=None, ge=1, le=5)
    explore: int | None = PField(default=None, ge=1, le=5)
    connect: int | None = PField(default=None, ge=1, le=5)
    sign: Sign | None = None
    animal: Animal | None = None


class SkillRef(Strict):
    id: str
    name: str


class PathOut(Strict):
    kind: Literal["specialise", "stretch"]
    style: str
    skills: list[SkillRef]


class SkillStepOut(Strict):
    name: str
    state: Literal["done", "open", "locked", "soon"]
    gate_id: str | None = None
    made: bool = False  # a creator built this step


class SkillTreeOut(Strict):
    id: str
    name: str
    about: str
    grows: list[str]  # the styles and faculties this skill strengthens
    steps: list[SkillStepOut]
    done: int
    certs: int


class Skills(Strict):
    trees: list[SkillTreeOut]


class AxisOut(Strict):
    name: str
    first: str
    second: str
    first_picks: int
    second_picks: int
    suggested: str | None
    told: str | None
    verdict: str  # aligned, differs, open, not told


class StyleOut(Strict):
    key: str
    name: str
    picks: int
    chances: int
    share: float
    told: int | None
    about: str = ""
    strength: str = ""
    watch: str = ""
    skills: list["SkillRef"] = []


class FacultyOut(Strict):
    key: str
    name: str
    region: str
    picks: int
    chances: int
    share: float
    about: str = ""
    fact: str = ""
    skills: list["SkillRef"] = []
    feeds: list[str] = []  # the gates whose cards feed this area


class BinOut(Strict):
    id: str
    name: str
    about: str


class Mirror(Strict):
    suggested_type: str  # four characters, a dot where an axis is still open
    axes: list[AxisOut]
    styles: list[StyleOut]
    top_styles: list[str]
    faculties: list[FacultyOut] = []
    paths: list[PathOut] = []
    style_verdict: str
    told: Told
    picks_used: int
    note: str


class Activity(Strict):
    nickname: str
    points: int
    level: int
    joined: str
    responses: list[ActivityItem]
    tendencies: list[TendencyOut] = []
    battles: list[BattleSummary] = []
    certs: list[CertOut] = []
    told: Told | None = None
    work: list["WorkItem"] = []
    credits: float = 0
    days_played: list[str] = []  # every day the player used the game


class JobOut(Strict):
    id: str
    requester: str
    requester_kind: str
    question: str
    feeds: str
    pay: int
    after_gates: int
    state: Literal["locked", "open", "review", "done"]
    options: list[OptionOut] = []  # sent once the twin has answered, so the human can correct it
    twin_kind: str | None = None
    cost_usd: float = 0.0  # what this AI run cost in real dollars; sent once, right after the run, and 0 otherwise
    answer: str | None = None  # option id
    reason: str = ""
    verdict: str | None = None
    final_choice: str | None = None
    credits: int = 0


class Jobs(Strict):
    jobs: list[JobOut]
    credits: float
    certified: bool
    data_income: bool = False  # the player's opt-in
    data_credits: int = 0
    data_answers: int = 0
    one_to_one: bool = False  # the player's opt-in to one to one meetings
    meet_price: int = 0
    meets: int = 0  # how many times a seat has met this twin
    auto_per_day: int = 0  # jobs the twin may start by itself each day
    auto_choices: list[int] = []
    earned_credits: float = 0  # everything this twin has earned
    upkeep_credits: float = 0  # what its agent runs have cost, in credits


class ConsentIn(Strict):
    data_income: bool


class AutoIn(Strict):
    per_day: int


class SponsorIn(Strict):
    skill: str = PField(min_length=1, max_length=40)
    budget: int


class SponsorOut(Strict):
    skill: str
    budget: int
    spent: int
    passes: int
    open: bool


class NeedOut(Strict):
    """A skill agencies are paying for. Shown to creators, as a sum. No agency is named."""
    skill: str
    name: str
    left: int
    built: bool  # at least one step of this skill is built


class WantedOut(Strict):
    """A skill agencies are asking about. Shown to creators as a count of agencies, never a name."""
    skill: str
    name: str
    agencies: int
    built: bool
    waiting: int  # steps of this skill that a creator could still build


class PairOut(Strict):
    """Two skills that several agencies want together: a need no one listed by hand."""
    a: str
    b: str
    agencies: int


class PlanOption(Strict):
    id: str  # a move: "gate:<gate id>" or "work"
    title: str
    why: str
    credits: int  # what it can pay, 0 if nothing
    minutes: int


class Plan(Strict):
    options: list[PlanOption]


class FlowOut(Strict):
    src: str
    dst: str
    credits: float
    moves: int


class World(Strict):
    """The whole game as totals. No player, no seat and no answer is named."""
    twins_members: int
    twins_free: int
    twins_forming: int
    agencies: int
    creators: int
    built_steps: int
    open_jobs: int
    sponsors: int
    certs_twin: int
    certs_skill: int
    certs_insight: int
    checked_answers: int
    corrections: int
    agent_runs: int
    agent_cost_usd: float
    flows: list[FlowOut]
    balances: dict[str, float]
    last_move: str | None = None


class OneToOneIn(Strict):
    on: bool


class RetryOut(Strict):
    """A skill gate opened again after its cool-off. The earlier answers to it are gone; the points stay."""
    gate_id: str
    cards: int


class RpsIn(Strict):
    throw: Literal["r", "p", "s"]


class RpsRound(Strict):
    mine: str
    twin: str
    outcome: Literal["you", "twin", "draw"]
    why: str = ""  # how the twin chose its throw, from your earlier throws


class RpsTell(Strict):
    """One habit the Sym leans on: after this throw, you throw that one, this often."""
    after: str
    then: str
    n: int
    of: int


class RpsRival(Strict):
    """One other Sym in the league. It has a number, never a name."""
    name: str
    free: bool
    won: int
    lost: int
    drawn: int


class RpsOut(Strict):
    rounds: int
    you: int
    twin: int
    draws: int
    last: list[RpsRound] = []  # the last rounds, newest first
    tells: list[RpsTell] = []
    need: int = 0  # throws still needed before the twin joins the league
    rivals: list[RpsRival] = []
    rank: int = 0
    of: int = 0
    round: RpsRound | None = None  # the round just played


class BriefIn(Strict):
    kind: Literal["survey", "test", "skill"]
    topic: str = PField(min_length=1, max_length=40)
    audience: str = PField(default="all", min_length=1, max_length=20)


class BriefOut(Strict):
    kind: str
    title: str
    audience: str
    twins: int
    sample_twins: int
    spent: int
    fee: int
    total: float = 0  # what left the wallet in all: spent plus the game's share
    unsure: int = 0  # Syms that said they did not know: left out of the totals
    split: list["SplitRow"] = []
    note: str = ""
    created_at: str


class SkillPick(Strict):
    id: str
    name: str
    about: str
    waiting: list[str]  # steps with a card pack that no creator has claimed
    claimed: list[str]  # steps this creator claimed
    later: list[str] = []  # steps with no card pack yet
    # where every Sym a group question may reach stands on this skill. Counts only, and only for a big enough crowd.
    strong: int = 0
    partway: int = 0
    new: int = 0


class StepIn(Strict):
    pack: str = PField(min_length=1, max_length=60)
    cards: list[str] = PField(min_length=1, max_length=12)


class PackCard(Strict):
    id: str
    prompt: str
    options: list[str]


class PackOut(Strict):
    """A step this creator claimed and has not built yet, with the cards it can tap. No right answers."""
    id: str
    skill: str
    step: str
    cards: list[PackCard]


class MadeOut(Strict):
    """A step this creator built: how many other players passed it and what that paid. Counts only."""
    skill: str
    step: str
    cards: int
    passes: int
    earned: float


class MeetIn(Strict):
    audience: str = PField(min_length=1, max_length=20)


class MetAnswer(Strict):
    question: str
    answer: str


class MetTwin(Strict):
    """One Sym a seat paid to meet. Shown only while the Sym's owner keeps one to one on."""
    open: bool
    nickname: str = ""
    sample: bool = False
    strongest: list[str] = []
    answers: list[MetAnswer] = []
    paid: int
    at: str


class Meets(Strict):
    price: int
    fee: int
    budget: float
    audiences: list["AudienceOut"] = []
    met: list[MetTwin] = []


class FeedbackIn(Strict):
    seat: Literal["player", "agency", "creator"]
    moment: Literal["gate", "job", "question", "studio"]
    answer: Literal["yes", "unsure", "no"]


class FeedbackRow(Strict):
    seat: str
    moment: str
    yes: int = 0
    unsure: int = 0
    no: int = 0


class FeedbackOut(Strict):
    """What people said about the game, as counts. No one's answer can be read from it."""
    rows: list[FeedbackRow] = []
    total: int = 0


class OrgCreate(Strict):
    name: str = PField(min_length=2, max_length=30, pattern=r"^[A-Za-z0-9][A-Za-z0-9 _\-&]*$")


class CreatorSeat(Strict):
    exists: bool
    name: str = ""
    budget: float = 0
    min_twins: int = 0
    platform_share: float = 0  # the game adds this share on top of what the seat spends
    pay: int = 0
    crew_fee: int = 0
    claim_fee: int = 0
    step_cards: int = 0
    step_royalty: int = 0
    packs: list[PackOut] = []
    made: list[MadeOut] = []
    needs: list[NeedOut] = []
    wanted: list[WantedOut] = []
    emerging: list[PairOut] = []
    reach_earned: float = 0  # from agencies whose jobs were answered by twins whose owners passed this creator's steps
    sponsor_earned: float = 0  # from agencies that sponsor a skill this creator built a step for
    reach: dict[str, int] = {}  # how many Syms each group holds now, so the price is said before a send; 0 when the group is too small
    questions: list["QuestionOut"] = []
    audiences: list["AudienceOut"] = []
    skills: list[SkillPick] = []
    briefs: list[BriefOut] = []


class QuestionOut(Strict):
    id: str
    kind: str
    question: str
    options: list[OptionOut]


class AudienceOut(Strict):
    id: str
    name: str


class CampaignIn(Strict):
    question_id: str = PField(min_length=1, max_length=40)
    audience: str = PField(min_length=1, max_length=20)
    pay: int = PField(ge=1, le=5)
    depth: Literal["blend", "members", "core"] = "blend"


class TierOut(Strict):
    """One price tier: who it reaches and how many times the price each member costs there."""
    id: str
    name: str
    times: int


class CampaignOut(Strict):
    kind: str
    question: str
    audience: str
    group: str = ""  # the id of that group, so the next step can go to the same one
    depth: str = ""
    pay: int
    twins: int
    sample_twins: int
    spent: int
    total: float = 0  # what left the wallet in all: spent plus the game's share
    extra: int = 0  # the part of `spent` that was the price of asking this group again; it went to the growth fund
    unsure: int = 0  # Syms in the group that said they did not know: not counted, not paid
    split: list["SplitRow"]
    created_at: str


class Agency(Strict):
    exists: bool
    name: str = ""
    budget: float = 0
    min_twins: int
    platform_share: float = 0  # the game adds this share on top of what the seat spends
    pay_choices: list[int]
    price_times: dict[str, float] = {}  # for each group: how many times the first price the next ask costs
    tiers: list[TierOut] = []
    free_share: float = 1  # a free twin costs this share of the price
    meet_price: int = 0  # the deepest tier: one twin, one to one
    # for each group and tier: [free twins, members] that would be asked now; None when fewer than the minimum match
    reach: dict[str, dict[str, list[int] | None]] = {}
    fund: int = 0
    questions: list[QuestionOut] = []
    audiences: list[AudienceOut] = []
    campaigns: list[CampaignOut] = []
    job_pay_choices: list[int] = []
    job_seats: list[int] = []
    hold_times: float = 1  # the hold for a seat is the pay times this
    sponsor_budgets: list[int] = []
    sponsor_skills: list["AudienceOut"] = []  # skills that have a card pack: id and name
    sponsorships: list[SponsorOut] = []
    postings: list["PostOut"] = []


class PostIn(Strict):
    question_id: str = PField(min_length=1, max_length=40)
    pay: int
    seats: int


class PostOut(Strict):
    """A job this agency posted: how many Syms took it, how many answers were checked, and the totals."""
    id: str
    kind: str
    question: str
    pay: int
    seats: int
    taken: int
    checked: int
    held: int
    open: bool
    sample_twins: int
    split: list["SplitRow"] = []
    created_at: str


class AskIn(Strict):
    text: str = PField(min_length=1, max_length=200)


class MoveOut(Strict):
    id: str  # "gate:<gate id>", "work", "mine" or "money"
    label: str


class AskOut(Strict):
    """The Sym's answer to one line from its human. The line itself is not stored."""
    say: str
    twin_kind: Literal["model", "offline"]
    cost_usd: float = 0.0  # what this AI answer cost in real dollars (0 for the practice Sym)
    voice: str = ""  # the name of the voice this Sym spoke in, picked by code from its person's taps
    move: MoveOut | None = None
    learn: CardOut | None = None  # one card the twin asks its human now; the tap is saved like any other pick
    offer: "FactOut | None" = None  # a short fact the twin asks to keep. Nothing is stored unless the human taps yes


class FactOut(Strict):
    id: str = ""  # empty while it is only an offer
    scope: Literal["trait", "topic"]
    topic: str
    statement: str


class FactsOut(Strict):
    """Everything the caller told their Sym and chose to keep."""
    facts: list[FactOut]


class ReviewIn(Strict):
    verdict: Literal["approved", "corrected"]
    choice: str | None = PField(default=None, max_length=40)


class SplitRow(Strict):
    label: str
    count: int
    share: float
    yours: bool = False


class JobResult(Strict):
    job: JobOut
    credits_earned: int
    credits: float
    certified: bool
    taps: int
    beliefs: int
    twins: int
    sample_twins: int
    split: list[SplitRow]
    note: str
    insight: CertOut | None = None  # a certificate for something new that was learned


class WorkItem(Strict):
    requester: str
    question: str
    twin_answer: str
    your_answer: str
    verdict: str
    credits: int


class ExportTap(Strict):
    card_id: str
    choice: str  # the id of the option tapped, not its wording
    response_ms: int
    at: str


class ExportReview(Strict):
    job_id: str
    verdict: str
    choice: str | None


class Export(Strict):
    """What a player takes with them: what they put in, including results they brought from elsewhere. Nothing we wrote or issued."""
    note: str
    nickname: str
    joined: str
    taps: list[ExportTap]
    told: Told | None
    data_income_opt_in: bool
    one_to_one_opt_in: bool = False
    job_reviews: list[ExportReview]
    days_played: list[str] = []
    told_twin: list[str] = []  # the short facts the player let their twin keep
    credits: int


class MoneyLine(Strict):
    source: str  # Work, Data or Agency
    label: str
    detail: str
    credits: int
    at: str


class AgentCost(Strict):
    agent: str
    runs: int
    usd: float


class AgencyMoney(Strict):
    name: str
    started_with: int
    spent: int
    left: float
    twins_asked: int
    lines: list[MoneyLine]


class Money(Strict):
    """A player's books: what the Sym earned and from whom, what it cost to run, and the agency's spend if they have one."""
    earned: int
    work_credits: int
    data_credits: int
    growth_credits: int = 0
    fund: int = 0  # what the shared growth fund holds now
    active_days: int = 0  # days played in the last 14
    income_share: float = 1.0
    lines: list[MoneyLine]
    cost_usd: float
    cost_by_agent: list[AgentCost]
    price_note: str
    agency: AgencyMoney | None = None


class WalletLine(Strict):
    at: str
    kind: str = ""  # what sort of move it was (work, data, growth, fee and so on), so a screen can sort by it
    label: str
    detail: str
    credits: float  # above zero came in, below zero went out


class WalletOut(Strict):
    seat: Literal["player", "agency", "creator"]
    balance: float
    came_in: float
    went_out: float
    lines: list[WalletLine]


class Wallets(Strict):
    """The caller's own wallets. The other side of a move is named by what it is, never by who it is."""
    wallets: list[WalletOut]
    deposit_choices: list[int]
    note: str


class DepositIn(Strict):
    seat: Literal["player", "agency", "creator"]
    credits: int


class Vertical(Strict):
    key: str
    name: str
    color: str
    level: float  # 0 to 1: how much the twin knows here, from picks
    earned: float  # 0 to 1: skill steps finished here
    picks: int
    steps_done: int
    steps_total: int
    # for the agency and creator spheres, where an area is a group of twins or of seats
    count: int | None = None  # how many it stands for; None when the group is hidden
    hidden: bool = False  # fewer than 5: nothing about it is shown
    dots: list[float] = []  # one size for each point drawn, 0 to 1, from progress, never from money
    details: list[str] = []  # plain sentences about the group as a whole, or about the player's own area
    # for the player's sphere: the open gate that adds the most to this area, so the player can plan
    next_gate: str | None = None
    next_title: str | None = None


class SphereFrame(Strict):
    """The sphere at one past moment: a level and a gold share for each area, in the same order as the areas."""
    label: str
    at: str
    levels: list[float]
    earned: list[float]


class Hub(Strict):
    """One belief the Sym holds, as a point on the brain picture: the area it sits in and the topic it is about."""
    area: str
    name: str
    told: bool = False  # true for a fact the player said and chose to keep


class Sphere(Strict):
    hubs: list[Hub] = []
    verticals: list[Vertical]
    links: int  # picks that join two areas
    history: list[SphereFrame] = []  # oldest first; the present is `verticals`
    mode: Literal["fill", "clusters"] = "fill"
    balance: float | None = None  # agency and creator: how evenly they have reached across groups


class CodeBase(Strict):
    """One building block of a Sym: one thing its person did. The letter says in which seat."""
    letter: Literal["T", "G", "A", "C"]  # T a tap as a player, G growth that was proved, A an agency act, C a creator act
    area: str = ""  # the area of the mind a tap fell in; empty when the block has none
    color: str = ""
    apart: bool = False  # a tap where fewer than half of the other Syms picked the same
    # the story of the block, for the pop-out a tap on it opens. The person's own row and counts only, never a name or an id.
    what: str = ""  # one short plain line: "A pick you made", "A gate finished", "A job posted"
    gate: str = ""  # a tap: the title of the gate the card is in
    prompt: str = ""  # a tap: what the card asked
    picked: str = ""  # a tap: the words of the option the person chose
    same: int = 0  # a tap: how many of the compared Syms picked the same option
    of: int = 0  # a tap: how many compared Syms answered this card; 0 when the crowd is under the minimum


class SymCode(Strict):
    """The Sym's code: every input its person gave, in the order it was given, as four kinds of block.
    It is built from the person's own rows each time it is asked for. Nothing new is stored."""
    bases: list[CodeBase] = []  # oldest first; the newest blocks when there are more than fit
    total: int = 0
    counts: dict[str, int] = {}
    gaps: list[str] = []  # areas of the mind with no block yet
    # how this code differs from every other Sym's. Counts only, and only against a crowd of at least the minimum.
    others: int = 0  # Syms it was compared with
    same: int = 0  # of those, how many gave the same answer on every card both have answered
    apart: int = 0  # taps where fewer than half of the others picked the same
    near: list[int] = []  # the nearest other Sym: [answers the same, answers both gave]
    line: str = ""  # what the code says, written by plain counting


class Deleted(Strict):
    deleted: bool = True


class Left(Strict):
    left: bool = True


class Happening(Strict):
    """One thing that happened in the game, said with no name, no answer and no exact time."""
    who: str  # person, sym, agency or creator
    text: str
    when: str  # now, today, week or earlier
    mine: bool = False  # the reader did this one


class Commons(Strict):
    """Who is here and what is known together. Counts only, and a short stream of nameless happenings."""
    nickname: str
    people: int  # real people with a Sym
    people_today: int  # of those, how many played today
    stand_ins: int  # BOT Syms and Syms left behind
    bots: int = 0  # BOT Syms: made up, one for each country, run by plain code
    bots_awake: int = 0  # of those, how many are in their day (7:00 to 23:00 where each is named for)
    bot_agencies: int = 0  # of the agencies, how many are run by a BOT
    bot_creators: int = 0  # of the creators, how many are run by a BOT
    agencies: int
    creators: int
    taps: int  # answers real people gave
    checks: int  # answers of a Sym that its person checked
    told: int  # things people told their Sym and chose to keep
    lessons: int  # things Syms changed after being wrong
    proofs: int  # certificates earned
    beliefs: int  # beliefs Syms hold now
    known: int  # taps, checks, told and lessons together
    known_mine: int  # the reader's part of that
    taps_mine: int = 0  # 0 means the reader has not started yet
    checks_mine: int = 0  # the reader's part of checks, told and lessons: with taps_mine they add up to known_mine
    told_mine: int = 0
    lessons_mine: int = 0
    has_agency: bool = False  # the reader opened an agency seat
    has_creator: bool = False  # the reader opened a creator seat
    happenings: list[Happening] = []


class RippleLink(Strict):
    """One way that what a person did in one seat reached another seat or everyone else. Counted from the books."""
    src: str  # player, agency, creator or everyone
    dst: str
    n: int
    credits: float = 0
    text: str


class Ripple(Strict):
    """What one person set moving, across their own seats and out to everyone. Their own data, as counts."""
    agency: bool
    creator: bool
    links: list[RippleLink] = []
    # the same counts as plain numbers (taps, asks, ask_credits, checks, check_credits, steps_passed), for the
    # one line on the journey that shows the circle turning
    counts: dict[str, float] = {}
