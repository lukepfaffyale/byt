"""The only module that touches the database.

One SQLModel engine, chosen by DATABASE_URL: unset means a local SQLite file (what a grader runs),
a Postgres URL means the hosted Supabase database. Routes and agents call the typed functions below;
there is no SQL anywhere else, and every player-scoped function takes the player id resolved from
the token.
"""
from __future__ import annotations

import hashlib
import json
import os
import random
import secrets
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import Engine, func, inspect, text
from sqlmodel import Session, SQLModel, create_engine, delete, select, update

from content import CARDS
from models import (ActiveDay, Battle, Feedback, Brief, Campaign, Cert, Consent, AutoWork, Earning, Fact, Lesson, Throw, MadeStep, Meet, OneToOne, Posting, Sponsorship, Org, Player, Prediction,
                    Response, SelfReport, Tendency, Transfer, Usage, Wallet, Work, utcnow)

LOCAL_DB = Path(__file__).resolve().parent / "data" / "local.db"
FREE_PREFIX = "free-"  # a player who left: the login is gone, and the twin stays as an anonymous free twin
SAMPLE_PREFIX = "sample-"  # sample players carry this in place of a token hash, so nobody can sign in as one
# One BOT Sym for each United Nations country. The country is a label for where the bot stands on the map; its
# tastes are random and are not drawn from, or a claim about, the people of that country.
COUNTRIES: list[str] = json.loads((Path(__file__).resolve().parent / "data" / "countries.json").read_text(encoding="utf-8"))["countries"]
SAMPLE_COUNT = len(COUNTRIES)
# The game's own income: on top of everything a seat spends (a question, a job, a meeting, a skill it backs), the
# seat pays this share to the game. Credits held for a job or a skill and later returned get their share back.
PLATFORM_SHARE = 0.10
BOT_FULL = 12  # the first bots have answered every card: the steady crowd that a battle is scored against
_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = os.getenv("DATABASE_URL") or f"sqlite:///{LOCAL_DB.as_posix()}"
        if url.startswith("sqlite"):
            _engine = create_engine(url, connect_args={"check_same_thread": False})
        else:
            # Supabase hands out a plain postgresql:// URL; this project's driver is psycopg 3
            for plain in ("postgresql://", "postgres://"):
                if url.startswith(plain):
                    url = "postgresql+psycopg://" + url[len(plain):]
            # a hosted database drops idle connections: check each one before use, and keep the pool small
            _engine = create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5, pool_recycle=300)
    return _engine


def _lock_tables() -> None:
    """Postgres only: row-level security on for every table of the app, with no policy for any outside role.
    The back end is the only thing that reads or writes rows, so nothing can be reached through Supabase's own
    data API, even with the project's public key. Table names come from the models, never from input."""
    engine = get_engine()
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for name in SQLModel.metadata.tables:
            conn.execute(text(f'ALTER TABLE "{name}" ENABLE ROW LEVEL SECURITY'))


def ensure_schema() -> None:
    """Create the app's tables if they are missing and seed the made-up sample players. Safe on every start."""
    SQLModel.metadata.create_all(get_engine())
    # a column added after the first version: an older database file gets it here. Fixed names, no input.
    if "depth" not in {c["name"] for c in inspect(get_engine()).get_columns("campaigns")}:
        with get_engine().begin() as conn:
            conn.execute(text("ALTER TABLE campaigns ADD COLUMN depth VARCHAR NOT NULL DEFAULT 'blend'"))
    if "scope" not in {c["name"] for c in inspect(get_engine()).get_columns("tendencies")}:
        with get_engine().begin() as conn:
            conn.execute(text("ALTER TABLE tendencies ADD COLUMN scope VARCHAR NOT NULL DEFAULT 'trait'"))
    if "sure" not in {c["name"] for c in inspect(get_engine()).get_columns("responses")}:
        with get_engine().begin() as conn:
            conn.execute(text("ALTER TABLE responses ADD COLUMN sure INTEGER"))
    if "because" not in {c["name"] for c in inspect(get_engine()).get_columns("predictions")}:
        with get_engine().begin() as conn:
            conn.execute(text("ALTER TABLE predictions ADD COLUMN because VARCHAR"))
    _lock_tables()
    seed_samples()


def _bot_cards() -> list:
    return [c for c in CARDS.values() if c.kind in ("preference", "battle")]


def _bot_lean(i: int) -> dict[str, float]:
    """A BOT Sym's fixed leaning for each trait. Drawn from one random spread for every bot: the country it
    carries is a place label only and plays no part in its tastes."""
    traits = sorted({o.trait for c in CARDS.values() for o in c.options if o.trait})
    rng = random.Random(409_000 + i)
    return {t: rng.random() for t in traits}


def _bot_answer(i: int, card, lean: dict[str, float]) -> Response:
    pick = random.Random(f"{i}-{card.id}")
    choice = max(card.options, key=lambda o: lean.get(o.trait or "", 0.5) + pick.random() * 0.25).id
    return Response(player_id="", card_id=card.id, choice=choice, response_ms=pick.randint(700, 4000), held_out=card.kind == "battle")


def bot_name(i: int) -> str:
    return f"BOT Sym {COUNTRIES[i - 1]}"


def seed_samples() -> None:
    """The BOT Syms: one made-up player for each United Nations country, so the game has a crowd and a working
    economy on a fresh copy.

    Each bot has a fixed leaning per trait and picks the option it leans toward. They are generated from fixed
    seeds, are not real people, and cannot be signed in to. The first twelve have answered every card (they are
    the crowd a battle is scored against). The others start part of the way through and play on over time
    (`bot_play`). Safe on every start: a bot that is missing is created.
    """
    cards = _bot_cards()
    with Session(get_engine()) as s:
        have = {p.token_hash: p for p in s.exec(select(Player).where(Player.token_hash.startswith(SAMPLE_PREFIX)))}
        for i in range(1, SAMPLE_COUNT + 1):
            marker = f"{SAMPLE_PREFIX}{i:02d}"
            player = have.get(marker)
            fresh = player is None
            if fresh:
                player = Player(nickname=bot_name(i), token_hash=marker, consent_at=utcnow())
                s.add(player)
                s.flush()
            elif player.nickname != bot_name(i):
                player.nickname = bot_name(i)
                s.add(player)
            if not fresh and i > BOT_FULL:
                continue  # it already exists: it plays on by itself from where it is
            share = 1.0 if i <= BOT_FULL else 0.35 + 0.55 * random.Random(911_000 + i).random()
            done = set() if fresh else set(s.exec(select(Response.card_id).where(Response.player_id == player.id)))
            lean = _bot_lean(i)
            for card in cards[: max(1, round(len(cards) * share))]:
                if card.id in done:
                    continue
                row = _bot_answer(i, card, lean)
                row.player_id = player.id
                s.add(row)
        s.commit()


def bot_play(rng: random.Random, most: int = 6) -> bool:
    """One BOT Sym answers a few more cards, as a person who came back to play would. False when every bot is done."""
    cards = _bot_cards()
    with Session(get_engine()) as s:
        bots = list(s.exec(select(Player).where(Player.token_hash.startswith(SAMPLE_PREFIX))))
        rng.shuffle(bots)
        for player in bots[:12]:
            done = set(s.exec(select(Response.card_id).where(Response.player_id == player.id)))
            todo = [c for c in cards if c.id not in done]
            if not todo:
                continue
            i = int(player.token_hash[len(SAMPLE_PREFIX):])
            lean = _bot_lean(i)
            for card in todo[: rng.randint(2, most)]:
                row = _bot_answer(i, card, lean)
                row.player_id = player.id
                s.add(row)
            s.commit()
            return True
    return False


def bot_ids() -> list[tuple[int, str]]:
    """(number, player id) of every BOT Sym, in order."""
    with Session(get_engine()) as s:
        rows = s.exec(select(Player.token_hash, Player.id).where(Player.token_hash.startswith(SAMPLE_PREFIX))).all()
    return sorted((int(h[len(SAMPLE_PREFIX):]), pid) for h, pid in rows)


def player_by_id(player_id: str) -> Player | None:
    with Session(get_engine()) as s:
        return s.get(Player, player_id)


def iso(ts: datetime) -> str:
    """UTC ISO 8601. SQLite hands back naive datetimes; they were written as UTC."""
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ---------- players ----------

