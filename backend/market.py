"""The market: an agency asks many Syms one question and pays each Sym that answers. Plain code, no model.

This is data income, the small passive stream. Every Sym answers with the zero-token rule of thumb, so a
query costs no tokens. An agency only ever gets counts per option, and only when at least MIN_TWINS Syms
match its audience. A player's Sym is included only if the player opted in.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

from content import KNOWN_TRAITS, ONTOLOGY, TOPICS, Card, Option

QUESTIONS_PATH = Path(__file__).resolve().parent / "data" / "questions.json"
MIN_TWINS = 5  # below this an agency gets nothing back and is charged nothing
MIN_PICKS = 8  # a twin with fewer preference picks than this is not asked
START_BUDGET = 500  # play credits a new agency starts with
PAY_CHOICES = (1, 2, 5)  # credits per twin per answer
REPEAT_STEP = 0.5  # each earlier ask of the same group adds this much to the price
REPEAT_CAP = 3.0  # and the price never passes this many times the first price
USD_PER_CREDIT = 0.01  # one play credit stands for one cent when a wallet pays a token fee
DEPOSIT_CHOICES = (100, 500, 1000)  # fixed amounts, so no typed amount
WALLET_CAP = 100000  # a wallet cannot be filled past this by adding play credits
CREATOR_PAY = 1  # credits a creator pays each twin its crew asks in a group
CREW_FEE = 2  # credits a seat pays the game each time its crew goes out for a creator job or a one to one meeting
CLAIM_FEE = 25  # credits a creator pays the game to claim a waiting skill step
JOB_PAY_CHOICES = (10, 20, 40)  # credits an agency offers a twin for one checked answer to a job it posts
JOB_SEATS = (5, 10, 25)  # how many twins may take a posted job
JOB_AFTER_GATES = 1  # gates a player must clear before the twin may take a posted job
REACH_SHARE = 0.1  # on top of the pay for a checked job answer, an agency pays this share to the creators whose skill steps the twin's owner passed
SPONSOR_BUDGETS = (50, 100, 200)  # credits an agency may put behind a skill
SPONSOR_PLAYER = 5  # paid from a sponsorship to a player who passes a built step of that skill
SPONSOR_MAKER = 5  # and to the creator who built the step
AUTO_CHOICES = (0, 1, 3)  # jobs a twin may start by itself in one day; the owner still checks each answer
STEP_CARDS = 4  # cards a creator taps from a pack to build a skill step
STEP_ROYALTY = 3  # credits the growth fund pays a creator each time another player passes a step it built
MEET_PRICE = 50  # the royalty a seat pays one twin's owner to meet that twin one to one and see who it is
TEST_STRONG = 0.35  # share of a twin's picks in a skill's areas at which the twin is strong there
TEST_PARTWAY = 0.15  # and at which it is partway
BANDS: tuple[tuple[str, str], ...] = (("strong", "Strong here"), ("partway", "Partway"), ("new", "New to this"))
FUND_START = 200  # play credits the growth fund starts with
STEP_BONUS = 10  # paid from the growth fund when a player passes a skill step
STEP_KIND = "Skill step"  # how a growth bonus is marked in the earnings table
TOGETHER_FULL = 4  # connections with others at which a twin shows its full color
ACTIVE_WINDOW = 14  # the days looked at when the game says how often a player played
ACTIVE_FULL_DAYS = 7  # played within this many days: the twin receives its full share of data income
ACTIVE_HALF_DAYS = 30  # played within this many days: half; longer ago: a quarter


def activity_share(days_since: int | None) -> float:
    """The part of data income a Sym receives, from how lately its owner played. Agencies and creators pay for
    Syms with living owners; the part held back goes to the growth fund. Money held or spent plays no part."""
    if days_since is None:
        return 0.25
    if days_since <= ACTIVE_FULL_DAYS:
        return 1.0
    return 0.5 if days_since <= ACTIVE_HALF_DAYS else 0.25


def twin_pay(price: int, days_since: int | None) -> int:
    """What one Sym receives from an agency's price. A Sym whose owner has been away is still asked and still
    paid, never less than 1 credit; a Sym with an active owner receives the full price."""
    return max(1, math.ceil(price * activity_share(days_since)))


def together(jobs_checked: int, questions_answered: int, earning_on: bool) -> float:
    """Alone, a Sym is black and white. Each connection with others brings in color: a job it did for someone
    and its human checked, a question it answered for an agency, and the choice to let it earn. 0 to 1."""
    return round(min(1.0, (jobs_checked + questions_answered + (1 if earning_on else 0)) / TOGETHER_FULL), 3)


def price_times(earlier_asks: int) -> float:
    """How many times the first price an agency pays to ask a group it has already asked this often."""
    return min(REPEAT_CAP, 1 + REPEAT_STEP * max(0, earlier_asks))


def campaign_cost(twins: int, pay: int, earlier_asks: int) -> tuple[int, int]:
    """(what the agency pays in all, how much of it is extra for asking again). The Syms get pay each; the
    extra goes to the growth fund."""
    base = twins * pay
    total = math.ceil(base * price_times(earlier_asks))
    return total, total - base

# Price tiers: who an agency reaches inside a group, and what each twin costs there. A free twin has no owner
# to pay, so it costs a share of the price. Going deeper reaches only members, and each member is paid more.
# The deepest tier of all is one twin, met one to one for MEET_PRICE.
FREE_SHARE = 0.5  # a free twin costs this share of the price for each twin
TIERS: tuple[tuple[str, str, int], ...] = (
    ("blend", "Free Syms and members", 1),
    ("members", "Members only", 2),
    ("core", "Members with a certificate", 3),
)
TIER_TIMES = {key: times for key, _, times in TIERS}
TIER_NAME = {key: name for key, name, _ in TIERS}


def in_tier(twin: "TwinFacts", depth: str) -> bool:
    if depth == "blend":
        return True
    if depth == "members":
        return not twin.sample
    return not twin.sample and twin.certified


def tier_base(free: int, members: int, pay: int, depth: str) -> float:
    """What one ask costs before the price of asking again: free Syms at a share, members at the tier's price."""
    return free * pay * FREE_SHARE + members * pay * TIER_TIMES[depth]


