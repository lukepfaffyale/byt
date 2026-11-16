"""Work income: the twin does a job, the human reviews, code pays and adds the answer to the collective."""
import db
import work
from content import GATES
from sqlmodel import Session, select

from models import Work


def clear_first_gate(client, auth):
    for cid in GATES[0].card_ids:
        cards = client.get(f"/gates/{GATES[0].id}/cards", headers=auth).json()["cards"]
        card = next(c for c in cards if c["id"] == cid)
        client.post("/responses", headers=auth, json={"card_id": cid, "choice": card["options"][0]["id"], "response_ms": 800})


def test_pay_rules():
    job = work.JOB_BY_ID["job-tagline"]
    assert work.pay_for(job, "approved", certified=False) == 20
    assert work.pay_for(job, "approved", certified=True) == 40
    assert work.pay_for(job, "corrected", certified=True) == work.TEACHING_PAY
    assert work.split(job, ["a", "a", "c"]) == [("a", job.card.options[0].label, 2), ("b", job.card.options[1].label, 0),
                                                 ("c", job.card.options[2].label, 1)]


def test_job_is_locked_until_a_gate_is_cleared(client, auth):
    jobs = client.get("/jobs", headers=auth).json()
    assert [j["state"] for j in jobs["jobs"]] == ["locked", "locked", "locked"] and jobs["credits"] == 0
    assert client.post("/jobs/job-tagline/run", headers=auth).status_code == 403
    assert client.post("/jobs/nope/run", headers=auth).status_code == 404


def test_twin_works_human_approves_and_is_paid_once(client, auth):
    clear_first_gate(client, auth)
    assert client.get("/me", headers=auth).json()["jobs_open"] == 1
    done = client.post("/jobs/job-tagline/run", headers=auth).json()
    assert done["state"] == "review" and done["twin_kind"] == "offline" and done["answer"] in {"a", "b", "c"}
    assert client.post("/jobs/job-tagline/run", headers=auth).json()["answer"] == done["answer"]  # answers once

    result = client.post("/jobs/job-tagline/review", headers=auth, json={"verdict": "approved"}).json()
    assert result["credits_earned"] == 20 and result["credits"] == 20 and result["job"]["state"] == "done"
    assert result["sample_twins"] == db.SAMPLE_COUNT and result["twins"] >= db.SAMPLE_COUNT + 1
    assert sum(r["count"] for r in result["split"]) == result["twins"]
    assert [r["yours"] for r in result["split"]].count(True) == 1
    assert client.post("/jobs/job-tagline/review", headers=auth, json={"verdict": "approved"}).status_code == 409

    me = client.get("/me", headers=auth).json()
    assert me["credits"] == 20 and me["jobs_open"] == 0
    act = client.get("/me/activity", headers=auth).json()
    assert act["credits"] == 20 and act["work"][0]["requester"] == "Halden Outdoor"


def test_a_correction_pays_the_teaching_rate_and_must_differ(client, auth):
    clear_first_gate(client, auth)
    done = client.post("/jobs/job-tagline/run", headers=auth).json()
    same = client.post("/jobs/job-tagline/review", headers=auth, json={"verdict": "corrected", "choice": done["answer"]})
    assert same.status_code == 422
    other = next(o["id"] for o in done["options"] if o["id"] != done["answer"])
    result = client.post("/jobs/job-tagline/review", headers=auth, json={"verdict": "corrected", "choice": other}).json()
    assert result["credits_earned"] == work.TEACHING_PAY and result["job"]["final_choice"] == other

    with Session(db.get_engine()) as s:
        before = len(s.exec(select(Work)).all())
    client.delete("/me", headers=auth)
    with Session(db.get_engine()) as s:
        assert len(s.exec(select(Work)).all()) == before - 1


def test_download_holds_inputs_only_never_our_content_or_agent_output(client, auth):
    clear_first_gate(client, auth)
    client.post("/jobs/job-tagline/run", headers=auth)
    client.post("/jobs/job-tagline/review", headers=auth, json={"verdict": "approved"})
    client.post("/me/told", headers=auth, json={"sign": "leo"})
    out = client.get("/me/export", headers=auth)
    assert out.status_code == 200
    body = out.json()
    assert set(body) == {"note", "nickname", "joined", "taps", "told", "data_income_opt_in", "one_to_one_opt_in", "job_reviews", "days_played", "told_twin", "credits"}
    assert len(body["taps"]) == len(GATES[0].card_ids) and set(body["taps"][0]) == {"card_id", "choice", "response_ms", "at"}
    assert body["told"]["sign"] == "leo" and body["job_reviews"][0]["verdict"] == "approved"
    text = out.text
    from content import CARDS
    from work import JOB_BY_ID
    first = CARDS[GATES[0].card_ids[0]]
    assert first.prompt not in text and all(o.label not in text for o in first.options)
    assert JOB_BY_ID["job-tagline"].question not in text and "lean this way" not in text  # no question, no twin reason
    assert client.get("/me/export").status_code == 401
