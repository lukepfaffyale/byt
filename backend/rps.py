"""Rock, paper, scissors against your own Sym, and Sym against Sym. Plain code, no model, no tokens.

The Sym learns one thing here: how its human throws. Before each round it reads every earlier throw, works out
the throw it expects next, and plays the throw that beats it. It never sees the new throw first: its throw is
computed from the stored history alone. In the league, each Sym throws the way its owner throws.
"""
from __future__ import annotations

import hashlib
import random
from collections import Counter

THROWS = ("r", "p", "s")
NAME = {"r": "rock", "p": "paper", "s": "scissors"}
BEATS = {"r": "s", "p": "r", "s": "p"}  # the key beats the value
COUNTER = {loser: winner for winner, loser in BEATS.items()}  # COUNTER[x] is the throw that beats x
ARENA_MIN = 10  # throws a player must have made before their twin plays other twins
MATCH_ROUNDS = 21  # rounds in one twin against twin match
MIN_SEEN = 2  # times a pattern must have been seen before the twin trusts it


def expect(history: list[str]) -> tuple[str | None, str]:
    """The throw the Sym expects next, and why, in words the human can check against their own play.
    It looks for what followed the last two throws, then the last one, then the throw used most."""
    for depth in (2, 1):
        if len(history) <= depth:
            continue
        last = history[-depth:]
        after = Counter(history[i + depth] for i in range(len(history) - depth) if history[i:i + depth] == last)
        seen = sum(after.values())
        if seen >= MIN_SEEN:
            top, n = after.most_common(1)[0]
            said = " then ".join(NAME[t] for t in last)
            return top, f"After {said}, you threw {NAME[top]} {n} of {seen} times. So I played {NAME[COUNTER[top]]}."
    if history:
        top, n = Counter(history).most_common(1)[0]
        return top, f"You throw {NAME[top]} most: {n} of {len(history)} times. So I played {NAME[COUNTER[top]]}."
    return None, "I have not seen you throw yet, so I guessed."


def twin_throw(history: list[str]) -> tuple[str, str]:
    """What the Sym plays against its human, and why. With nothing to go on it starts with paper."""
    expected, why = expect(history)
    return (COUNTER[expected] if expected else "p"), why


def outcome(mine: str, twin: str) -> str:
    if mine == twin:
        return "draw"
    return "you" if BEATS[mine] == twin else "twin"


def tells(history: list[str]) -> list[tuple[str, str, int, int]]:
    """The habits the Sym leans on most: (after this throw, you throw this, how often, out of how many)."""
    out = []
    for prev in THROWS:
        after = Counter(history[i + 1] for i in range(len(history) - 1) if history[i] == prev)
        seen = sum(after.values())
        if seen >= 3:
            top, n = after.most_common(1)[0]
            out.append((prev, top, n, seen))
    return sorted(out, key=lambda t: t[2] / t[3], reverse=True)


def mimic(history: list[str], own_last: str | None, rng: random.Random) -> str:
    """Throw the way this Sym's human throws: what they tend to throw after their own last throw."""
    after = [history[i + 1] for i in range(len(history) - 1) if history[i] == own_last] if own_last else []
    pool = after if len(after) >= MIN_SEEN else history
    return rng.choice(pool) if pool else rng.choice(THROWS)


def match(a: list[str], b: list[str], seed: str) -> tuple[int, int, int]:
    """One match between two Syms: (wins for a, wins for b, draws). The same two histories give the same match."""
    rng = random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:12], 16))
    last_a = last_b = None
    wins_a = wins_b = draws = 0
    for _ in range(MATCH_ROUNDS):
        last_a, last_b = mimic(a, last_a, rng), mimic(b, last_b, rng)
        result = outcome(last_a, last_b)
        wins_a += result == "you"
        wins_b += result == "twin"
        draws += result == "draw"
    return wins_a, wins_b, draws


def sample_history(index: int) -> list[str]:
    """A made-up Sym's habits, fixed by its number: each one leans on one throw and may repeat itself."""
    rng = random.Random(1000 + index)
    weights = [[5, 3, 2], [2, 5, 3], [3, 2, 5]][index % 3]
    out: list[str] = []
    for _ in range(30):
        if out and index % 2 and rng.random() < 0.4:
            out.append(out[-1])
        else:
            out.append(rng.choices(THROWS, weights)[0])
    return out