def create_player(nickname: str) -> tuple[Player, str]:
    """Returns the player and the plain token. The token is shown once and only its hash is stored."""
    token = secrets.token_urlsafe(32)
    player = Player(nickname=nickname, token_hash=hash_token(token), consent_at=utcnow())
    with Session(get_engine()) as s:
        s.add(player)
        s.commit()
        s.refresh(player)
    return player, token


def twin_count() -> int:
    """How many Syms exist, the made-up sample Syms included. A count only."""
    with Session(get_engine()) as s:
        return int(s.exec(select(func.count()).select_from(Player)).one())


def people_count() -> int:
    """How many Syms have a living person behind them: every Sym but the BOT Syms and the Syms left behind. A count only."""
    with Session(get_engine()) as s:
        return int(s.exec(select(func.count()).select_from(Player).where(
            ~(Player.token_hash.startswith(SAMPLE_PREFIX) | Player.token_hash.startswith(FREE_PREFIX)))).one())


def player_by_token(token: str) -> Player | None:
    with Session(get_engine()) as s:
        return s.exec(select(Player).where(Player.token_hash == hash_token(token))).first()


def delete_player(player_id: str) -> None:
    """Everything tied to the player goes. Token counts stay, with the link to the player removed."""
    with Session(get_engine()) as s:
        s.exec(update(Usage).where(Usage.player_id == player_id).values(player_id=None))
        for table in (Fact, Throw, Lesson, Prediction, Battle, Cert, Tendency, Response, SelfReport, Work, Earning, Consent, ActiveDay, OneToOne, Meet, AutoWork):
            s.exec(delete(table).where(table.player_id == player_id))
        # An agency the player opened goes too. Other players keep what its questions already paid them,
        # with the link to the campaign removed along with the campaign.
        # Wallets are closed, not removed: the link to the player is cut, and the past moves stay so every sum still holds.
        for wallet in s.exec(select(Wallet).where(Wallet.owner_id == player_id)).all():
            wallet.owner_id, wallet.closed = None, True
            s.add(wallet)
        for org in s.exec(select(Org).where(Org.owner_id == player_id)).all():
            for camp in s.exec(select(Campaign).where(Campaign.org_id == org.id)).all():
                s.exec(update(Earning).where(Earning.campaign_id == camp.id).values(campaign_id=None))
                s.delete(camp)
            for row in list(s.exec(select(Brief).where(Brief.org_id == org.id)).all()) + list(s.exec(select(Meet).where(Meet.org_id == org.id)).all()):
                s.exec(update(Earning).where(Earning.campaign_id == row.id).values(campaign_id=None))
                s.delete(row)
            # a step this seat built closes: it waits for a new maker, and players keep what they earned on it
            s.exec(delete(MadeStep).where(MadeStep.org_id == org.id))
            # a job this seat posted goes too. Credits still held for it stay in the holding wallet, without an owner
            s.exec(delete(Posting).where(Posting.org_id == org.id))
            s.exec(delete(Sponsorship).where(Sponsorship.org_id == org.id))
            s.delete(org)
        s.exec(delete(Player).where(Player.id == player_id))
        s.commit()


# ---------- activity: the days a player used the game ----------

_marked: set[tuple[str, str]] = set()  # (player id, day) already written, so a day costs one write, not one per request


def mark_active(player_id: str) -> None:
    day = utcnow().date().isoformat()
    if (player_id, day) in _marked:
        return
    with Session(get_engine()) as s:
        if not s.exec(select(ActiveDay.id).where(ActiveDay.player_id == player_id, ActiveDay.day == day)).first():
            s.add(ActiveDay(player_id=player_id, day=day))
            s.commit()
    _marked.add((player_id, day))


def days_played(player_id: str) -> list[str]:
    with Session(get_engine()) as s:
        return list(s.exec(select(ActiveDay.day).where(ActiveDay.player_id == player_id).order_by(ActiveDay.day)))


def days_since_active(player_id: str) -> int | None:
    """Whole days since the player last used the game. None if they never have."""
    days = days_played(player_id)
    if not days:
        return None
    return (utcnow().date() - datetime.fromisoformat(days[-1]).date()).days


# ---------- responses ----------

def responses_for(player_id: str) -> list[Response]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Response).where(Response.player_id == player_id).order_by(Response.created_at)))


def picks_on(card_ids: set[str], but: str) -> dict[str, dict[str, str]]:
    """What every other Sym picked on these cards: one dict of card to choice for each. No name leaves this function's caller."""
    if not card_ids:
        return {}
    with Session(get_engine()) as s:
        out: dict[str, dict[str, str]] = {}
        for pid, cid, choice in s.exec(select(Response.player_id, Response.card_id, Response.choice)
                                       .where(Response.card_id.in_(card_ids), Response.player_id != but)).all():
            out.setdefault(pid, {})[cid] = choice
        return out


def answered_card_ids(player_id: str) -> set[str]:
    with Session(get_engine()) as s:
        return set(s.exec(select(Response.card_id).where(Response.player_id == player_id)))


def record_response(
    player_id: str, card_id: str, choice: str, is_correct: bool | None, response_ms: int, points: int, level: int,
    held_out: bool = False, sure: int | None = None,
) -> Player | None:
    """One transaction: the response row and the player's new points and level. None if already answered."""
    with Session(get_engine()) as s:
        dup = s.exec(select(Response.id).where(Response.player_id == player_id, Response.card_id == card_id)).first()
        if dup:
            return None
        s.add(Response(player_id=player_id, card_id=card_id, choice=choice, is_correct=is_correct,
                       response_ms=response_ms, held_out=held_out, sure=sure))
        player = s.get(Player, player_id)
        if player is None:
            return None
        player.points += points
        player.level = level
        s.add(player)
        s.commit()
        s.refresh(player)
        return player


def picks_by_others(card_id: str, player_id: str) -> list[str]:
    """What everyone else picked on a card. Used for the baseline; never includes the player being tested."""
    with Session(get_engine()) as s:
        return list(s.exec(select(Response.choice).where(Response.card_id == card_id, Response.player_id != player_id)))


# ---------- the twin ----------

def tendencies_for(player_id: str) -> list[Tendency]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Tendency).where(Tendency.player_id == player_id).order_by(Tendency.topic)))


def replace_tendencies(player_id: str, drafts: list[tuple]) -> None:
    """drafts: (topic, statement, evidence count) and, when known, the scope: "trait" or "topic"."""
    with Session(get_engine()) as s:
        s.exec(delete(Tendency).where(Tendency.player_id == player_id))
        for topic, statement, count, *rest in drafts:
            s.add(Tendency(player_id=player_id, topic=topic, statement=statement, evidence_count=count,
                           scope=rest[0] if rest and rest[0] in ("trait", "topic") else "trait"))
        s.commit()


def battle_for(player_id: str, gate_id: str) -> Battle | None:
    with Session(get_engine()) as s:
        return s.exec(select(Battle).where(Battle.player_id == player_id, Battle.gate_id == gate_id)).first()


def battles_for(player_id: str) -> list[Battle]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Battle).where(Battle.player_id == player_id).order_by(Battle.created_at)))


def add_feedback(seat: str, moment: str, answer: str) -> None:
    """One tap of product feedback. No player id is written."""
    with Session(get_engine()) as s:
        s.add(Feedback(seat=seat, moment=moment, answer=answer, day=utcnow().date().isoformat()))
        s.commit()


def feedback_counts() -> dict[tuple[str, str], dict[str, int]]:
    with Session(get_engine()) as s:
        out: dict[tuple[str, str], dict[str, int]] = {}
        for seat, moment, answer, n in s.exec(select(Feedback.seat, Feedback.moment, Feedback.answer, func.count())
                                              .group_by(Feedback.seat, Feedback.moment, Feedback.answer)).all():
            out.setdefault((seat, moment), {})[answer] = int(n)
        return out


def finished_battles() -> list[Battle]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Battle).where(Battle.twin_matches != None).order_by(Battle.created_at)))  # noqa: E711


