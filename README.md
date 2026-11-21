# BYT, by Symbolon

BYT is the game. Symbolon is the working name for its maker. A symbolon was a token two people broke in half when they made a pact; each kept a half, and one half later proved who you were by fitting the other. A player's stand-in in the game is called a Sym: not a copy of the player, but the other half that has to fit. It is a name for a class project, not a registered company or trademark.

**Beat your Sym. Benefit from your Sym. Be everywhere.**

A machine can do the work. It cannot feel. BYT is a game in which people, by choice, teach a Sym the part only they have.

A tap-only game. You clear short gates (picks, one-move strategy boards, quick reactions) and your taps build a
Sym that belongs to you. The Sym then predicts picks it has never seen. If it beats the crowd guess, it
earns a certificate.

This is a class project (MGT 409, final project).

## Play it online

The game is live at **https://byt-frontend.onrender.com**. Type a nickname, tick the two boxes and start. Nothing else is needed.

- The back end runs on a free plan and sleeps after 15 minutes without visitors. The first visit after that can take up to a minute to wake: the page loads at once, and the first tap waits. After that it is quick.
- The online game stores its data in a hosted Postgres database (Supabase). The copy you run locally below uses a local file and never touches the hosted one.
- Online or local, credits are play money and the game is for adults.

## Deliverables

- `report.html`: the report, eight sections. Open it in a browser.
- `slides.html`: ten slides (reveal.js, loaded from a CDN, so it needs the internet). Open it in a browser and use the arrow keys.

## Run it locally

You need Python 3.12 or newer and Node 20 or newer.

1. Put a `.env` file in this folder, or one folder above it, with your key:
   `PORTKEY_API_KEY=your-key-here` (see `.env.example`). Without a key the game still runs, with a practice Sym
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

The local database is a small SQLite file created on first start, with 193 made-up BOT Syms (one for each United Nations country) so that
"the crowd guess" exists and the economy has life in it. They are plain code, use no AI tokens, and every screen marks them as bots. Tests: `venv\Scripts\python -m pytest` from `backend` (93 tests).

Checked on 2026-11-18 from a fresh clone in an empty folder, on Windows with Python 3.14 and Node 24: the back end
installed and answered in about 80 seconds, the front end installed and built in under 10 seconds, sign-up worked
with no key, all tests passed, and a `.env` one folder above the repo was found.

## What to try in five minutes

1. The welcome screen shows everyone in the game. Tap **Player**.
2. My Sym speaks at the top of each page and offers one button. Tap it: it starts the first gate.
3. Finish a gate (about ten taps). My Sym says what it kept and offers the next gate.
4. After the first gate, **My Work** has jobs. Send my Sym, then say if its answer was right. It is paid after you check.
5. Play to the first battle gate: my Sym guesses your picks before you make them, and plain code decides the certificate.
6. Tap **BYT** (top left) to return to the welcome screen, then **Agency**: open one and ask the Syms a question.
   You get totals only, never a person.
7. **My Money** shows every credit that moved and why. **My Sym**, Data tab: download or delete everything.

## If something does not start

- **"The game cannot reach its server"**: the back end is not running on port 8000. Start it (step 2), then tap Try again.
- **Port 8000 or 5173 is taken**: stop the other program, or on Windows find it with `netstat -ano | findstr :8000`
  and stop it with `taskkill /PID <number> /F`.
- **No key, or the key is refused**: the game still runs. The Sym is then a practice Sym that uses rules, not AI,
  and the screen says so.
- **The model name is refused**: the course key allows `gpt-6-luna` only. Leave `OPENAI_MODEL` unset or set it to that.
- **Start again from nothing**: stop the back end and delete `backend/data/local.db`. It is made again on the next start.

## Where things are

```
backend/
  main.py            routes, .env loading
  agent.py           the four agents (Profiler, Twin, Worker, Guide) inside the safe harness
  tools.py           the four read-only tools, one for each agent
  prompts/           prompt.md (shared rules), profiler.md, twin.md, worker.md, guide.md
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
  tests/             93 tests; test_governance.py keeps the records and the code in step
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

## How it is hosted

`render.yaml` at the top of the repository describes both online services, with no secret in it.

| Piece | Where | Notes |
|---|---|---|
| Front end | Render static site `byt_frontend` | Built with `npm ci && npm run build`. Its one setting, `VITE_API_URL`, is the back end's address. |
| Back end | Render web service `byt_backend`, region Virginia, on the free compute plan (0.1 CPU, 512 MB) | `uvicorn main:app`. Settings entered in the dashboard only: `PORTKEY_API_KEY`, `DATABASE_URL`, `CORS_ORIGINS` (the front end's address). |
| Database | Supabase (Postgres), US East | Reached only by the back end, through the session pooler. Row-level security is on for every table, with no policy for any outside role, so nothing can be read through Supabase's own data API. |

With no `DATABASE_URL` the back end uses the local file `backend/data/local.db`, which is what a fresh clone does.
