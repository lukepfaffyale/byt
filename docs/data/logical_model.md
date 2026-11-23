# Logical model

## Tables and keys

| Table | Primary key | Foreign keys | Notes |
|---|---|---|---|
| players | id (uuid) | | nickname is not unique; token_hash is unique |
| cards | id (text) | | not a database table: versioned content files `backend/data/cards/*.json`, one file per gate, loaded into memory at start by `backend/content.py`. Winning moves of strategy cards are computed by code at load |
| responses | id (uuid) | player_id -> players, card_id -> cards | unique (player_id, card_id) |
| tendencies | id (uuid) | player_id -> players | replaced per topic when the Profiler runs |
| battles | id (uuid) | player_id -> players | unique (player_id, gate_id): the Sym predicts once per battle |
| predictions | id (uuid) | battle_id -> battles, player_id -> players, card_id -> cards | written before the player sees the cards |
| certs | id (uuid) | player_id -> players | unique (player_id, kind, topic, level) |
| self_reports | player_id (uuid) | player_id -> players | one row per player; replaced whole on each save |
| work | id (uuid) | player_id -> players | unique (player_id, job_id); paid once, on review |
| active_days | id (uuid) | player_id -> players | unique (player_id, day); written on the first request of a day |
| wallets | id (uuid) | owner_id -> players (may be empty) | one open wallet for each owner and kind; the game's own have no owner; closed, not deleted |
| transfers | id (uuid) | from_wallet -> wallets, to_wallet -> wallets | append-only; amount in thousandths of a credit; a balance is the sum in less the sum out |
| consents | player_id (uuid) | player_id -> players | one row per player |
| orgs | id (uuid) | owner_id -> players | unique (owner_id, kind) |
| campaigns | id (uuid) | org_id -> orgs | counts only |
| briefs | id (uuid) | org_id -> orgs | counts only; a creator's survey, test or skill claim |
| meets | id (uuid) | org_id -> orgs, player_id -> players | removed when either side deletes their data |
| facts | id (uuid) | player_id -> players | written only after the player taps yes; removed when the player leaves |
| throws | id (uuid) | player_id -> players | one row for each round against the Sym |
| lessons | id (uuid) | player_id -> players, battle_id -> battles | written once for a battle, by code |
| sponsorships | id (uuid) | org_id -> orgs | credits an agency put behind a skill; counts only |
| autowork | player_id (uuid) | player_id -> players | one row per player; 0 until chosen |
| postings | id ("post-" and a random id) | org_id -> orgs | one row per job an agency posted; work.job_id carries the id; removed with the seat |
| made_steps | id (the card pack id) | org_id -> orgs | one row per built skill step; removed with the seat |
| one_to_one | player_id (uuid) | player_id -> players | one row per player; off until turned on |
| earnings | id (uuid) | player_id -> players | campaign_id is a plain reference, cleared when the agency is deleted |
| usage | run_id (text) | player_id -> players, nullable | |

Column types are in `data_dictionary.md`. Deleting a player deletes their responses, tendencies, battles,
predictions, certs, self report and work, and sets `usage.player_id` to null.

## How the database connects

- `backend/db.py` is the only module that touches the database. It builds one SQLModel engine from `DATABASE_URL`.
  - Not set: a local SQLite file at `backend/data/local.db`, created on first start and seeded with the cards and a
    small set of made-up players. This is what a grader runs, with no key beyond the model key.
  - Set to the Supabase Postgres URL: the hosted database for the class game.
- `backend/models.py` holds the SQLModel tables and the Pydantic request and response models (`extra="forbid"`).
- `backend/main.py` exposes the endpoints. Routes call typed repository functions in `db.py`; no SQL in routes.
- The front end calls the endpoints through one typed client, `frontend/src/api.ts`. It never talks to the database
  and holds no Supabase key at all.

## Row-level security (hosted database)

RLS is on for every table. Because the front end never connects to Supabase, the written policy for every table is
the same: **no access for the `anon` and `authenticated` roles** (no policy grants them anything), and the back end
connects with the database role from `DATABASE_URL`, which is held only on the Render web service. Per-player
scoping is enforced in `db.py`: every repository function takes the player id resolved from the token and filters on it.

