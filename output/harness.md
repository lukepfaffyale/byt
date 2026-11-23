# BYT harness record

## 0. System reference (adapted from the class master harness)

The register of agents and every rule number below also live in `backend/data/ontology.json`, and
`backend/tests/test_governance.py` fails when that register and the code disagree.

### 0.1 The five pieces

| Piece | In BYT |
|---|---|
| **Tools** | Four typed, read-only tools in `backend/tools.py`, one for each agent. `get_picks` (Profiler): the player's visible picks, reviewed job answers and a count for each trait. `get_brief` (Sym): the beliefs and the cards to guess. `get_job` (Worker): the beliefs and one question with its options. `get_situation` (Guide): the parts of the player's own state that code chose for this one line. Each returns `{ok: false, error}` when there is nothing to return. The player id stays in `deps`; no tool result carries a nickname, a token or an id. No tool writes. |
| **Memory** | The database is the durable state: the Profiler's beliefs are stored as `tendencies`, and the Sym and the Worker read them. `TwinDeps` carries the player id, the battle card ids and the job id for one run. There is no message history: the Guide answers one line at a time, and the only thing kept from a talk is a fact the player said yes to keeping. |
| **Stopping rules** | A finish instruction in the prompts ("call the one tool once, give the answer, stop") and `UsageLimits(request_limit=4, tool_calls_limit=3)` in code. A normal run is 2 requests and 1 tool call. A daily token budget (`DAILY_TOKEN_BUDGET`, default 2,000,000 tokens in 24 hours) is checked before every run. |
| **Guardrails** | Model allow-list of one name. Identity never reaches a model. Held-out battle picks and other players never reach a model. The short facts a player told the Sym and chose to keep do reach the Profiler and the Twin, after the prompt guard and with no name (corrected 2026-11-22: an earlier line said they did not). The Sym and the Worker see options without trait tags. Every guess and every job answer is validated against the real options; anything else becomes "I do not know". Text a model wrote passes the prompt guard, the em dash strip and a length cap before another agent or a person reads it. No model can issue a certificate, set a payment or shape what an agency sees. |
| **Audit trail** | `backend/output/audit.jsonl`: one record for each graph node, local, gitignored. `output/audit_trail.json`: committed, append-only, one compact record for each turn, tool call, tool result, retry and stop. The committed trail holds names, sizes, token counts and stop reasons only: no player text, no nickname, no id. Token usage for each run goes to the `usage` table, and the player sees their own on My Money. |

### 0.2 The agent register

| Agent | Serves | Job | Tool | Never reads | Output | Checked by |
|---|---|---|---|---|---|---|
| Profiler | Player | Writes short beliefs from the player's picks | `get_picks` | Identity, held-out picks, self report, other players | Up to 8 beliefs with pick counts | Prompt guard, length cap, stored by code, shown to the player |
| Twin (the Sym's guessing part) | Player | Guesses picks on cards the player has not seen | `get_brief` | Identity, raw picks, right answers, other players | One guess for each card, or none | Each guess must be a real option; scored by code against the real picks |
| Worker | Player | Answers one job question as the player, with a one-line reason | `get_job` | Identity, the requester's name, other players | One option or none, and one sentence | Option must exist; reason guarded; then the player approves or corrects |
| Guide | Player | Answers one line the player says and offers one move | `get_situation` | Identity, the player's earlier lines (only facts kept on a yes), other players | One or two sentences, one move, and at most one fact to offer | Line guarded before the run and the answer after; the move must be on a list code gave; a fact is kept only on the player's yes |

Planned, not built: a Coach (player: what to play next and why); the agency's own Sym (the Analyst: a plain reading
of the totals and whom to ask next); the creator's own Sym (the Scout: where skills are thin and what to make). Each
seat's Sym lives in that seat's section and may read only what that seat may see: totals over 5 or more Syms,
never a person. Each goes into the ontology register first.