def create_battle(
    player_id: str, gate_id: str, topic: str, twin_kind: str, rows: list[tuple[str, str | None, float, str, str | None]]
) -> Battle:
    """rows: (card id, Sym prediction or None, confidence, baseline choice, the belief leaned on). One transaction."""
    with Session(get_engine()) as s:
        existing = s.exec(select(Battle).where(Battle.player_id == player_id, Battle.gate_id == gate_id)).first()
        if existing:
            return existing
        battle = Battle(player_id=player_id, gate_id=gate_id, topic=topic, n=len(rows), twin_kind=twin_kind)
        s.add(battle)
        s.flush()
        for card_id, predicted, confidence, baseline, because in rows:
            s.add(Prediction(battle_id=battle.id, player_id=player_id, card_id=card_id, predicted=predicted,
                             confidence=confidence, baseline=baseline, because=because))
        s.commit()
        s.refresh(battle)
        return battle


def predictions_for(battle_id: str) -> list[Prediction]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Prediction).where(Prediction.battle_id == battle_id)))


def reveal_prediction(battle_id: str, card_id: str, actual: str) -> Prediction | None:
    with Session(get_engine()) as s:
        row = s.exec(select(Prediction).where(Prediction.battle_id == battle_id, Prediction.card_id == card_id)).first()
        if row is None:
            return None
        row.actual = actual
        s.add(row)
        s.commit()
        s.refresh(row)
        return row


def release_picks(player_id: str, card_ids: list[str]) -> None:
    """After a battle is scored, its picks stop being held back: they become proof the Sym may learn from.
    The score stays honest, because every guess was sealed before the first card was shown."""
    with Session(get_engine()) as s:
        for r in s.exec(select(Response).where(Response.player_id == player_id, Response.held_out == True)).all():  # noqa: E712
            if r.card_id in card_ids:
                r.held_out = False
                s.add(r)
        s.commit()


def clear_answers(player_id: str, card_ids: list[str]) -> int:
    """Remove a player's answers to the cards of one skill gate, so the gate can be tried again. Points stay."""
    with Session(get_engine()) as s:
        rows = [r for r in s.exec(select(Response).where(Response.player_id == player_id)).all() if r.card_id in card_ids]
        for r in rows:
            s.delete(r)
        s.commit()
        return len(rows)


def facts_for(player_id: str) -> list[Fact]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Fact).where(Fact.player_id == player_id).order_by(Fact.created_at)))


def add_fact(player_id: str, scope: str, topic: str, statement: str, most: int) -> bool:
    """Keep one fact. False if the same line is already kept or the player has the most allowed."""
    with Session(get_engine()) as s:
        kept = s.exec(select(Fact).where(Fact.player_id == player_id)).all()
        if len(kept) >= most or any(f.statement == statement for f in kept):
            return False
        s.add(Fact(player_id=player_id, scope=scope, topic=topic, statement=statement))
        s.commit()
        return True


def remove_fact(player_id: str, fact_id: str) -> None:
    with Session(get_engine()) as s:
        row = s.get(Fact, fact_id)
        if row is not None and row.player_id == player_id:
            s.delete(row)
            s.commit()


def throws_for(player_id: str) -> list[Throw]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Throw).where(Throw.player_id == player_id).order_by(Throw.created_at)))


def add_throw(player_id: str, mine: str, twin: str) -> None:
    with Session(get_engine()) as s:
        s.add(Throw(player_id=player_id, mine=mine, twin=twin))
        s.commit()


def throw_histories(least: int) -> dict[str, list[str]]:
    """Every player with enough throws for the league, as the list of what they threw, oldest first."""
    with Session(get_engine()) as s:
        out: dict[str, list[str]] = {}
        for t in s.exec(select(Throw).order_by(Throw.created_at)).all():
            out.setdefault(t.player_id, []).append(t.mine)
        return {pid: thrown for pid, thrown in out.items() if len(thrown) >= least}


def lessons_for(battle_id: str) -> list[Lesson]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Lesson).where(Lesson.battle_id == battle_id).order_by(Lesson.created_at)))


def add_lessons(player_id: str, battle_id: str, drafts: list[tuple[str, str, str, str]]) -> list[Lesson]:
    """drafts: (kind, topic, before, after). Written once for a battle."""
    with Session(get_engine()) as s:
        if s.exec(select(Lesson).where(Lesson.battle_id == battle_id)).first() is None:
            for kind, topic, before, after in drafts:
                s.add(Lesson(player_id=player_id, battle_id=battle_id, kind=kind, topic=topic[:60], before=before[:240], after=after[:240]))
            s.commit()
    return lessons_for(battle_id)


def close_battle(battle_id: str, twin_matches: int, baseline_matches: int) -> None:
    with Session(get_engine()) as s:
        battle = s.get(Battle, battle_id)
        if battle is None:
            return
        battle.twin_matches = twin_matches
        battle.baseline_matches = baseline_matches
        s.add(battle)
        s.commit()


# ---------- certs ----------

def certs_for(player_id: str) -> list[Cert]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Cert).where(Cert.player_id == player_id).order_by(Cert.issued_at)))


def issue_cert(player_id: str, kind: str, topic: str, level: str, accuracy: float, baseline: float | None, n: int) -> Cert:
    """Idempotent: the same cert is never issued twice."""
    with Session(get_engine()) as s:
        cert = s.exec(
            select(Cert).where(Cert.player_id == player_id, Cert.kind == kind, Cert.topic == topic, Cert.level == level)
        ).first()
        if cert is None:
            cert = Cert(player_id=player_id, kind=kind, topic=topic, level=level, accuracy=accuracy, baseline=baseline, n=n)
            s.add(cert)
            s.commit()
            s.refresh(cert)
        return cert


# ---------- the mirror: what the player told us ----------

def self_report_for(player_id: str) -> SelfReport | None:
    with Session(get_engine()) as s:
        return s.get(SelfReport, player_id)


def save_self_report(player_id: str, fields: dict[str, str | int | None]) -> SelfReport:
    """Replaces the whole row: a field left out is cleared."""
    with Session(get_engine()) as s:
        row = s.get(SelfReport, player_id) or SelfReport(player_id=player_id)
        for name in ("ei", "sn", "tf", "jp", "analyse", "organise", "explore", "connect", "sign", "animal"):
            setattr(row, name, fields.get(name))
        row.updated_at = utcnow()
        s.add(row)
        s.commit()
        s.refresh(row)
        return row


def delete_self_report(player_id: str) -> None:
    with Session(get_engine()) as s:
        s.exec(delete(SelfReport).where(SelfReport.player_id == player_id))
        s.commit()


# ---------- work: jobs the twin did ----------

def work_for(player_id: str) -> list[Work]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Work).where(Work.player_id == player_id).order_by(Work.created_at)))


def work_on(player_id: str, job_id: str) -> Work | None:
    with Session(get_engine()) as s:
        return s.exec(select(Work).where(Work.player_id == player_id, Work.job_id == job_id)).first()


def start_work(player_id: str, job_id: str, twin_kind: str, answer: str | None, reason: str) -> Work:
    """Idempotent: a Sym answers a job once."""
    with Session(get_engine()) as s:
        row = s.exec(select(Work).where(Work.player_id == player_id, Work.job_id == job_id)).first()
        if row is None:
            row = Work(player_id=player_id, job_id=job_id, twin_kind=twin_kind, answer=answer, reason=reason)
            s.add(row)
            s.commit()
            s.refresh(row)
        return row


def review_work(player_id: str, job_id: str, verdict: str, final_choice: str, credits: int,
                payer_id: str | None = None, hold: int = 0, reach_to: list[str] | None = None, reach_milli: int = 0) -> Work | None:
    """Sets the verdict and pays once. None if there is nothing to review or it was reviewed already.
    A job an agency posted is paid from the credits held for it, and the rest of that seat's hold goes back."""
    with Session(get_engine()) as s:
        row = s.exec(select(Work).where(Work.player_id == player_id, Work.job_id == job_id)).first()
        if row is None or row.verdict is not None:
            return None
        row.verdict, row.final_choice, row.credits, row.reviewed_at = verdict, final_choice, credits, utcnow()
        s.add(row)
        if payer_id is None:
            _move(s, _wallet(s, None, "requesters"), _wallet(s, player_id, "player"), credits * MILLI, "work", job_id)
        else:
            held = _wallet(s, None, "escrow")
            _move(s, held, _wallet(s, player_id, "player"), credits * MILLI, "work", job_id)
            # the creators whose skill steps this player passed share a royalty, paid by the agency on top of the pay
            makers = reach_to or []
            each = reach_milli // len(makers) if makers else 0
            for maker_id in makers:
                _move(s, held, _wallet(s, maker_id, "creator"), each, "reach", job_id)
            back = (hold - credits) * MILLI - each * len(makers)
            _move(s, held, _wallet(s, payer_id, "agency"), back, "release", job_id)
            _share_back(s, _wallet(s, payer_id, "agency"), back, job_id)
        s.commit()
        s.refresh(row)
        return row