| Table | RLS | anon / authenticated | Back end |
|---|---|---|---|
| players, responses, tendencies, battles, predictions, certs, self_reports, work, active_days, consents, orgs, campaigns, earnings, usage, wallets, transfers, briefs, meets, one_to_one, made_steps, postings, sponsorships, autowork, lessons, throws, facts | on | none | full, scoped by player id in code |
| cards | not in the database (content files in the repo) | | |

## Endpoint to schema to table

| Endpoint | Request model | Response model | Tables |
|---|---|---|---|
| GET /health | | Health | |
| POST /players | PlayerCreate (nickname, consent) | PlayerCreated (player token, shown once) | players |
| GET /me | | Me (nickname, points, level, certs; `twins` is every Sym in the game and `people` is how many of them have a living person, so the app can say "206 Syms (13 people)") | players, certs |
| GET /journey | | Journey (gates, which are unlocked) | players, responses |
| GET /gates/{gate_id}/cards | | CardOut list (never the correct option) | cards, responses |
| POST /responses | ResponseIn (card_id, choice, response_ms) | ResponseOut (correct or not for skill cards, points; on a battle card, the Sym's pick revealed; a skill cert if earned) | responses, players, predictions, certs |
| POST /battles | BattleStart (gate_id) | BattleStarted (n, Sym kind; predictions stay hidden) | battles, predictions, tendencies, usage |
| POST /battles/{gate_id}/learn | | LearnOut (how many guesses were wrong, and each belief the Sym changed, before and after) | battles, predictions, responses, tendencies, lessons, usage |
| GET /battles/{gate_id} | | BattleResult (score, baseline, cert if earned) | battles, predictions, certs |
| GET /me/activity | | Activity (responses, tendencies, battles, certs) | all player tables |
| GET /me/mirror | | Mirror (suggested letters, thinking styles, faculties, what was told, verdicts) | responses, self_reports |
| POST /me/told | Told (letters, bands, sign, animal; all optional) | Mirror | self_reports |
| DELETE /me/told | | Mirror | self_reports |
| GET /skills | | Skills (every tree with the player's place on it) | responses, certs |
| GET /jobs | | Jobs (each job, its state, credits so far) | work, responses, certs |
| POST /jobs/{job_id}/run | | JobOut (the Sym's answer and reason, waiting for review) | work, tendencies, usage |
| POST /jobs/{job_id}/review | ReviewIn (approved, or corrected with a choice) | JobResult (credits, the collective split) | work, certs |
| POST /me/consent | ConsentIn (data_income) | Jobs | consents |
| POST /me/one-to-one | OneToOneIn (on) | Jobs | one_to_one |
| GET /creator | | CreatorSeat (the wallet, the fixed questions, groups and skills, past crew jobs) | orgs, briefs, wallets |
| POST /creator/briefs | BriefIn (kind, topic, audience; all from fixed lists) | CreatorSeat (counts per option or band) | orgs, briefs, earnings, responses, certs, consents, wallets, transfers |
| POST /me/leave | | Left (the login and nickname are removed, the wallets are closed; the Sym stays as a free Sym) | players, wallets, consents, one_to_one, self_reports, meets, postings |
| POST /agency/sponsor | SponsorIn (skill, budget; from fixed lists) | Agency (each sponsorship with what it spent and how many passes it paid for) | orgs, sponsorships, wallets, transfers |
| POST /gates/{gate_id}/retry | | RetryOut (the gate and how many answers were cleared) | responses |
| GET /me/judgment | | Judgment (right at each level of sureness, the taps in order, one plain line) | responses |
| GET /twin/facts | | FactsOut (the facts the caller let their Sym keep) | facts |
| POST /twin/facts | no body | FactsOut. Keeps the one fact the Sym last offered; a request cannot carry text | facts |
| DELETE /twin/facts/{fact_id} | | FactsOut | facts |
| GET /rps | | RpsOut (the score against the Sym, the last rounds, the habits the Sym found, and the league of Syms, each other Sym as a number) | throws |
| POST /rps | RpsIn (throw: r, p or s) | RpsOut, with the round just played and why the Sym threw what it did | throws |
| GET /duel/{game} | | RpsOut (one duel against the Sym: hide, sync or keeper; the score, the last rounds and the habits it found; no league) | throws |
| POST /duel/{game} | DuelIn (pick: one letter of that duel) | RpsOut, with the round just played and why the Sym moved as it did | throws |
| POST /me/auto | AutoIn (per_day, from a fixed list) | Jobs | autowork |
| GET /me/plan | | Plan (up to four best uses of the next few minutes, each with a reason and what it can pay; a step a creator built is titled "Extra step", since it is not one of the journey's gates) | responses, work, postings, made_steps, consents |
| GET /commons | player | Commons (the first screen after signing in: how many real people, how many played today, how many stand-ins, the seats, what is known together and the reader's part of it (`known_mine` is `taps_mine` + `checks_mine` + `told_mine` + `lessons_mine`), and the newest happenings as nameless lines with a loose time: now, today, week, earlier). Names no player, seat or answer | players, active_days, responses, work, facts, lessons, certs, tendencies, orgs, campaigns, briefs, made_steps, postings, as counts and newest rows |
| GET /me/ripple | player | Ripple (what this person set moving across their own seats: taps and checks as a player, asks from their own agency and from others, steps passed, people their agency paid, passes of steps their studio built). Their own rows; other people only as counts | responses, work, earnings, orgs, campaigns, postings, sponsorships, made_steps, briefs, transfers |
| GET /world | no login | World (totals for the whole game: Syms, seats, certificates, checked answers, corrections, and credits moved between kinds of wallet). Names no player, seat or answer | all tables, as counts |
| POST /twin/ask | AskIn (text, at most 200 characters) | AskOut (one or two sentences, one move from a fixed list, one card to answer) | tendencies, responses, work, usage. The text is not stored |
| POST /agency/jobs | PostIn (question_id, pay, seats; all from fixed lists) | Agency (the posted jobs with counts) | orgs, postings, wallets, transfers |
| POST /agency/jobs/{job_id}/close | | Agency (the unused held credits are back in the wallet) | postings, work, wallets, transfers |
| POST /creator/steps | StepIn (pack, cards; the pack must be claimed by this seat, the cards tapped from it) | CreatorSeat (the built step, and for each built step how many players passed it and what it earned) | orgs, briefs, made_steps, wallets, transfers |
| GET /seats/{seat}/meets | | Meets (each Sym this seat paid to meet, shown only while its owner keeps one to one on) | meets, one_to_one, responses, players |
| POST /seats/{seat}/meet | MeetIn (audience, from a fixed list) | Meets | meets, one_to_one, earnings, wallets, transfers |
| POST /creator | OrgCreate (name) | CreatorSeat | orgs |
| GET /agency | | Agency (budget, the fixed questions, audiences, past results) | orgs, campaigns |
| POST /agency | OrgCreate (name) | Agency | orgs |
| POST /agency/campaigns | CampaignIn (question id, audience, pay; all from fixed lists) | Agency (counts per option) | orgs, campaigns, earnings, responses, certs, consents |
| GET /me/code | | SymCode (one block for each thing the person did, oldest first: T a tap, G a proof, A an agency act, C a creator act; counts and the areas with no block). Built on each read, nothing stored | responses, facts, battles, certs, work, orgs, campaigns, postings, sponsorships, meets, briefs |
| GET /me/sphere | | Sphere (one colored area per faculty: `level` is how much of the area is drawn, cards seen out of 30; the first detail line is picks out of chances, the same share the mirror shows; share of skill steps finished) | responses |
| GET /seats/{seat}/sphere | | Sphere for the agency or creator seat, with its history | orgs, campaigns |
| GET /me/money | | Money (credits earned by source with each line, real AI cost by agent, the agency's spend) | work, earnings, usage, orgs, campaigns |
| GET /wallets | | Wallets (for each of the caller's own wallets: balance, total in, total out, and each move with the other side named by kind only) | wallets, transfers, orgs |
| POST /wallets/deposit | DepositIn (seat; credits from a fixed list) | Wallets | wallets, transfers, orgs |
| GET /me/export | | Export (the player's inputs, including results they brought in; no card wording, no agent output, no certificate issued here) | responses, self_reports, consents, work |
| DELETE /me | | Deleted | all player tables |
| GET /usage/summary | | UsageSummary (tokens and cost per run, per agent) | usage |
| GET /export/battles.csv | | CSV, no PII | battles |
| POST /feedback | FeedbackIn (seat, moment, answer; all from fixed lists) | FeedbackOut (counts) | feedback |
| GET /feedback | | FeedbackOut (counts for each seat and moment) | feedback |

The player token travels in the `Authorization` header, never in a URL.
