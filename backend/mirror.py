"""The mirror: where a player's picks place them on frameworks people already know.

All code, no model, no tokens. The cards and the names are ours; this is not the official test of
any publisher, and the screen says so. A result is "suggested" until there are enough picks, and what
a player tells us about themselves is kept apart as "told by you".
"""
from __future__ import annotations

from dataclasses import dataclass

from content import CARDS, ONTOLOGY

FULL_EVIDENCE = 30  # this many cards touching an area fill its part of the sphere
MIN_PICKS = 3  # fewer picks than this on an axis and the letter stays open

# Read from the ontology, so a new gate or a new tag changes the mirror without touching this file.
# (first letter, second letter, trait for the first, trait for the second, plain name)
AXES: tuple[tuple[str, str, str, str, str], ...] = tuple(
    (a["first"]["letter"], a["second"]["letter"], a["first"]["trait"], a["second"]["trait"], a["name"])
    for a in ONTOLOGY["axes"]
)
STYLES: tuple[tuple[str, str, frozenset[str]], ...] = tuple(
    (s["id"], s["name"], frozenset(s["traits"])) for s in ONTOLOGY["styles"]
)
FACULTIES: tuple[tuple[str, str, frozenset[str]], ...] = tuple(
    (f["id"], f["name"], frozenset(f["traits"])) for f in ONTOLOGY["faculties"] if f["traits"]
)
REGION = {f["id"]: f["region"] for f in ONTOLOGY["faculties"]}
INFO = {g["id"]: g for g in ONTOLOGY["styles"] + ONTOLOGY["faculties"]}

SIGNS = ("aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn",
         "aquarius", "pisces")
ANIMALS = ("rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig")


@dataclass(frozen=True)
class AxisRead:
    name: str
    first: str
    second: str
    first_picks: int
    second_picks: int
    letter: str | None  # None while the axis is open (too few picks, or an even split)


@dataclass(frozen=True)
class StyleRead:
    key: str
    name: str
    picks: int
    chances: int  # how many answered cards offered this style at all

    @property
    def share(self) -> float:
        return self.picks / self.chances if self.chances else 0.0


def read_axes(picks: list[tuple[str, str]]) -> list[AxisRead]:
    """picks: (card id, chosen option id) for every card the player answered."""
    counts: dict[str, int] = {}
    for card_id, choice in picks:
        card = CARDS.get(card_id)
        if card is None:
            continue
        trait = next((o.trait for o in card.options if o.id == choice), None)
        if trait:
            counts[trait] = counts.get(trait, 0) + 1
    out = []
    for first, second, t1, t2, name in AXES:
        a, b = counts.get(t1, 0), counts.get(t2, 0)
        letter = None if a + b < MIN_PICKS or a == b else (first if a > b else second)
        out.append(AxisRead(name, first, second, a, b, letter))
    return out


def read_styles(picks: list[tuple[str, str]], groups: tuple[tuple[str, str, frozenset[str]], ...] = STYLES) -> list[StyleRead]:
    """Share of the chances taken, so a style offered on more cards does not win by volume."""
    got = {key: 0 for key, _, _ in groups}
    chances = {key: 0 for key, _, _ in groups}
    for card_id, choice in picks:
        card = CARDS.get(card_id)
        if card is None:
            continue
        offered = {o.trait for o in card.options if o.trait}
        chosen = next((o.trait for o in card.options if o.id == choice), None)
        for key, _, traits in groups:
            if offered & traits:
                chances[key] += 1
                if chosen in traits:
                    got[key] += 1
    return [StyleRead(key, name, got[key], chances[key]) for key, name, _ in groups]


def suggested_type(axes: list[AxisRead]) -> str:
    """Four characters; a dot where the axis is still open."""
    return "".join(a.letter or "." for a in axes)


def top_styles(styles: list[StyleRead]) -> list[str]:
    """Keys of the leading style or styles. Empty until every style has had enough chances."""
    if any(s.chances < MIN_PICKS for s in styles):
        return []
    best = max(s.share for s in styles)
    return [s.key for s in styles if s.share == best] if best > 0 else []


def axis_verdict(suggested: str | None, told: str | None) -> str:
    if told is None:
        return "not told"
    if suggested is None:
        return "open"
    return "aligned" if suggested == told else "differs"


def style_verdict(suggested_top: list[str], told_bands: dict[str, int | None]) -> str:
    """Aligned when a style the picks put on top is also one the player rated highest."""
    rated = {k: v for k, v in told_bands.items() if v is not None}
    if not rated:
        return "not told"
    if not suggested_top:
        return "open"
    best = max(rated.values())
    return "aligned" if any(rated.get(k) == best for k in suggested_top) else "differs"


def growth_paths(styles: list[StyleRead]) -> list[tuple[str, StyleRead]]:
    """Where to grow: specialise in the leading style, stretch the weakest. Empty until every style has enough chances."""
    if any(s.chances < MIN_PICKS for s in styles):
        return []
    ranked = sorted(styles, key=lambda s: s.share, reverse=True)
    out = [("specialise", ranked[0])]
    if ranked[-1].share < ranked[0].share:
        out.append(("stretch", ranked[-1]))
    return out