### 0.3 What is decided by code, never by a model

| Decision | Where |
|---|---|
| The crowd's guess, the battle score, whether a certificate is issued | `backend/verifier.py` |
| What a job pays, and that it pays only after the player reviews | `backend/work.py`, `backend/main.py` |
| How each Sym answers an agency's question, who is asked, the minimum of 5, the totals returned, who is paid | `backend/market.py`, `backend/main.py` |
| The suggested letters, thinking styles, faculties, the growth paths, the sphere and its history | `backend/mirror.py`, `backend/main.py` |
| The practice Sym (no AI) that plays when the model cannot | `backend/verifier.py`, `backend/agent.py` |

A test fails if a model library is imported into `verifier.py`, `work.py`, `market.py` or `mirror.py`.

### 0.4 Loop and stopping rules

- Every run goes through `agent.run_harnessed(...)`, which uses `agent.iter(...)`, logs each node and records a stop reason.
- Stop reasons: `completed`, `usage_limit`, `budget`, `no_key`, `no_result`, or the exception class name.
- No exception reaches a route. When a run yields nothing usable, the practice Sym answers (a zero-token rule of
  thumb), the screen says so, and no certificate is at stake.
- `retries=2` on each agent for output validation; the OpenAI client retries 3 times on 429 and 5xx.
- Hard caps in code: 80 picks in a tool result, 8 beliefs kept, 200 characters for a belief or a job reason, 30
  guesses in an answer.

### 0.5 Guardrails by channel

| Text that reaches a model | Where it comes from | Defense |
|---|---|---|
| Card prompts, option labels, job questions | Our own content files | Trusted content; still described as data in the prompt |
| The player's picks and reviewed job answers | Taps on our options, never typed text | Nothing free-form can enter |
| Beliefs | Written by the Profiler model | Prompt guard (matching lines dropped, flag written with `payload: null`), em dash strip, length cap, then read as data |
| Nickname, agency name | Typed by the player | Validated by pattern and length; never sent to a model at all |
| An agency's question | Tapped from six fixed questions | Never sent to a model: Syms answer it by plain code |

| Text a model wrote that a person reads | Defense |
|---|---|
| Beliefs (My Sym, Beliefs tab) | Prompt guard, em dash strip, 200 characters, plain-words rule in the prompt |
| A job reason (My Work) | The same, and the player approves or corrects the answer before it counts |

There is one free-text channel from a user to a model in this build: the one line a player says to their Sym (the Guide). It is length-capped and passes the prompt guard before the run, and the answer passes it after.

### 0.6 Human in the loop

- Work income: the Sym's answer is shown to the player with its reason. Nothing is paid, nothing joins the totals
  and nothing teaches the Sym until the player says it is right or picks the right answer.
- Data income: no model is used and nothing about one person leaves, so there is no review of each question. The
  player turns the whole stream on or off, and it is off until they turn it on.
- Certificates: the Sym commits its guesses before the player sees a card (`POST /battles` is idempotent for a
  gate), and the cards cannot be fetched or answered until it has.

### 0.7 What decides a certificate (code, `backend/verifier.py`)

- The baseline is the crowd's guess: for each card, the option most other players chose, never counting the player
  being tested. Twelve made-up sample players are seeded so the baseline exists on a fresh copy.
- A Sym certificate needs: the AI Sym (not the practice Sym), at least 8 cards, more matches than the baseline,
  and at least 60 percent right.
- A skill certificate is issued when a strategy gate is finished with at least two thirds right.
- Certificates stay inside BYT: shown to the holder, not in the download. A signed, checkable form is the next step.

### 0.8 Model and gateway

- Portkey (`https://api.portkey.ai/v1`, header `x-portkey-api-key`), key from `PORTKEY_API_KEY` in `.env`. With no Portkey key, an OpenAI key (`OPENAI_API_KEY`) asks OpenAI directly for the same model, through the same harness. The file
  is looked for in `backend/`, then the repo folder, then one folder above the repo.
