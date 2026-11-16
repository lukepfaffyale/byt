"""Game content: gates and cards from backend/data/cards/*.json, plus the board rules.

Cards are content we write, so they live in versioned files and are loaded once at start.
The winning moves of a strategy card are computed here by code. They never leave the server
and never reach a model.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

CARDS_DIR = Path(__file__).resolve().parent / "data" / "cards"
ONTOLOGY_PATH = Path(__file__).resolve().parent / "data" / "ontology.json"
STEPS_PATH = Path(__file__).resolve().parent / "data" / "steps.json"
ONTOLOGY: dict = json.loads(ONTOLOGY_PATH.read_text(encoding="utf-8"))
BIN_OF_KIND = {k: b["id"] for b in ONTOLOGY["bins"] for k in b["kinds"]}
KNOWN_TRAITS = (
    {a[side]["trait"] for a in ONTOLOGY["axes"] for side in ("first", "second")}
    | {t for group in ONTOLOGY["styles"] + ONTOLOGY["faculties"] for t in group["traits"]}
    | set(ONTOLOGY["unmapped"])
)

POINTS_PREFERENCE = 10
POINTS_FEEDBACK = 5
POINTS_BATTLE = 15
POINTS_SKILL = {"easy": 25, "medium": 50, "hard": 100}
POINTS_SKILL_MISS = 5
RIGHT_KINDS = ("strategy", "logic", "pattern", "reflex")  # kinds of card that have a right answer


@dataclass(frozen=True)
class Option:
    id: str
    label: str
    trait: str | None = None


@dataclass(frozen=True)
class Board:
    game: str  # "tictactoe", "connect4" or "pattern"
    rows: tuple[str, ...]
    to_move: str
    seq: tuple[str, ...] = ()  # pattern: the squares that flash, in order, as "row,column"
    answer: str | None = None  # pattern: the square that comes next. It never leaves the server.


def cell_order(rows: int, cols: int, order: str) -> list[tuple[int, int]]:
    """The path a pattern walks over the grid: row by row, back and forth like a snake, or around the edge."""
    if order == "rows":
        return [(r, c) for r in range(rows) for c in range(cols)]
    if order == "snake":
        return [(r, c) for r in range(rows) for c in (range(cols) if r % 2 == 0 else range(cols - 1, -1, -1))]
    if order == "ring":
        edge = [(0, c) for c in range(cols)] + [(r, cols - 1) for r in range(1, rows)]
        edge += [(rows - 1, c) for c in range(cols - 2, -1, -1)] + [(r, 0) for r in range(rows - 2, 0, -1)]
        return edge + [(r, c) for r in range(rows) for c in range(cols) if (r, c) not in edge]
    raise ValueError(f"unknown pattern order: {order}")


def pattern_cells(rule: dict, rows: int, cols: int, count: int) -> list[str]:
    """The squares a rule visits, as "row,column". Code works out the pattern, so the answer is never typed by hand."""
    path = cell_order(rows, cols, rule.get("order", "rows"))
    n, start, step = len(path), rule.get("start", 0), rule.get("step", 1)
    out = []
    for i in range(count):
        if rule["kind"] == "step":  # the same jump each time
            v = start + i * step
        elif rule["kind"] == "grow":  # the jump gets one longer each time
            v = start + step * i * (i + 1) // 2
        elif rule["kind"] == "bounce":  # walk to the end of the path, then walk back
            k = (start + i * step) % (2 * (n - 1))
            v = k if k < n else 2 * (n - 1) - k
        elif rule["kind"] == "pair":  # two dots take turns, each with its own jump
            v = start + (i // 2) * step if i % 2 == 0 else rule["start2"] + (i // 2) * rule["step2"]
        else:
            raise ValueError(f"unknown pattern rule: {rule['kind']}")
        r, c = path[v % n]
        out.append(f"{r},{c}")
    return out


@dataclass(frozen=True)
class Card:
    id: str
    gate_id: str
    kind: str  # preference, strategy, feedback, battle, logic (reflex comes later)
    deck: str
    difficulty: str | None
    prompt: str
    options: tuple[Option, ...]
    board: Board | None = None
    winning: frozenset[str] = frozenset()


@dataclass
class Gate:
    id: str
    title: str
    kind: str
    deck: str
    difficulty: str | None
    bin: str = "preference"
    card_ids: list[str] = field(default_factory=list)


def _line_wins(grid: list[list[str]], mark: str, need: int) -> bool:
    rows, cols = len(grid), len(grid[0])
    for r in range(rows):
        for c in range(cols):
            for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
                end_r, end_c = r + dr * (need - 1), c + dc * (need - 1)
                if not (0 <= end_r < rows and 0 <= end_c < cols):
                    continue
                if all(grid[r + dr * i][c + dc * i] == mark for i in range(need)):
                    return True
    return False


def board_moves(board: Board) -> tuple[list[Option], frozenset[str]]:
    """Every legal move as a tappable option, and the set of moves that win at once."""
    grid = [list(row) for row in board.rows]
    options: list[Option] = []
    winning: set[str] = set()
    if board.game == "tictactoe":
        for r, row in enumerate(grid):
            for c, cell in enumerate(row):
                if cell != ".":
                    continue
                move = f"{r},{c}"
                options.append(Option(move, f"Row {r + 1}, column {c + 1}"))
                grid[r][c] = board.to_move
                if _line_wins(grid, board.to_move, 3):
                    winning.add(move)
                grid[r][c] = "."
    elif board.game == "connect4":
        for c in range(len(grid[0])):
            landing = next((r for r in range(len(grid) - 1, -1, -1) if grid[r][c] == "."), None)
            if landing is None:
                continue
            move = str(c)
            options.append(Option(move, f"Column {c + 1}"))
            grid[landing][c] = board.to_move
            if _line_wins(grid, board.to_move, 4):
                winning.add(move)
            grid[landing][c] = "."
    elif board.game == "reflex":
        # a reaction drill: the screen reports how the tap went. Only a tap in time, on the right ring, counts.
        options += [Option("hit", "In time"), Option("slow", "Too slow"), Option("early", "Too soon")]
        if board.rows[0] == "side":
            options.append(Option("wrong", "Wrong ring"))
        winning.add("hit")
    elif board.game == "pattern":
        for r, row in enumerate(grid):
            for c in range(len(row)):
                options.append(Option(f"{r},{c}", f"Row {r + 1}, column {c + 1}"))
        if board.answer:
            winning.add(board.answer)
    else:
        raise ValueError(f"unknown board game: {board.game}")
    return options, frozenset(winning)


def load_content(cards_dir: Path = CARDS_DIR) -> tuple[list[Gate], dict[str, Card]]:
    gates: list[Gate] = []
    cards: dict[str, Card] = {}
    for path in sorted(cards_dir.glob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        g = raw["gate"]
        if g["kind"] not in BIN_OF_KIND:
            raise ValueError(f"gate {g['id']} has a kind the ontology does not know: {g['kind']}")
        gate = Gate(g["id"], g["title"], g["kind"], g["deck"], g.get("difficulty"), g.get("bin") or BIN_OF_KIND[g["kind"]])
        for c in raw["cards"]:
            if c["id"] in cards:
                raise ValueError(f"duplicate card id {c['id']} in {path.name}")
            board = None
            winning: frozenset[str] = frozenset()
            if "board" in c:
                b = c["board"]
                board = Board(b["game"], tuple(b["rows"]), b["to_move"])
                if b["game"] == "pattern":
                    cells = pattern_cells(b["rule"], len(b["rows"]), len(b["rows"][0]), b["shown"] + 1)
                    board = Board(b["game"], tuple(b["rows"]), b["to_move"], tuple(cells[:-1]), cells[-1])
                options, winning = board_moves(board)
                if not winning:
                    raise ValueError(f"card {c['id']} has no winning move")
            else:
                options = [Option(o["id"], o["label"], o.get("trait")) for o in c["options"]]
                unknown = {o.trait for o in options if o.trait} - KNOWN_TRAITS
                if unknown:
                    raise ValueError(f"card {c['id']} uses a trait the ontology does not know: {sorted(unknown)}")
            cards[c["id"]] = Card(
                c["id"], gate.id, gate.kind, gate.deck, gate.difficulty, c["prompt"], tuple(options), board, winning
            )
            gate.card_ids.append(c["id"])
        gates.append(gate)
    return gates, cards


GATES, CARDS = load_content()


def load_packs(path: Path = STEPS_PATH) -> list[Gate]:
    """Card packs for the skill steps a creator can build. Each card has one right answer, kept here on the server.
    A pack is a gate that is not on the journey: it can be played only after a creator built it (main.step_state)."""
    packs: list[Gate] = []
    for p in json.loads(path.read_text(encoding="utf-8"))["packs"]:
        kind = p.get("kind", "logic")
        gate = Gate(p["id"], p["step"], kind, p["skill"], p.get("difficulty"), BIN_OF_KIND[kind])
        for c in p["cards"]:
            if c["id"] in CARDS:
                raise ValueError(f"duplicate card id {c['id']} in {path.name}")
            if "board" in c:  # a drill played on the screen, like a reaction test: code lists its outcomes
                b = c["board"]
                board = Board(b["game"], tuple(b["rows"]), b["to_move"])
                moves, winning = board_moves(board)
                CARDS[c["id"]] = Card(c["id"], gate.id, gate.kind, gate.deck, gate.difficulty, c["prompt"], tuple(moves), board, winning)
                gate.card_ids.append(c["id"])
                continue
            options = tuple(Option(o["id"], o["label"]) for o in c["options"])
            if c["right"] not in {o.id for o in options}:
                raise ValueError(f"card {c['id']} names a right answer that is not one of its options")
            CARDS[c["id"]] = Card(c["id"], gate.id, gate.kind, gate.deck, gate.difficulty, c["prompt"], options, None,
                                  frozenset({c["right"]}))
            gate.card_ids.append(c["id"])
        packs.append(gate)
    return packs


PACKS = load_packs()
GATE_BY_ID = {g.id: g for g in GATES + PACKS}
PACK_BY_STEP = {(g.deck, g.title): g for g in PACKS}  # (skill id, step name) to its pack
SKILL_BY_ID = {s["id"]: s for s in ONTOLOGY["skills"]}


def check_ontology() -> None:
    """Every skill a style or faculty points to exists, and every gate a skill step names exists."""
    for group in ONTOLOGY["styles"] + ONTOLOGY["faculties"]:
        missing = set(group.get("skills", [])) - set(SKILL_BY_ID)
        if missing:
            raise ValueError(f"{group['id']} points to skills the ontology does not define: {sorted(missing)}")
    for skill in ONTOLOGY["skills"]:
        for step in skill["steps"]:
            if step.get("gate") and step["gate"] not in GATE_BY_ID:
                raise ValueError(f"skill {skill['id']} names a gate that does not exist: {step['gate']}")
    waiting = {(skill["id"], step["name"]) for skill in ONTOLOGY["skills"] for step in skill["steps"] if not step.get("gate")}
    for pack in PACKS:
        if (pack.deck, pack.title) not in waiting:
            raise ValueError(f"pack {pack.id} is for a step the ontology does not have waiting: {pack.title}")


check_ontology()


def score(card: Card, choice: str) -> tuple[bool | None, int]:
    """Whether the choice is right (None when there is no right answer) and the points it earns."""
    if card.kind in RIGHT_KINDS:
        right = choice in card.winning
        return right, POINTS_SKILL.get(card.difficulty or "easy", 25) if right else POINTS_SKILL_MISS
    if card.kind == "feedback":
        return None, POINTS_FEEDBACK
    if card.kind == "battle":
        return None, POINTS_BATTLE
    return None, POINTS_PREFERENCE
