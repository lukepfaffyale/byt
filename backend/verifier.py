"""The verifier: plain code, no model. It decides what counts as proof.

- the baseline every twin must beat ("always guess the popular pick"),
- a zero-token rule-of-thumb twin, used when the model is unavailable and as a cost comparison,
- the score of a battle and whether it earns a certificate,
- skill certificates straight from play.

A model can never issue, raise or word a certificate; it only supplies predictions that are scored here.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from content import Card

MIN_BATTLE_CARDS = 8
MIN_TWIN_ACCURACY = 0.6
SKILL_PASS_SHARE = 2 / 3
MAX_LUCK = 0.02  # a certificate needs a score that plain guessing would reach at most this often


def popular_choice(card: Card, picks_by_others: list[str]) -> str:
    """The option most other players picked. Ties and no data fall back to the first option, so the
    baseline is always defined and never depends on the player being tested."""
    counts = Counter(p for p in picks_by_others if p in {o.id for o in card.options})
    best = max(counts.values(), default=0)
    for o in card.options:
        if counts.get(o.id, 0) == best:
            return o.id
    return card.options[0].id


def rule_of_thumb(card: Card, trait_counts: dict[str, int], fallback: str) -> str:
    """Zero-token twin: pick the option whose trait the player has shown most often."""
    scored = [(trait_counts.get(o.trait or "", 0), o.id) for o in card.options]
    top = max(s for s, _ in scored)
    winners = [oid for s, oid in scored if s == top]
    return winners[0] if len(winners) == 1 and top > 0 else fallback


@dataclass(frozen=True)
class BattleScore:
    n: int
    twin_matches: int
    baseline_matches: int

    @property
    def accuracy(self) -> float:
        return self.twin_matches / self.n if self.n else 0.0

    @property
    def baseline_accuracy(self) -> float:
        return self.baseline_matches / self.n if self.n else 0.0


def score_battle(rows: list[tuple[str | None, str, str]]) -> BattleScore:
    """rows: (twin prediction or None, baseline choice, the player's real pick)."""
    return BattleScore(
        n=len(rows),
        twin_matches=sum(1 for predicted, _, actual in rows if predicted is not None and predicted == actual),
        baseline_matches=sum(1 for _, baseline, actual in rows if baseline == actual),
    )


def earns_twin_cert(score: BattleScore, twin_kind: str) -> tuple[bool, str]:
    """A twin cert needs the real twin, enough cards, a clear win over the baseline and a floor on accuracy."""
    if twin_kind != "model":
        return False, "This was the practice twin. It does not use AI, so it cannot earn a certificate."
    if score.n < MIN_BATTLE_CARDS:
        return False, "There were too few cards to earn a certificate."
    if score.twin_matches <= score.baseline_matches:
        return False, "Your twin did not beat the crowd's guess yet. Play more gates to teach it, and it can try again."
    if score.accuracy < MIN_TWIN_ACCURACY:
        return False, "Your twin beat the crowd's guess, but it needs more right answers to earn a certificate."
    return True, "Your twin beat the crowd's guess. It earned a certificate."


def luck(option_counts: list[int], need: int) -> float:
    """The chance of getting at least `need` cards right by tapping at random, one option count for each card."""
    reach = [1.0] + [0.0] * len(option_counts)  # reach[k]: the chance of exactly k right so far
    for options in option_counts:
        p = 1 / max(1, options)
        reach = [reach[k] * (1 - p) + (reach[k - 1] * p if k else 0.0) for k in range(len(reach))]
    return sum(reach[need:])


def cert_need(option_counts: list[int]) -> int | None:
    """How many cards must be right to earn a skill certificate: at least two of three, and enough that guessing
    would get there at most MAX_LUCK of the time. None when even a full score could be luck (too few cards)."""
    total = len(option_counts)
    for need in range(max(1, -(-total * 2 // 3)), total + 1):
        if luck(option_counts, need) <= MAX_LUCK:
            return need
    return None


def earns_skill_cert(correct: int, option_counts: list[int]) -> bool:
    """A certificate is earned by a score that shows the skill. It cannot be bought and it is not given for luck."""
    need = cert_need(option_counts)
    return need is not None and correct >= need