- Model from `OPENAI_MODEL`, allow-list `gpt-6-luna` only (the course key rule). gpt-6 names use
  `OpenAIResponsesModel`. No temperature is passed.
- Prices used for the cost figures: 0.10 USD for 1M input tokens, 0.01 for 1M cached input, 0.50 for 1M output
  (the table from Lecture 11). Reported input tokens include cached ones.
- Tests need no key and no network: `agent.MODEL_OVERRIDE` takes a PydanticAI `TestModel`.

### 0.9 Safety by layer

| Layer | Rule | Where |
|---|---|---|
| Input | Pydantic models with `extra="forbid"`, bounded lengths, nickname and agency name patterns, fixed lists for questions, groups and prices; rate limits | `models.py`, `main.py` |
| Identity | Random token in the `Authorization` header, stored as a SHA-256 hash; never in a URL, a log or a prompt | `main.py`, `db.py` |
| Prompt | Shared rules (instructions only from the prompt, facts from tools, no personal data, honesty, loop discipline, plain words, no em dashes) plus one file for each agent | `prompts/prompt.md`, `profiler.md`, `twin.md`, `worker.md` |
| Model | One allow-listed name, Portkey only, key from `.env` | `agent.py` |
| Loop | `UsageLimits`, daily budget, `retries=2`, fallback to the practice Sym | `agent.py` |
| Output | Guesses and job answers checked against real options; beliefs and reasons guarded, stripped and capped | `agent.py` |
| Writes | Agents have no write tool. Code writes beliefs, battles, certificates, work and credits, each scoped to the player | `agent.py`, `db.py` |
| Review | A person approves or corrects the Sym's work before it is paid | `main.py` |
| Audit | Two append-only files; the committed one has no player text | `audit.py` |
| Front end | No raw HTML rendering; results announced through `aria-live` | `frontend/src` |

### 0.10 Multi-agent rules

- Four agents: the Profiler, the Twin, the Worker and the Guide (the talking Sym, added after this section was first written). The Profiler runs first, in the background, when a gate of picks is finished or a job is reviewed.
  The Sym and the Worker each read what the Profiler wrote. They do not call each other; the harness runs them and
  the database carries the hand-off. Depth is 1 and there are no cycles.
