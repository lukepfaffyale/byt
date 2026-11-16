# BYT

**Beat your twin. Benefit from your twin. Be everywhere.**

A machine can do the work. It cannot feel. BYT is a game in which people, by choice, teach a twin the part only they have.

A tap-only game. You clear short gates (picks, one-move strategy boards, quick reactions) and your taps build a
digital twin that belongs to you. The twin then predicts picks it has never seen. If it beats the crowd guess, it
earns a certificate.

This is a class project (MGT 409, final project). It is a work in progress; this file will carry the full
grader's run steps before submission.

## Run it locally

You need Python 3.12 or newer and Node 20 or newer.

1. Put a `.env` file in this folder, or one folder above it, with your key:
   `PORTKEY_API_KEY=your-key-here` (see `.env.example`). Without a key the game still runs, with a practice twin
   that uses no AI model.
2. Back end, from the `backend` folder:
   - `python -m venv venv`
   - Windows: `venv\Scripts\python -m pip install -r ../requirements.txt`
     (macOS or Linux: `venv/bin/python -m pip install -r ../requirements.txt`)
   - Windows: `venv\Scripts\python -m uvicorn main:app --port 8000`
     (macOS or Linux: `venv/bin/python -m uvicorn main:app --port 8000`)
3. Front end, in a second terminal, from the `frontend` folder:
   - `npm install`
   - `npm run dev`
4. Open http://localhost:5173, pick a nickname and play.

The local database is a small SQLite file created on first start, with twelve made-up sample players so that
"the crowd guess" exists. Tests: `venv\Scripts\python -m pytest` from `backend`.

## Where things are

```
backend/
  main.py            routes, .env loading
  agent.py           the three agents (Profiler, Twin, Worker) inside the safe harness
  tools.py           the three read-only tools, one for each agent
  prompts/           prompt.md (shared rules), profiler.md, twin.md, worker.md
  models.py          tables and typed request and response shapes
  verifier.py        plain code: the crowd's guess, the scoring, who earns a certificate
  work.py            plain code: jobs and what they pay
  market.py          plain code: the agency seat, questions to many twins, totals only
  mirror.py          plain code: letters, thinking styles, areas, growth paths
  db.py              the only module that touches the database
  content.py         gates and cards, the board rules, the ontology loader
  data/ontology.json the one map: taps, skills, seats, incomes, agents, rule numbers
  data/cards/        the card decks, one file for each gate
  data/jobs.json     jobs from made-up requesters
  data/questions.json the six fixed questions an agency may ask
  tests/             45 tests; test_governance.py keeps the records and the code in step
frontend/            React, TypeScript, Vite
docs/
  governance.md      data, privacy, security, intellectual property, AI and agents
  ontology.md        how to read and extend the ontology
  accessibility.md   the design rules and the checklist
  data/              data dictionary, conceptual and logical models, changelog
output/              harness.md (how every agent is run and checked), audit_trail.json
```

The agent is `backend/agent.py`, `tools.py`, `models.py` and `prompts/`. The other modules are the game around it.
No model decides money, certificates or what an agency sees: those are the plain-code modules above.

## Credits

Every drawing and every brand in the game is original and invented for this project. Nothing here is official,
licensed or for sale. Credits and royalties in the game are play money.

## Sources

Every outside paper that was read while this was built is listed in `docs/SOURCES.md`, with the date it was read, what the project already had, and what was taken from it afterwards.