# ---------- jobs an agency posted ----------

def all_postings() -> list[Posting]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Posting).order_by(Posting.created_at)))


def postings_for(org_id: str) -> list[Posting]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Posting).where(Posting.org_id == org_id).order_by(Posting.created_at.desc())))


def posting(job_id: str) -> Posting | None:
    with Session(get_engine()) as s:
        return s.get(Posting, job_id)


def posting_owner(job_id: str) -> str | None:
    """The player who owns the agency that posted this job."""
    with Session(get_engine()) as s:
        row = s.get(Posting, job_id)
        org = s.get(Org, row.org_id) if row else None
        return org.owner_id if org and not has_left(s, org.owner_id) else None  # an owner who left is paid nothing back


def seats_taken(job_id: str) -> int:
    with Session(get_engine()) as s:
        return int(s.exec(select(func.count()).select_from(Work).where(Work.job_id == job_id)).one())


def post_job(org_id: str, question_id: str, pay: int, seats: int, hold: int) -> Posting | None:
    """One transaction: hold the pay for every seat, and open the job. None if the wallet is short."""
    with Session(get_engine()) as s:
        org = s.get(Org, org_id)
        if org is None:
            return None
        purse = _wallet(s, org.owner_id, org.kind)
        if _balance(s, purse.id) < hold * seats * MILLI * (1 + PLATFORM_SHARE):
            return None
        row = Posting(id=f"post-{secrets.token_hex(8)}", org_id=org_id, question_id=question_id, pay=pay, seats=seats, hold=hold)
        s.add(row)
        _move(s, purse, _wallet(s, None, "escrow"), hold * seats * MILLI, "hold", row.id)
        _share(s, purse, hold * seats * MILLI, row.id)
        s.commit()
        s.refresh(row)
        return row


def close_posting(org_id: str, job_id: str) -> bool:
    """Close a job to new Syms. The hold for every seat no Sym took goes back. A Sym that already started is
    still paid when its owner checks the answer. False if there is no such open job."""
    with Session(get_engine()) as s:
        row = s.get(Posting, job_id)
        org = s.get(Org, org_id)
        if row is None or org is None or row.org_id != org_id or row.closed:
            return False
        taken = int(s.exec(select(func.count()).select_from(Work).where(Work.job_id == job_id)).one())
        row.closed = True
        s.add(row)
        back = max(0, row.seats - taken) * row.hold * MILLI
        _move(s, _wallet(s, None, "escrow"), _wallet(s, org.owner_id, org.kind), back, "release", job_id)
        _share_back(s, _wallet(s, org.owner_id, org.kind), back, job_id)
        s.commit()
        return True


def credits_for(player_id: str) -> float:
    """What the player's wallet holds now: everything earned and added, less what was paid out."""
    return wallet_balance(player_id, "player")


def confirmed_choices(job_id: str) -> list[str]:
    """What real players confirmed on a job. Choices only, no player ids."""
    with Session(get_engine()) as s:
        return list(s.exec(select(Work.final_choice).where(Work.job_id == job_id, Work.final_choice.is_not(None))))


def sample_player_ids() -> list[str]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Player.id).where(Player.token_hash.startswith(SAMPLE_PREFIX))))


def picks_of(player_ids: list[str]) -> dict[str, list[tuple[str, str]]]:
    """The picks of many Syms in one query, oldest first: (card, choice) for each. Used where a screen looks at every
    free Sym at once, so it asks the database once and not once for each Sym."""
    out: dict[str, list[tuple[str, str]]] = {pid: [] for pid in player_ids}
    if not player_ids:
        return out
    with Session(get_engine()) as s:
        for pid, card_id, choice in s.exec(select(Response.player_id, Response.card_id, Response.choice)
                                           .where(Response.player_id.in_(player_ids)).order_by(Response.created_at)).all():
            out[pid].append((card_id, choice))
    return out


def free_twin_ids() -> list[str]:
    """Free Syms: anonymous, and not paid. The made-up Syms that fill a small game, and the Syms of players who
    left. A seat may count them in a group. No one can meet one of them one to one."""
    with Session(get_engine()) as s:
        return list(s.exec(select(Player.id).where(Player.token_hash.startswith(SAMPLE_PREFIX)
                                                   | Player.token_hash.startswith(FREE_PREFIX))))


def has_left(s: Session, player_id: str) -> bool:
    row = s.get(Player, player_id)
    return row is None or row.token_hash.startswith(FREE_PREFIX)


def leave(player_id: str) -> None:
    """The player leaves and the Sym joins the collective. The login and the nickname are removed, the wallets are
    closed so nothing more is paid to this person, and what the player told the Sym about themselves is removed.
    The taps, the beliefs, the certificates and everything the player's seats made stay, with no one's name on
    them, so the game goes on for everyone else."""
    with Session(get_engine()) as s:
        player = s.get(Player, player_id)
        if player is None:
            return
        player.token_hash = f"{FREE_PREFIX}{secrets.token_hex(12)}"
        player.nickname = "Free Sym"
        s.add(player)
        # what the person told the twin in words goes with the person: a free twin keeps taps, not sayings
        for table in (Fact, SelfReport, Consent, OneToOne, Meet, AutoWork, ActiveDay):
            s.exec(delete(table).where(table.player_id == player_id))
        s.exec(update(Usage).where(Usage.player_id == player_id).values(player_id=None))
        for wallet in s.exec(select(Wallet).where(Wallet.owner_id == player_id)).all():
            wallet.owner_id, wallet.closed = None, True
            s.add(wallet)
        for org in s.exec(select(Org).where(Org.owner_id == player_id)).all():
            # the seat is released to the collective: what it made stays, it meets no one, and it takes no new twins
            s.exec(delete(Meet).where(Meet.org_id == org.id))
            for posted in s.exec(select(Posting).where(Posting.org_id == org.id)).all():
                posted.closed = True
                s.add(posted)
            for backed in s.exec(select(Sponsorship).where(Sponsorship.org_id == org.id)).all():
                backed.closed = True
                s.add(backed)
        s.commit()


# ---------- the market: consent, agencies, batch questions, passive earnings ----------

def data_income_on(player_id: str) -> bool:
    with Session(get_engine()) as s:
        row = s.get(Consent, player_id)
        return bool(row and row.data_income)


def set_data_income(player_id: str, on: bool) -> None:
    with Session(get_engine()) as s:
        row = s.get(Consent, player_id) or Consent(player_id=player_id)
        row.data_income, row.updated_at = on, utcnow()
        s.add(row)
        s.commit()


def opted_in_player_ids() -> list[str]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Consent.player_id).where(Consent.data_income == True)))  # noqa: E712


def earnings_for(player_id: str) -> list[Earning]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Earning).where(Earning.player_id == player_id).order_by(Earning.created_at)))


def org_for(owner_id: str, kind: str) -> Org | None:
    with Session(get_engine()) as s:
        return s.exec(select(Org).where(Org.owner_id == owner_id, Org.kind == kind)).first()


def create_org(owner_id: str, kind: str, name: str, budget: int) -> Org:
    """Idempotent: one seat of each kind per player."""
    with Session(get_engine()) as s:
        org = s.exec(select(Org).where(Org.owner_id == owner_id, Org.kind == kind)).first()
        if org is None:
            org = Org(owner_id=owner_id, kind=kind, name=name, budget=budget)
            s.add(org)
            # the seat gets its own wallet, with its starting play credits from outside the game
            _move(s, _wallet(s, None, "bank"), _wallet(s, owner_id, kind), budget * MILLI, "grant", None)
            s.commit()
            s.refresh(org)
        return org


def other_org_count(owner_id: str, kind: str) -> int:
    """How many seats of a kind other players have opened. A count only, never a name."""
    with Session(get_engine()) as s:
        return int(s.exec(select(func.count()).select_from(Org).where(Org.kind == kind, Org.owner_id != owner_id)).one())


def earlier_asks(org_id: str, audience: str) -> int:
    with Session(get_engine()) as s:
        return int(s.exec(select(func.count()).select_from(Campaign).where(Campaign.org_id == org_id, Campaign.audience == audience)).one())


