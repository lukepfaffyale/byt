"""Jobs an agency posts: taps only, the pay is held up front, the Sym's owner checks the answer, and the agency
pays from its own wallet. The player never learns which agency asked."""
import db
import market
import work
from conftest import signup
from tests.test_market import play_gates


def test_an_agency_posts_a_job_and_a_checked_answer_is_paid_from_its_wallet(client, auth):
    assert client.post("/agency/jobs", json={"question_id": "q-price", "pay": 20, "seats": 5}, headers=auth).status_code == 404
    client.post("/agency", json={"name": "North Star Ads"}, headers=auth)
    good = {"question_id": "q-price", "pay": 20, "seats": 5}
    for bad in ({**good, "pay": 3}, {**good, "seats": 2}, {**good, "question_id": "nope"}, {**good, "question": "typed text"}):
        assert client.post("/agency/jobs", json=bad, headers=auth).status_code == 422
    assert client.post("/agency/jobs", json={**good, "pay": 40, "seats": 25}, headers=auth).status_code == 409  # far more to hold than the wallet has

    hold = round(20 * work.CERT_MULTIPLIER * (1 + market.REACH_SHARE))  # double pay, plus the share for creators
    seat = client.post("/agency/jobs", json=good, headers=auth).json()
    post = seat["postings"][0]
    assert seat["budget"] == market.START_BUDGET - 5 * hold - db.share_of(5 * hold) and post["held"] == 5 * hold and post["taken"] == 0 and post["open"]

    # the agency's own twin does not see the job and cannot take it
    play_gates(client, auth, 1)
    assert post["id"] not in [j["id"] for j in client.get("/jobs", headers=auth).json()["jobs"]]
    assert client.post(f"/jobs/{post['id']}/run", headers=auth).status_code == 403

    worker = signup(client, "Worker Bee")
    play_gates(client, worker, 1)
    job = next(j for j in client.get("/jobs", headers=worker).json()["jobs"] if j["id"] == post["id"])
    assert job["requester"] == "An agency in the game" and job["pay"] == 20 and "North Star" not in str(job)
    ran = client.post(f"/jobs/{post['id']}/run", headers=worker).json()
    assert ran["state"] == "review"
    before = client.get("/me", headers=worker).json()["credits"]
    verdict = {"verdict": "approved"} if ran["answer"] else {"verdict": "corrected", "choice": ran["options"][0]["id"]}
    result = client.post(f"/jobs/{post['id']}/review", json=verdict, headers=worker).json()
    earned = result["credits_earned"]
    assert earned == (20 if ran["answer"] else work.TEACHING_PAY)
    assert client.get("/me", headers=worker).json()["credits"] == before + earned
    lines = client.get("/wallets", headers=worker).json()["wallets"][0]["lines"]
    assert lines[0]["label"] == "Work pay" and "agency" in lines[0]["detail"] and "North Star" not in str(lines)

    # the agency paid, and the part of that seat's hold that was not needed came back
    seat = client.get("/agency", headers=auth).json()
    assert seat["budget"] == market.START_BUDGET - 4 * hold - earned - db.share_of(4 * hold + earned)  # the share on what came back, came back
    post = seat["postings"][0]
    assert post["taken"] == 1 and post["checked"] == 1 and sum(r["count"] for r in post["split"]) == 1 + post["sample_twins"]
    assert "Worker Bee" not in str(seat)  # counts, never who

    # closing gives back the four places no twin took, and the job leaves the list
    seat = client.post(f"/agency/jobs/{post['id']}/close", headers=auth).json()
    assert seat["budget"] == market.START_BUDGET - earned - db.share_of(earned) and seat["postings"][0]["open"] is False
    assert client.post(f"/agency/jobs/{post['id']}/close", headers=auth).status_code == 404
    late = signup(client, "Late One")
    play_gates(client, late, 1)
    assert post["id"] not in [j["id"] for j in client.get("/jobs", headers=late).json()["jobs"]]
    assert client.post(f"/jobs/{post['id']}/run", headers=late).status_code == 409
    assert db.ledger_total() == 0

    # the agency's owner deletes their data: the job goes, the worker keeps the pay, the sums hold
    client.delete("/me", headers=auth)
    assert client.get("/me", headers=worker).json()["credits"] == before + earned
    assert client.get("/me/money", headers=worker).status_code == 200
    assert db.ledger_total() == 0