def tier_cost(free: int, members: int, pay: int, depth: str, earlier_asks: int) -> tuple[int, int]:
    """(what the agency pays in all, how much of it is extra for asking this group again)."""
    first = math.ceil(tier_base(free, members, pay, depth))
    total = math.ceil(tier_base(free, members, pay, depth) * price_times(earlier_asks))
    return total, total - first


AUDIENCES: tuple[tuple[str, str], ...] = (
    ("all", "Every Sym"),
    ("members", "Members who earn"),
    ("certified", "Syms with a certificate"),
) + tuple((s["id"], f"Strongest style: {s['name']}") for s in ONTOLOGY["styles"]) + tuple(
    # twins that hold a belief about one topic: a narrower, more useful group than a style
    (f"view-{t['id']}", f"Has a view on: {t['name']}") for t in TOPICS if t["id"] != "general")
AUDIENCE_NAME = dict(AUDIENCES)

# The seat spheres: one cluster of points for each group. The groups and their colors are named in the ontology.
STYLE_NAME = {s["id"]: s["name"] for s in ONTOLOGY["styles"]}
GROUPS: tuple[tuple[str, str, str], ...] = tuple(
    (g["id"], g.get("name") or STYLE_NAME[g["id"]], g["color"]) for g in ONTOLOGY["groups"]
)
STYLE_GROUPS = tuple(key for key, _, _ in GROUPS if key in STYLE_NAME)
MAX_DOTS = 60  # points drawn for one group; a larger group is still counted in full
FULL_PROGRESS = 40  # picks at which a twin's point reaches full size


def balance(reach: dict[str, float]) -> float | None:
    """How evenly a seat has reached across the style groups: 0 = one group only, 1 = all groups equally.
    None until something has been reached. Money plays no part in it."""
    values = [reach.get(k, 0.0) for k in STYLE_GROUPS]
    total = sum(values)
    if total <= 0:
        return None
    shares = [v / total for v in values if v > 0]
    if len(shares) == 1:
        return 0.0
    return round(-sum(p * math.log(p) for p in shares) / math.log(len(STYLE_GROUPS)), 3)


@dataclass(frozen=True)
class Question:
    id: str
    kind: str
    question: str
    card: Card


def load_questions(path: Path = QUESTIONS_PATH) -> list[Question]:
    out = []
    for q in json.loads(path.read_text(encoding="utf-8"))["questions"]:
        options = tuple(Option(o["id"], o["label"], o.get("trait")) for o in q["options"])
        unknown = {o.trait for o in options if o.trait} - KNOWN_TRAITS
        if unknown:
            raise ValueError(f"question {q['id']} uses a trait the ontology does not know: {sorted(unknown)}")
        out.append(Question(q["id"], q["kind"], q["question"], Card(q["id"], "", "question", "market", None, q["question"], options)))
    return out


QUESTIONS = load_questions()
QUESTION_BY_ID = {q.id: q for q in QUESTIONS}


@dataclass(frozen=True)
class TwinFacts:
    """What the market needs to know about one Sym. No nickname, and the id never leaves the server."""
    player_id: str
    sample: bool
    picks: int
    certified: bool
    leading_style: str | None
    trait_counts: dict[str, int]
    topics: frozenset[str] = frozenset()  # the topics this twin holds a belief about


def matches(twin: TwinFacts, audience: str) -> bool:
    if twin.picks < MIN_PICKS:
        return False
    if audience == "all":
        return True
    if audience == "members":  # only twins whose owners chose to earn: no free twins
        return not twin.sample
    if audience == "certified":
        return twin.certified
    if audience.startswith("view-"):
        return audience[5:] in twin.topics
    return twin.leading_style == audience


def answer(question: Question, twin: TwinFacts) -> str:
    """The option whose trait this Sym's human has shown most often. The first option wins a tie."""
    return max(question.card.options, key=lambda o: twin.trait_counts.get(o.trait or "", 0)).id


def skill_traits(skill_id: str) -> frozenset[str]:
    """The traits a skill grows: those of every style and area that names the skill in the ontology."""
    return frozenset(t for g in ONTOLOGY["styles"] + ONTOLOGY["faculties"] if skill_id in g.get("skills", []) for t in g["traits"])


def band(twin: TwinFacts, traits: frozenset[str]) -> str:
    """Where one Sym stands on a skill, from plain counting: the share of its picks that fall in the skill's areas."""
    share = sum(twin.trait_counts.get(t, 0) for t in traits) / max(1, twin.picks)
    return "strong" if share >= TEST_STRONG else "partway" if share >= TEST_PARTWAY else "new"


def tally(question: Question, choices: list[str]) -> dict[str, int]:
    return {o.id: sum(1 for c in choices if c == o.id) for o in question.card.options}