def fund_balance(start: int, step_kind: str) -> int:
    """The growth fund: what it started with, plus every extra an agency paid for asking a group again, plus
    what was held back from Syms whose owners had not played lately, minus every bonus it has paid.
    Never stored: it is the balance of the fund's wallet, counted from the moves. (It used to be counted from the
    campaign and earning rows, which went wrong when a player deleted their data: their past pay looked held back.)"""
    with Session(get_engine()) as s:
        fund = _wallet(s, None, "fund")
        s.commit()
        return _balance(s, fund.id) // MILLI


def pay_step_bonus(player_id: str, ref: str, step_kind: str, credits: int, maker_id: str | None = None, royalty: int = 0) -> bool:
    """Pay a growth bonus once for one step, and with it the royalty to the creator who built the step.
    False if it was paid before."""
    with Session(get_engine()) as s:
        if s.exec(select(Earning.id).where(Earning.player_id == player_id, Earning.campaign_id == ref)).first():
            return False
        s.add(Earning(player_id=player_id, campaign_id=ref, kind=step_kind, credits=credits))
        _move(s, _wallet(s, None, "fund"), _wallet(s, player_id, "player"), credits * MILLI, "growth", ref)
        if maker_id is not None:
            _move(s, _wallet(s, None, "fund"), _wallet(s, maker_id, "creator"), royalty * MILLI, "maker", ref)
        s.commit()
        return True


def skill_claims() -> list[Brief]:
    """Every claim on a skill step, by any creator. A step has one claim."""
    with Session(get_engine()) as s:
        return list(s.exec(select(Brief).where(Brief.kind == "skill").order_by(Brief.created_at)))


def made_steps() -> list[MadeStep]:
    with Session(get_engine()) as s:
        return list(s.exec(select(MadeStep)))


def step_owner(pack_id: str) -> str | None:
    """The player who owns the creator seat that built this step."""
    with Session(get_engine()) as s:
        row = s.get(MadeStep, pack_id)
        org = s.get(Org, row.org_id) if row else None
        return org.owner_id if org and not has_left(s, org.owner_id) else None  # an owner who left earns no royalty


def publish_step(org_id: str, pack_id: str, skill: str, counts_json: str, cards_json: str, fee: int) -> Brief | None:
    """One transaction: charge the crew fee, open the step for players, keep the job. None if the wallet is short
    or the step is already built."""
    with Session(get_engine()) as s:
        org = s.get(Org, org_id)
        if org is None or s.get(MadeStep, pack_id) is not None:
            return None
        purse = _wallet(s, org.owner_id, org.kind)
        if _balance(s, purse.id) < fee * MILLI:
            return None
        row = Brief(org_id=org_id, kind="build", topic=skill, audience="", twins=0, sample_twins=0, spent=fee, counts=counts_json)
        s.add(row)
        s.add(MadeStep(id=pack_id, org_id=org_id, cards=cards_json))
        s.flush()
        _move(s, purse, _wallet(s, None, "platform"), fee * MILLI, "crew", row.id)
        s.commit()
        s.refresh(row)
        return row


def maker_income(owner_id: str) -> dict[str, tuple[int, float]]:
    """For each step a creator built: how many royalties came in and their sum in credits. Counted from the moves."""
    with Session(get_engine()) as s:
        mine = _wallet(s, owner_id, "creator")
        s.commit()
        out: dict[str, tuple[int, float]] = {}
        for t in s.exec(select(Transfer).where(Transfer.to_wallet == mine.id, Transfer.kind == "maker")).all():
            n, total = out.get(t.ref or "", (0, 0.0))
            out[t.ref or ""] = (n + 1, round(total + t.amount / MILLI, 2))
        return out


def all_campaigns() -> list[Campaign]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Campaign)))


def campaigns_for(org_id: str) -> list[Campaign]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Campaign).where(Campaign.org_id == org_id).order_by(Campaign.created_at.desc())))


def run_campaign(org_id: str, question_id: str, kind: str, audience: str, pay: int, twins: int, sample_twins: int,
                 counts_json: str, paid: list[tuple[str, int]], spent: int, depth: str = "blend",
                 to_samples: float | None = None) -> Campaign | None:
    """One transaction: charge the agency, store the counts, pay each real Sym. None if the budget is short.
    `spent` may be more than Syms times pay: the extra is the price of asking the same group again."""
    with Session(get_engine()) as s:
        org = s.get(Org, org_id)
        if org is None:
            return None
        purse = _wallet(s, org.owner_id, org.kind)
        if _balance(s, purse.id) < spent * MILLI * (1 + PLATFORM_SHARE):
            return None
        camp = Campaign(org_id=org_id, question_id=question_id, audience=audience, pay=pay, twins=twins,
                        sample_twins=sample_twins, spent=spent, counts=counts_json, depth=depth)
        s.add(org)
        s.add(camp)
        s.flush()
        for pid, credits in paid:  # a twin whose owner has not played lately receives less; see market.activity_share
            s.add(Earning(player_id=pid, campaign_id=camp.id, kind=kind, credits=credits))
            _move(s, purse, _wallet(s, pid, "player"), credits * MILLI, "data", camp.id)
        # the made-up sample twins are paid too, into one wallet of the game; the rest of the price is the
        # extra for asking again plus what was held back from absent owners, and it goes to the growth fund
        free_milli = round((sample_twins * pay if to_samples is None else to_samples) * MILLI)
        _move(s, purse, _wallet(s, None, "samples"), free_milli, "samples", camp.id)
        _move(s, purse, _wallet(s, None, "fund"), spent * MILLI - free_milli - sum(c for _, c in paid) * MILLI, "fund_in", camp.id)
        _share(s, purse, round(spent * MILLI), camp.id)
        s.commit()
        s.refresh(camp)
        return camp


# ---------- the creator's crew jobs, and one to one meetings ----------

def briefs_for(org_id: str) -> list[Brief]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Brief).where(Brief.org_id == org_id).order_by(Brief.created_at.desc())))


def run_brief(org_id: str, kind: str, topic: str, audience: str, twins: int, sample_twins: int, counts_json: str,
              paid: list[tuple[str, int]], to_samples: int, fee: int, fee_kind: str = "crew") -> Brief | None:
    """One transaction: charge the seat, keep the counts, pay each real Sym, pay the game its fee.
    None if the wallet is short."""
    spent = sum(c for _, c in paid) + to_samples + fee
    with Session(get_engine()) as s:
        org = s.get(Org, org_id)
        if org is None:
            return None
        purse = _wallet(s, org.owner_id, org.kind)
        if _balance(s, purse.id) < spent * MILLI + round((spent - fee) * MILLI * PLATFORM_SHARE):
            return None
        row = Brief(org_id=org_id, kind=kind, topic=topic, audience=audience, twins=twins, sample_twins=sample_twins,
                    spent=spent, counts=counts_json)
        s.add(row)
        s.flush()
        for pid, credits in paid:
            s.add(Earning(player_id=pid, campaign_id=row.id, kind="Creator", credits=credits))
            _move(s, purse, _wallet(s, pid, "player"), credits * MILLI, "data", row.id)
        _move(s, purse, _wallet(s, None, "samples"), to_samples * MILLI, "samples", row.id)
        _move(s, purse, _wallet(s, None, "platform"), fee * MILLI, fee_kind, row.id)
        _share(s, purse, (spent - fee) * MILLI, row.id)  # the fee is already the game's; the share is on the rest
        s.commit()
        s.refresh(row)
        return row


def one_to_one_on(player_id: str) -> bool:
    with Session(get_engine()) as s:
        row = s.get(OneToOne, player_id)
        return bool(row and row.on)


def set_one_to_one(player_id: str, on: bool) -> None:
    with Session(get_engine()) as s:
        row = s.get(OneToOne, player_id) or OneToOne(player_id=player_id)
        row.on, row.updated_at = on, utcnow()
        s.add(row)
        s.commit()


def one_to_one_player_ids() -> list[str]:
    with Session(get_engine()) as s:
        return list(s.exec(select(OneToOne.player_id).where(OneToOne.on == True)))  # noqa: E712


def meets_for(org_id: str) -> list[Meet]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Meet).where(Meet.org_id == org_id).order_by(Meet.created_at.desc())))


def times_met(player_id: str) -> int:
    with Session(get_engine()) as s:
        return int(s.exec(select(func.count()).select_from(Meet).where(Meet.player_id == player_id)).one())