- What one agent wrote is data to the next, guarded as in 0.5.
- The Guide's voice is picked by plain code (`voice_for` in `main.py`) from the player's own taps: plain while the Sym is new (under 14 taps), then the thinking style the person leans to most. It reaches the Guide as one line of tone in the tool result. It cannot change a fact, a number or a rule.
- The job and talk screens show what each AI answer cost (`cost_usd` on the response, from the run's own usage).
- All four serve the player. Nothing an agent produces crosses to an agency or a creator except as totals built by
  code.
- Planned, not built: a Sym working several jobs at once through copies of itself. Each copy would be one
  harnessed run with its own run id and the same limits; copies would not make copies; all copies would share one
  token budget for their owner and write to one log for that owner; a person would still check the work.

### 0.11 Project decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-11-14 | The Profiler runs in the background when a pick gate is finished | The Sym is ready before the battle, so the player waits about 5 seconds, not 12 |
| 2026-11-14 | The Sym never sees trait tags; the practice Sym does | The model has to infer from the beliefs, which is the claim being tested |
| 2026-11-14 | The practice Sym exists | The game still plays with no key, no budget or no network, and it is the zero-token comparison for the cost section |
| 2026-11-14 | The committed trail carries no player text | Inferred traits are personal data, even under a nickname |
| 2026-11-14 | The Worker's answer is reviewed by the player before it is paid | A Sym must not speak for a person unchecked, and the review is also how the Sym is taught |
| 2026-11-14 | Agency questions are answered by plain code, not by a model | It keeps data income at zero tokens, and it means no agency text can ever reach a model |
| 2026-11-14 | Agents write in fifth-grade plain English with no idioms | The student's rule for every word a player reads; not yet measured on live output |
| 2026-11-14 | The agent register and the rule numbers live in the ontology and are tested against the code | The record cannot fall behind the system without a failing test |

## 1. Build history

### 2026-11-14: Profiler, Sym, battle, verifier, certs

- 20 back-end tests pass (`pytest`), including the hygiene test for em dashes.
- First live run, a made-up consistent player, straight against the agents: Profiler 7.1 s, 2 requests, 2,243 input
  and 336 output tokens, 0.000392 USD. Sym 5.0 s, 2 requests, 2,002 input and 357 output tokens, 0.000379 USD.
  Sym 8 of 10, baseline 6 of 10, certificate earned. The zero-token rule of thumb scored 9 of 10 on the same
  player: on a perfectly consistent person, counting traits is enough. Whether the model Sym earns its cost on
  real, less consistent people is the open question the class data answers.
- Second live run, through the running app over HTTP (a scripted player, deleted afterwards): battle start 4.3 s,
  Sym 9 of 10, baseline 6 of 10, certificate issued. Cost for that player up to the first certificate: 0.0015 USD
  (three background Profiler runs and one Sym run).
- Not yet done: a browser pass over the battle screens, the cost experiment, the fresh-clone run.

### 2026-11-14: the Worker agent (work income)

- Third agent, `worker` (`backend/prompts/worker.md`), one read-only tool `get_job` (tendencies plus one question and
  its options, no trait tags). Same harness, same limits (4 requests, 3 tool calls), same stop reasons.
- Guardrails: the choice must be one of the job options or the run falls back to the zero-token practice Sym; the
  one-line reason is model text shown to a person, so it is stripped of em dashes, run through the prompt guard and
  cut to 200 characters; nothing is paid or counted until the human reviews the answer; pay is decided by code
  (`backend/work.py`), never by a model.
- Live run through the app: one job answered by the AI Sym in 4.5 s with a reason drawn from the tendencies, approved
  by the human, 20 play credits paid, answer added to the collective split (12 sample Syms plus 1 player).
- Tests: 31 pass (4 new in `tests/test_work.py`: pay rules, lock, pay once, correction pays the teaching rate).

### 2026-11-14: governance brought up to the whole system

- The ontology (version 0.4) now carries the seats, the incomes, the agent register and every rule number.
  `backend/market.py` reads the agency's sphere slices from it.
- New `backend/tests/test_governance.py` (5 tests): each listed agent exists with its one tool and no other agent
  does; no tool writes; the rule numbers match the code; every table is in the data dictionary; every route is in
  the logical model; no model library is imported into the modules that decide money, certificates or agency totals.
- 45 tests pass.
- Not done: no live run of the agents since the plain-words rule was added to the shared prompt, so how well the
  model follows it is unmeasured. The audit trail has not been re-read since the Worker's live run.

## 2026-11-22: the four-method test, rerun from the repo (2026-11-23 00:43 UTC)

`backend/experiments/cost_experiment.py` was run on the local database with a real model key. It holds back 10 picks from each of 6 test accounts (4 scripted, 2 played by hand) and scores four ways of guessing them. The AI methods ran through this harness, so the limits, the audit trail and the usage table applied. The output is `output/cost_experiment.json`: counts, 95 percent ranges, tokens and dollars, with no name and no player id. The same evening `pytest` gave 94 passed.

On 21 and 22 November the course key was refused: 68 runs in the committed trail stopped with ModelHTTPError before using a token, and the practice Sym took over each time. With a working key the runs complete again.

Fresh clone, 2026-11-22: an empty folder, Python 3.14.7 and Node 24.20.0 on Windows. Install about 75 seconds, the server answered 5 seconds after starting with no key set, sign-up returned 201, 94 passed, and the front end installed and built in 4 seconds. About 2 minutes in all.
