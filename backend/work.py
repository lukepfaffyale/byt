"""Work: jobs a twin does for a requester, and what they pay. Rules in plain code, no model.

A job is one question from an invented requester. The twin answers as its human, the human confirms or
corrects, and code pays play credits. The answer then joins the collective: how every twin answered.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from content import KNOWN_TRAITS, Card, Option

JOBS_PATH = Path(__file__).resolve().parent / "data" / "jobs.json"
CERT_MULTIPLIER = 2  # a twin holding a certificate is trusted more, so it is paid more
TEACHING_PAY = 5  # the twin was wrong and the human corrected it: small pay, and the twin learns


@dataclass(frozen=True)
class Job:
    id: str
    requester: str
    requester_kind: str
    after_gates: int
    pay: int
    question: str
    feeds: str
    card: Card  # the question as a card, so the same rules that read cards can read jobs


def load_jobs(path: Path = JOBS_PATH) -> list[Job]:
    jobs = []
    for j in json.loads(path.read_text(encoding="utf-8"))["jobs"]:
        options = tuple(Option(o["id"], o["label"], o.get("trait")) for o in j["options"])
        unknown = {o.trait for o in options if o.trait} - KNOWN_TRAITS
        if unknown:
            raise ValueError(f"job {j['id']} uses a trait the ontology does not know: {sorted(unknown)}")
        card = Card(j["id"], "", "job", "work", None, j["question"], options)
        jobs.append(Job(j["id"], j["requester"], j["requester_kind"], j["after_gates"], j["pay"], j["question"],
                        j["feeds"], card))
    return jobs


JOBS = load_jobs()
JOB_BY_ID = {j.id: j for j in JOBS}


def pay_for(job: Job, verdict: str, certified: bool) -> int:
    """Approved work pays the job's rate, doubled for a certified twin. Corrected work pays the teaching rate."""
    if verdict != "approved":
        return TEACHING_PAY
    return job.pay * (CERT_MULTIPLIER if certified else 1)


def split(job: Job, choices: list[str]) -> list[tuple[str, str, int]]:
    """(option id, label, how many twins chose it), in the job's own option order."""
    return [(o.id, o.label, sum(1 for c in choices if c == o.id)) for o in job.card.options]