def nickname_of(player_id: str) -> str:
    with Session(get_engine()) as s:
        row = s.get(Player, player_id)
        return row.nickname if row else ""


def meet_twin(org_id: str, player_id: str, sample: bool, price: int, fee: int) -> Meet | None:
    """One transaction: the seat pays the royalty to the Sym's owner and the fee to the game. None if short."""
    with Session(get_engine()) as s:
        org = s.get(Org, org_id)
        if org is None:
            return None
        purse = _wallet(s, org.owner_id, org.kind)
        if _balance(s, purse.id) < (price + fee) * MILLI + round(price * MILLI * PLATFORM_SHARE):
            return None
        row = Meet(org_id=org_id, player_id=player_id, paid=price)
        s.add(row)
        s.flush()
        if sample:
            _move(s, purse, _wallet(s, None, "samples"), price * MILLI, "samples", row.id)
        else:
            s.add(Earning(player_id=player_id, campaign_id=row.id, kind="One to one", credits=price))
            _move(s, purse, _wallet(s, player_id, "player"), price * MILLI, "royalty", row.id)
        _move(s, purse, _wallet(s, None, "platform"), fee * MILLI, "crew", row.id)
        _share(s, purse, price * MILLI, row.id)
        s.commit()
        s.refresh(row)
        return row


# ---------- token ledger ----------

def record_usage(row: Usage, usd_per_credit: float | None = None) -> None:
    """Keep the token count. If a price is given and the player's wallet can pay, the wallet pays the token fee.
    A wallet that cannot pay is not charged: the game covers that run, so a new player is never blocked."""
    with Session(get_engine()) as s:
        s.add(row)
        if usd_per_credit and row.player_id and row.cost_usd > 0:
            fee = round(row.cost_usd / usd_per_credit * MILLI)
            purse = _wallet(s, row.player_id, "player")
            if 0 < fee <= _balance(s, purse.id):
                _move(s, purse, _wallet(s, None, "platform"), fee, "fee", row.run_id)
        s.commit()


# ---------- wallets and the ledger: where play credits are, and every move between two wallets ----------

MILLI = 1000  # a move is kept in thousandths of a credit, as a whole number, so sums never drift
SEAT_WALLETS = ("player", "agency", "creator")
GAME_WALLETS = ("bank", "fund", "requesters", "platform", "samples", "escrow")


def _wallet(s: Session, owner_id: str | None, kind: str) -> Wallet:
    """The open wallet of this owner and kind, made on first use. The game's own wallets have no owner."""
    query = select(Wallet).where(Wallet.kind == kind, Wallet.closed == False)  # noqa: E712
    query = query.where(Wallet.owner_id == owner_id) if owner_id is not None else query.where(Wallet.owner_id.is_(None))
    row = s.exec(query).first()
    if row is None:
        row = Wallet(owner_id=owner_id, kind=kind)
        s.add(row)
        s.flush()
    return row


def _move(s: Session, src: Wallet, dst: Wallet, amount: int, kind: str, ref: str | None) -> None:
    if amount > 0:
        s.add(Transfer(from_wallet=src.id, to_wallet=dst.id, amount=amount, kind=kind, ref=ref))


def share_of(credits: float) -> float:
    """The platform share on a spend, in credits."""
    return round(credits * MILLI * PLATFORM_SHARE) / MILLI


def _share(s: Session, purse: Wallet, milli: int, ref: str | None) -> None:
    """The seat pays the game its share of a spend."""
    _move(s, purse, _wallet(s, None, "platform"), round(milli * PLATFORM_SHARE), "share", ref)


def _share_back(s: Session, purse: Wallet, milli: int, ref: str | None) -> None:
    """Held credits came back unused, so the share paid on them comes back too."""
    _move(s, _wallet(s, None, "platform"), purse, round(milli * PLATFORM_SHARE), "share_back", ref)


def _balance(s: Session, wallet_id: str) -> int:
    came = s.exec(select(func.sum(Transfer.amount)).where(Transfer.to_wallet == wallet_id)).one() or 0
    went = s.exec(select(func.sum(Transfer.amount)).where(Transfer.from_wallet == wallet_id)).one() or 0
    return int(came) - int(went)


def wallet_balance(owner_id: str | None, kind: str) -> float:
    """In credits. Counted from the moves each time, never stored."""
    with Session(get_engine()) as s:
        wallet = _wallet(s, owner_id, kind)
        s.commit()
        return round(_balance(s, wallet.id) / MILLI, 2)


def deposit(owner_id: str, kind: str, credits: int) -> None:
    """Play credits come in from outside the game."""
    with Session(get_engine()) as s:
        _move(s, _wallet(s, None, "bank"), _wallet(s, owner_id, kind), credits * MILLI, "deposit", None)
        s.commit()


def wallet_moves(owner_id: str, kind: str) -> list[tuple[datetime, str, str, int, int]]:
    """The moves of one of the caller's own wallets, newest first: when, why, what kind of wallet was on the other
    side, how much (above zero came in), and how many moves were put together. Moves that belong to one event (one
    question paid to many Syms) are one line. The other side is a kind of wallet, never a wallet or a person."""
    with Session(get_engine()) as s:
        mine = _wallet(s, owner_id, kind)
        s.commit()
        kinds = {w.id: w.kind for w in s.exec(select(Wallet)).all()}
        rows = s.exec(select(Transfer).where((Transfer.to_wallet == mine.id) | (Transfer.from_wallet == mine.id))
                      .order_by(Transfer.created_at)).all()
        lines: dict[tuple[str, str, bool], list] = {}
        for t in rows:
            came_in = t.to_wallet == mine.id
            key = (t.kind, t.ref or t.id, came_in)
            other = kinds.get(t.from_wallet if came_in else t.to_wallet, "")
            line = lines.setdefault(key, [t.created_at, t.kind, other, 0, 0])
            line[3] += t.amount if came_in else -t.amount
            line[4] += 1
        return sorted((tuple(v) for v in lines.values()), key=lambda v: v[0], reverse=True)


def ledger_total() -> int:
    """Every move leaves one wallet and enters another, so all balances together are always zero."""
    with Session(get_engine()) as s:
        return sum(_balance(s, w.id) for w in s.exec(select(Wallet)).all())


def ensure_ledger(fund_start: int, step_kind: str) -> None:
    """Runs at every start. The growth fund gets its starting credits once. A database from before wallets existed
    has its past money written into the ledger once, so old and new numbers agree."""
    with Session(get_engine()) as s:
        if s.exec(select(Transfer.id)).first() is not None:
            return
        bank, fund = _wallet(s, None, "bank"), _wallet(s, None, "fund")
        _move(s, bank, fund, fund_start * MILLI, "grant", "fund")
        for w in s.exec(select(Work).where(Work.credits > 0)).all():
            _move(s, _wallet(s, None, "requesters"), _wallet(s, w.player_id, "player"), w.credits * MILLI, "work", w.job_id)
        for org in s.exec(select(Org)).all():
            purse = _wallet(s, org.owner_id, org.kind)
            camps = s.exec(select(Campaign).where(Campaign.org_id == org.id)).all()
            # the budget column used to go down with each question; what the seat began with is both together
            _move(s, bank, purse, (org.budget + sum(c.spent for c in camps)) * MILLI, "grant", None)
            for camp in camps:
                paid = s.exec(select(Earning).where(Earning.campaign_id == camp.id)).all()
                for e in paid:
                    _move(s, purse, _wallet(s, e.player_id, "player"), e.credits * MILLI, "data", camp.id)
                to_samples = camp.sample_twins * camp.pay
                _move(s, purse, _wallet(s, None, "samples"), to_samples * MILLI, "samples", camp.id)
                _move(s, purse, fund, (camp.spent - to_samples - sum(e.credits for e in paid)) * MILLI, "fund_in", camp.id)
        for e in s.exec(select(Earning).where(Earning.kind == step_kind)).all():
            _move(s, fund, _wallet(s, e.player_id, "player"), e.credits * MILLI, "growth", e.campaign_id)
        # data income whose agency was deleted: the campaign is gone, the credits stay with the player
        for e in s.exec(select(Earning).where(Earning.kind != step_kind, Earning.campaign_id.is_(None))).all():
            _move(s, bank, _wallet(s, e.player_id, "player"), e.credits * MILLI, "data", None)
        s.commit()


def tokens_last_day() -> int:
    since = utcnow() - timedelta(hours=24)
    with Session(get_engine()) as s:
        total = s.exec(select(func.sum(Usage.input_tokens + Usage.output_tokens)).where(Usage.created_at >= since)).one()
        return int(total or 0)


def usage_rows() -> list[Usage]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Usage)))


def trait_counts(player_id: str, *, include_held_out: bool = False) -> dict[str, int]:
    """How often the player picked each trait, from the picks the Sym is allowed to see."""
    counts: Counter[str] = Counter()
    for r in responses_for(player_id):
        if r.held_out and not include_held_out:
            continue
        card = CARDS.get(r.card_id)
        if card is None or card.kind not in ("preference", "battle"):  # a battle pick counts once it is released
            continue
        trait = next((o.trait for o in card.options if o.id == r.choice), None)
        if trait:
            counts[trait] += 1
    return dict(counts)


# ---------- the loops between seats ----------

def makers_reached(player_id: str) -> list[str]:
    """The owners, still in the game, of the creator seats whose built steps this player passed. Never the player."""
    with Session(get_engine()) as s:
        refs = s.exec(select(Earning.campaign_id).where(Earning.player_id == player_id, Earning.campaign_id.startswith("step:"))).all()
        out: list[str] = []
        for ref in refs:
            row = s.get(MadeStep, (ref or "")[5:])
            org = s.get(Org, row.org_id) if row else None
            if org and org.owner_id != player_id and org.owner_id not in out and not has_left(s, org.owner_id):
                out.append(org.owner_id)
        return out


def came_in(owner_id: str, seat: str, kind: str) -> float:
    """Credits of one kind that came into one of a person's wallets. Counted from the moves."""
    with Session(get_engine()) as s:
        mine = _wallet(s, owner_id, seat)
        s.commit()
        total = s.exec(select(func.sum(Transfer.amount)).where(Transfer.to_wallet == mine.id, Transfer.kind == kind)).one() or 0
        return round(int(total) / MILLI, 2)


def sponsor(org_id: str, skill: str, budget: int) -> Sponsorship | None:
    """One transaction: hold the budget and open the sponsorship. None if the wallet is short."""
    with Session(get_engine()) as s:
        org = s.get(Org, org_id)
        if org is None:
            return None
        purse = _wallet(s, org.owner_id, org.kind)
        if _balance(s, purse.id) < budget * MILLI * (1 + PLATFORM_SHARE):
            return None
        row = Sponsorship(org_id=org_id, skill=skill, budget=budget)
        s.add(row)
        s.flush()
        _move(s, purse, _wallet(s, None, "escrow"), budget * MILLI, "hold", row.id)
        _share(s, purse, budget * MILLI, row.id)
        s.commit()
        s.refresh(row)
        return row


def sponsorships_for(org_id: str) -> list[Sponsorship]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Sponsorship).where(Sponsorship.org_id == org_id).order_by(Sponsorship.created_at.desc())))


def open_sponsorships() -> list[Sponsorship]:
    with Session(get_engine()) as s:
        return list(s.exec(select(Sponsorship).where(Sponsorship.closed == False).order_by(Sponsorship.created_at)))  # noqa: E712


def pay_sponsor(skill: str, player_id: str, maker_id: str | None, to_player: int, to_maker: int) -> int:
    """A player passed a built step of a sponsored skill. The oldest open sponsorship of that skill, not the
    player's own, pays the player and the creator. When it cannot pay another pass it closes and what is left
    goes back to the agency. Returns the credits paid to the player."""
    with Session(get_engine()) as s:
        for row in s.exec(select(Sponsorship).where(Sponsorship.skill == skill, Sponsorship.closed == False)  # noqa: E712
                          .order_by(Sponsorship.created_at)).all():
            org = s.get(Org, row.org_id)
            if org is None or org.owner_id == player_id or has_left(s, org.owner_id):
                continue
            cost = to_player + (to_maker if maker_id else 0)
            if row.budget - row.spent < cost:
                continue
            held = _wallet(s, None, "escrow")
            _move(s, held, _wallet(s, player_id, "player"), to_player * MILLI, "sponsor", row.id)
            if maker_id:
                _move(s, held, _wallet(s, maker_id, "creator"), to_maker * MILLI, "sponsor", row.id)
            row.spent += cost
            row.passes += 1
            if row.budget - row.spent < to_player + to_maker:
                row.closed = True
                _move(s, held, _wallet(s, org.owner_id, org.kind), (row.budget - row.spent) * MILLI, "release", row.id)
                _share_back(s, _wallet(s, org.owner_id, org.kind), (row.budget - row.spent) * MILLI, row.id)
            s.add(row)
            s.commit()
            return to_player
        return 0


def auto_limit(player_id: str) -> int:
    with Session(get_engine()) as s:
        row = s.get(AutoWork, player_id)
        return row.per_day if row else 0


def set_auto(player_id: str, per_day: int) -> None:
    with Session(get_engine()) as s:
        row = s.get(AutoWork, player_id) or AutoWork(player_id=player_id)
        row.per_day, row.updated_at = per_day, utcnow()
        s.add(row)
        s.commit()


def work_started_today(player_id: str) -> int:
    start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    with Session(get_engine()) as s:
        return int(s.exec(select(func.count()).select_from(Work).where(Work.player_id == player_id, Work.created_at >= start)).one())


def world() -> dict:
    """The whole game as totals: how many of each thing, and how many credits moved between kinds of wallet.
    Nothing here names a player, a seat or an answer."""
    with Session(get_engine()) as s:
        kinds = {w.id: w.kind for w in s.exec(select(Wallet)).all()}
        flows: dict[tuple[str, str], list[int]] = {}
        balances: dict[str, int] = {}
        last = None
        for t in s.exec(select(Transfer)).all():
            a, b = kinds.get(t.from_wallet, ""), kinds.get(t.to_wallet, "")
            f = flows.setdefault((a, b), [0, 0])
            f[0] += t.amount
            f[1] += 1
            balances[a] = balances.get(a, 0) - t.amount
            balances[b] = balances.get(b, 0) + t.amount
            last = t.created_at if last is None or t.created_at > last else last

        def count(table, *where) -> int:
            return int(s.exec(select(func.count()).select_from(table).where(*where)).one())

        players = count(Player)
        free = count(Player, Player.token_hash.startswith(SAMPLE_PREFIX) | Player.token_hash.startswith(FREE_PREFIX))
        members = count(Consent, Consent.data_income == True)  # noqa: E712
        return {
            "twins_members": members, "twins_free": free, "twins_forming": max(0, players - free - members),
            "agencies": count(Org, Org.kind == "agency"), "creators": count(Org, Org.kind == "creator"),
            "built_steps": count(MadeStep), "open_jobs": count(Posting, Posting.closed == False),  # noqa: E712
            "sponsors": count(Sponsorship, Sponsorship.closed == False),  # noqa: E712
            "certs_twin": count(Cert, Cert.kind == "twin"), "certs_skill": count(Cert, Cert.kind == "skill"),
            "certs_insight": count(Cert, Cert.kind == "insight"),
            "checked_answers": count(Work, Work.verdict.is_not(None)), "corrections": count(Work, Work.verdict == "corrected"),
            "agent_runs": count(Usage), "agent_cost_usd": round(float(s.exec(select(func.sum(Usage.cost_usd))).one() or 0), 4),
            "flows": [{"src": a, "dst": b, "credits": round(v[0] / MILLI, 2), "moves": v[1]} for (a, b), v in flows.items()],
            "balances": {k: round(v / MILLI, 2) for k, v in balances.items()},
            "last_move": iso(last) if last else None,
        }


def commons(player_id: str, most: int = 8) -> dict:
    """Who is here and what is known together, for the first screen a player sees. Counts, plus the newest
    happenings as (time, who, words, whether the reader did it). No name, answer or id leaves this function."""
    with Session(get_engine()) as s:
        def count(table, *where) -> int:
            return int(s.exec(select(func.count()).select_from(table).where(*where)).one())

        stand = set(s.exec(select(Player.id).where(Player.token_hash.startswith(SAMPLE_PREFIX) | Player.token_hash.startswith(FREE_PREFIX))))
        people = count(Player) - len(stand)
        bots = set(s.exec(select(Player.id).where(Player.token_hash.startswith(SAMPLE_PREFIX))))
        real = lambda col: col.not_in(stand)  # noqa: E731
        today = utcnow().date().isoformat()
        tally = {}
        for name, table, where in (("taps", Response, ()), ("checks", Work, (Work.verdict.is_not(None),)), ("told", Fact, ()),
                                   ("lessons", Lesson, ())):
            tally[name] = count(table, real(table.player_id), *where)
            tally[name + "_mine"] = count(table, table.player_id == player_id, *where)
        orgs = {o.id: (o.kind, o.owner_id) for o in s.exec(select(Org)).all()}
        seen: list[tuple[datetime, str, str, bool]] = []

        def newest(table, stamp, *where):
            return s.exec(select(table).where(*where).order_by(stamp.desc()).limit(most)).all()

        for p in newest(Player, Player.created_at, real(Player.id)):
            seen.append((p.created_at, "person", "A new person joined.", p.id == player_id))
        for c in newest(Cert, Cert.issued_at, real(Cert.player_id)):
            words = {"twin": "A Sym proved it knows its person.", "skill": "A person earned proof of a skill."}.get(c.kind, "New proof was earned.")
            seen.append((c.issued_at, "sym" if c.kind == "twin" else "person", words, c.player_id == player_id))
        for w in newest(Work, Work.reviewed_at, Work.reviewed_at.is_not(None), real(Work.player_id)):
            words = "A person corrected their Sym. It knows more now." if w.verdict == "corrected" else "A person checked their Sym. It was right."
            seen.append((w.reviewed_at, "person", words, w.player_id == player_id))
        battles = set()
        for le in newest(Lesson, Lesson.created_at, real(Lesson.player_id)):
            if le.battle_id not in battles:
                battles.add(le.battle_id)
                seen.append((le.created_at, "sym", "A Sym was wrong, and it learned.", le.player_id == player_id))
        for f in newest(Fact, Fact.created_at, real(Fact.player_id)):
            seen.append((f.created_at, "person", "A person told their Sym something new.", f.player_id == player_id))
        for c in newest(Campaign, Campaign.created_at):
            n = c.twins  # every Sym asked; the BOT Syms are part of this count
            who = "A BOT agency" if orgs.get(c.org_id, ("", ""))[1] in bots else "An agency"
            seen.append((c.created_at, "agency", f"{who} asked {n} Syms a question.", orgs.get(c.org_id, ("", ""))[1] == player_id))
        for b in newest(Brief, Brief.created_at, Brief.kind.in_(("survey", "test"))):
            n = b.twins
            who = "A BOT creator" if orgs.get(b.org_id, ("", ""))[1] in bots else "A creator"
            seen.append((b.created_at, "creator", f"{who} asked {n} Syms a question.", orgs.get(b.org_id, ("", ""))[1] == player_id))
        for m in newest(MadeStep, MadeStep.created_at):
            seen.append((m.created_at, "creator", "A creator built a new skill step.", orgs.get(m.org_id, ("", ""))[1] == player_id))
        for j in newest(Posting, Posting.created_at):
            seen.append((j.created_at, "agency", "An agency posted a job for Syms.", orgs.get(j.org_id, ("", ""))[1] == player_id))
        # the newest play by a BOT Sym, once for each bot, said as what it is
        played: set[str] = set()
        for r in newest(Response, Response.created_at, Response.player_id.in_(bots)):
            if r.player_id not in played and len(played) < 2:
                played.add(r.player_id)
                seen.append((r.created_at, "sym", "A BOT Sym played a few cards.", False))
        seen.sort(key=lambda row: row[0], reverse=True)
        known = tally["taps"] + tally["checks"] + tally["told"] + tally["lessons"]
        mine = tally["taps_mine"] + tally["checks_mine"] + tally["told_mine"] + tally["lessons_mine"]
        return {
            "people": people, "stand_ins": len(stand), "bots": len(bots),
            "bot_agencies": sum(1 for kind, owner in orgs.values() if kind == "agency" and owner in bots),
            "bot_creators": sum(1 for kind, owner in orgs.values() if kind == "creator" and owner in bots),
            "people_today": count(ActiveDay, ActiveDay.day == today, real(ActiveDay.player_id)),
            "agencies": sum(1 for kind, _ in orgs.values() if kind == "agency"),
            "creators": sum(1 for kind, _ in orgs.values() if kind == "creator"),
            "taps": tally["taps"], "checks": tally["checks"], "told": tally["told"], "lessons": tally["lessons"],
            "proofs": count(Cert, real(Cert.player_id)), "beliefs": count(Tendency, real(Tendency.player_id)),
            "known": known, "known_mine": mine, "happenings": seen[:most], "taps_mine": tally["taps_mine"],
            "checks_mine": tally["checks_mine"], "told_mine": tally["told_mine"], "lessons_mine": tally["lessons_mine"],
            "has_agency": any(kind == "agency" and owner == player_id for kind, owner in orgs.values()),
            "has_creator": any(kind == "creator" and owner == player_id for kind, owner in orgs.values()),
        }


def ripple(player_id: str) -> dict:
    """Counts of what one person set moving: as a player, as an agency and as a creator. Every number is that
    person's own rows, or a count of other people with no name and no answer."""
    with Session(get_engine()) as s:
        orgs = {o.kind: o for o in s.exec(select(Org).where(Org.owner_id == player_id)).all()}
        agency, creator = orgs.get("agency"), orgs.get("creator")
        camp_org = {c.id: c.org_id for c in s.exec(select(Campaign)).all()}
        step_org = {"step:" + m.id: m.org_id for m in s.exec(select(MadeStep)).all()}
        out = {"agency": agency is not None, "creator": creator is not None, "taps": 0, "checks": 0, "check_credits": 0,
               "asks": 0, "ask_credits": 0, "own_asks": 0, "own_ask_credits": 0, "steps_passed": 0, "own_steps_passed": 0,
               "campaigns": 0, "syms_asked": 0, "people_paid": 0, "paid_credits": 0, "jobs": 0, "jobs_checked": 0, "job_credits": 0,
               "backed_passes": 0, "backed_credits": 0, "built": 0, "passes": 0, "royalties": 0.0, "crew_asked": 0}
        out["taps"] = int(s.exec(select(func.count()).select_from(Response).where(Response.player_id == player_id)).one())
        for w in s.exec(select(Work).where(Work.player_id == player_id, Work.verdict.is_not(None))).all():
            out["checks"] += 1
            out["check_credits"] += w.credits
        for e in s.exec(select(Earning).where(Earning.player_id == player_id)).all():
            ref = e.campaign_id or ""
            if ref in camp_org:
                own = agency is not None and camp_org[ref] == agency.id
                out["own_asks" if own else "asks"] += 1
                out["own_ask_credits" if own else "ask_credits"] += e.credits
            elif ref in step_org:
                out["own_steps_passed" if creator is not None and step_org[ref] == creator.id else "steps_passed"] += 1
        if agency is not None:
            mine = [c for c in s.exec(select(Campaign).where(Campaign.org_id == agency.id)).all()]
            out["campaigns"], out["syms_asked"] = len(mine), sum(c.twins for c in mine)
            paid = s.exec(select(Earning).where(Earning.campaign_id.in_([c.id for c in mine]), Earning.player_id != player_id)).all()
            out["people_paid"], out["paid_credits"] = len({e.player_id for e in paid}), sum(e.credits for e in paid)
            posts = [p.id for p in s.exec(select(Posting).where(Posting.org_id == agency.id)).all()]
            done = s.exec(select(Work).where(Work.job_id.in_(posts), Work.verdict.is_not(None))).all()
            out["jobs"], out["jobs_checked"], out["job_credits"] = len(posts), len(done), sum(w.credits for w in done)
            backed = s.exec(select(Sponsorship).where(Sponsorship.org_id == agency.id)).all()
            out["backed_passes"], out["backed_credits"] = sum(b.passes for b in backed), sum(b.spent for b in backed)
        if creator is not None:
            refs = [ref for ref, org_id in step_org.items() if org_id == creator.id]
            out["built"] = len(refs)
            out["passes"] = int(s.exec(select(func.count()).select_from(Earning).where(Earning.campaign_id.in_(refs), Earning.player_id != player_id)).one())
            crew = s.exec(select(Brief).where(Brief.org_id == creator.id, Brief.kind.in_(("survey", "test")))).all()
            out["crew_asked"] = sum(b.twins for b in crew)
    if out["creator"]:
        out["royalties"] = round(sum(total for _, total in maker_income(player_id).values()), 2)
    return out
