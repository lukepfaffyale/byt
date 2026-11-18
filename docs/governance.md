# Governance record: data, privacy, security, intellectual property, AI and agents

First written 2026-11-14, before any route or screen. Brought up to the whole system on 2026-11-14 (evening).
Updated when anything here changes. Four records work together:

| Record | What it holds |
|---|---|
| This file | Who owns what, what is stored and shown, the security controls, the decisions |
| `backend/data/ontology.json` and `docs/ontology.md` | The one map: what a tap means, the seats, the incomes, the agents and the rule numbers |
| `docs/data/` | Every column classified, the tables, and each endpoint mapped to its tables |
| `output/harness.md` | How every AI agent is run, limited, checked and audited |

`backend/tests/test_governance.py` fails the build when the ontology or the data docs fall behind the code: an agent
that is not listed, a rule number that differs, a table missing from the data dictionary, a route missing from the
logical model, or a model library imported into a module that decides money or certificates.

## Ownership and purpose

- Data owner: the student (the repo owner).
- App purpose: a tap-only game. A player's taps build a Sym that belongs to the player. The Sym is tested
  against the player's real picks, earns certificates, does jobs the player checks, and may answer agencies' questions
  if the player turns that on. Agencies and skill creators are the other two seats in the same economy.
- Players: adults only (18 or older). The start screen says so.
- Who can access the database: the student only (a local file on the student's machine; the Supabase dashboard for
  the hosted copy).
- Supabase project name and region: to be recorded when the student creates it (planned 2026-11-17).
- Hosting: Render. Service names `<repo>_frontend` (static site) and `<repo>_backend` (web service); region and
  dashboard members to be recorded at deploy.
- Data leaves the laptop to hosted providers once deployed: yes (Supabase for data, Render for compute and logs,
  Portkey and the model provider for the text sent to the model). Because of that, no column that names a person is
  collected, and log lines carry no nickname, pick or token.

## Database choice (a written exception)

The class default is Supabase. The hosted game uses it. The copy a grader runs from a fresh clone uses a local SQLite
file instead, because the graders' `.env` holds only the model keys and the assignment asks for a small test dataset
that runs locally. Both go through `backend/db.py` with the same SQLModel code (no raw SQL); `DATABASE_URL` selects
which. The local file ships with made-up players only and is created on first start.

## Data handling

- Columns collected: `docs/data/data_dictionary.md`, every one classified. Fourteen tables: players, responses,
  tendencies, battles, predictions, certs, self_reports, work, active_days, consents, orgs, campaigns, earnings, usage.
- What is deliberately not collected: email, real name, password, photo, location, IP address, device id, birth date.
  The only typed text is the nickname and an agency name. Decks avoid sensitive categories (health, politics,
  religion, sexuality, debts).
- Identity: a nickname and a random token kept in the browser's local storage. Only the SHA-256 of the token is
  stored. A random 256-bit token needs no bcrypt (that rule is for passwords, and there are none). Losing the token
  means losing the Sym; the start screen says so.
- Opt-ins, each off until the player turns it on, each reversible: what the player tells the Sym (letters, bands,
  star sign, year animal), and data income ("Let my Sym earn").
- Retention: everything tied to a player is kept until the player deletes it, and the hosted database is wiped on
  2027-01-31 at the latest.
- How a player sees their stored activity: `GET /me/activity`, `GET /me/mirror`, `GET /me/money`, `GET /me/sphere`
  and the "My Sym" and "My Money" screens. Every response, belief, battle, certificate, job, credit and choice.
- Download: `GET /me/export` hands the player what they put in (taps as card id and option id, timings, what they
  told the Sym, their opt-in, their job reviews). It leaves out card wording, questions, skills, beliefs, Sym
  answers and reasons, and every certificate issued here. See "Intellectual property" below.
- Delete: `DELETE /me` and a button on the Data tab. All fourteen tables are covered. Usage rows keep their token
  counts with the player link removed. An agency the player opened is deleted with them; what its questions already
  paid other players stays with those players.
- Notice before the first write (start screen, above the nickname field): "This game stores a nickname, the days you
  play, and your taps: what you pick and how fast you tap. The game uses them to build a Sym of you. Your Sym's notes about you go to an
  AI model, without your nickname. You can see everything the game stores, and you can delete it at any time. Use a
  nickname, not your real name. If you clear the data of this browser, you lose your Sym." Two boxes must be ticked:
  agreement, and being 18 or older.
- What an agency sees: counts for each option across at least 5 Syms that match the group it chose. Never one
  player's answer, never a nickname, never which Sym said what: answers are computed, counted and discarded in one
  request. Below 5 it gets nothing and is charged nothing. Only Syms whose owners turned data income on are asked;
  the rest of the crowd on a fresh copy is the made-up sample Syms, and the screen says how many.
- An agency cannot type a question. It taps one of six fixed questions, a group and a price, so no free text from
  one user reaches another user or a model.
- What a skill creator will see (seat not built): totals over 5 or more players, never one player.
- Credits are play money. No money moves, and the app says so.
- Derived, never stored: the suggested letters and thinking styles, the sphere and its history, the money view. They
  are rebuilt from the stored rows each time, so deleting the rows deletes them.

## Intellectual property

Three kinds of thing, three owners.

| Thing | Owner | Rule |
|---|---|---|
| A player's inputs: taps, timings, what they told the Sym, their reviews | The player | Seen on screen, downloadable, deletable |
| BYT's content and method: card wording, jobs, questions, the ontology, skill trees, prompts, agent output (beliefs, guesses, reasons), and every certificate issued here | BYT | Seen on screen by the person it is about, never handed over as a file, never shown to another seat |
| Other people's instruments and names: the four-letter type, the four-quadrant thinking profile, any brand | Their owners | Never copied. Our own cards and names; results labelled "our guess" and "told by you"; requesters and brands are made up |

- A certificate is the core asset. It is issued only by code (`backend/verifier.py`), shown to its holder, and not
  included in the download. Next step, not built: an issuer on each certificate and a signed code that anyone can
  check at a public address, showing topic, level, score and date with no nickname.
- A published item (gate, skill step, job, question) will carry its owner and its terms when the creator seat is
  built. Today every item is BYT's.
- Limits stated plainly: anything shown on a screen can be copied by hand, and a player can call the app's own data
  feed with their own sign-in. The rule stops a bulk file and stops other seats; it does not stop a determined
  reader of their own screen. Under real personal-data law a person could also ask for the inferences held about
  them; this build shows those on screen for that reason.

## AI and agent governance

The full record is `output/harness.md`. The rules in short:

- Three agents, all serving the player: Profiler, Sym, Worker. Each has one read-only tool and its own prompt file.
  The register (job, tool, what it reads, what it never reads, how its output is checked) is in the ontology and is
  tested against the code.
- An agent never learns who the person is: no nickname, token or id reaches a model. It never sees another player,
  picks held back for a battle, or what the player told the Sym.
- An agent never writes. Code stores what an agent returns, after checking it.
- A model never decides a certificate, a payment, what an agency sees, the suggested letters or the sphere. Those
  are plain code, and a test fails if a model library is imported into those modules.
- A person checks the Sym's work before it is paid or counted. Data income is the exception by design: it uses no
  model, it is opt-in, and it returns totals only.
- Every run is limited (4 requests, 3 tool calls), counted against a daily token budget, and written to an audit
  trail that holds no player text.
- Text a model wrote is treated as untrusted before another agent or a person reads it: prompt guard, length cap.
- When the model is not available the game still works, with a practice Sym that uses no AI, says so on screen and
  cannot earn a certificate.
- Everything an agent writes for a person follows the plain-words rule (the shared prompt says so).
- Planned, not built: a Coach (player), an Analyst (agency) and a Scout (creator). Each will be added to the
  ontology register first, with one read-only tool, in the same harness.

## Security controls

Ticked when verified, with how. Unticked items wait for the hosted deployment.

- [x] Secrets from `.env` only (repo folder first, then one folder above); `.env.example` committed with placeholders. (Read `backend/main.py`; the key was never printed.)
- [x] All request schemas are Pydantic models with `extra="forbid"` and bounded lengths. (Tests post unknown fields and get 422.)
- [x] CORS restricted to the configured front-end origins. (Read `backend/main.py`; hosted origin to be set at deploy.)
- [ ] Row-level security on for every hosted table, no access for anon or authenticated (see `data/logical_model.md`)
- [ ] The database URL lives only on the Render web service; the front end holds no database key
- [x] No passwords exist; the player token is random, stored hashed, sent in a header, never in a URL. (Read `backend/db.py`, `frontend/src/api.ts`.)
- [x] Model endpoints rate-limited, behind the safe agent harness, with a daily token budget that stops the model. (Read `backend/main.py`, `backend/agent.py`; tests cover the fallback.)
- [x] No free text from a user reaches a model: nicknames and agency names are validated and never sent; questions are fixed lists. Model-written text passes the prompt guard. (Tests post typed questions and get 422.)
- [x] The right answer of a skill card never leaves the server and never reaches a model. (The card shape sent to the browser has no such field; tests check it.)
- [x] Every query is scoped to the player resolved from the token. (Read `backend/db.py`: every function filters on the player id; a test checks a second player sees none of the first player's money.)
- [x] Dependencies pinned; no raw SQL, no eval, no shell with user input. (Read `requirements.txt` and the back end.)
- [x] No PII in the audit trail, URLs or errors; the trail carries a random run id, never a player id or nickname. (Read `output/audit_trail.json`.)
- [x] No text is rendered as raw HTML. (Searched the front end for raw HTML rendering: none.)
- [ ] Pre-push scan for secrets, PII strings, marker strings and em dashes (the repo does not exist yet)

## Third-party code looked at

2026-11-14: `zlisto/world_starter` and `zlisto/metaverse_registry` were cloned into a scratch folder and scanned
(agent-instruction files, install scripts, override phrases, hidden HTML, the course marker strings, eval and
subprocess use, committed secrets). Nothing found. Nothing from them was run or copied into this project. If the
Metaverse Web bolt-on is built, its protocol client is rewritten here in TypeScript and this entry is updated.

## Characters, art and brands

All drawings are original, made in this project. Every brand, agency, city and school named in the game is made up.
Nothing is official, licensed or for sale. The same statement is on the About screen and in the README.

## Decisions and tradeoffs

| Date | Decision | Reason |
|---|---|---|
| 2026-11-14 | Nickname only; no email, no account | The class can play in seconds, and personal data stays near zero |
| 2026-11-14 | Reaction time is recorded | It signals strength of preference and is the reflex measure; disclosed in the notice and shown back to the player |
| 2026-11-14 | Inferred tendencies are stored | They are the Sym; treated as PII, shown to the player, deleted with the player |
| 2026-11-14 | Local SQLite for the grader's copy, Supabase for the hosted game | The graders have model keys only; see "Database choice" |
| 2026-11-14 | Certs are issued by code, never by a model | A score a model cannot invent |
| 2026-11-14 | No identity documents, emails or social media in this build | Far more personal data than a class project should hold; roadmap only |
| 2026-11-14 | House style is black, gold and platinum with sharp lines, not the class default of black and pink | The student's choice for BYT; contrast checked and recorded in `accessibility.md` |
| 2026-11-14 | Twelve made-up sample players are seeded | The crowd guess needs other players' picks on a fresh copy; they are generated, not people |
| 2026-11-14 | The committed audit trail carries counts and names only | A tendency is an inferred trait; it stays in the database, visible to its owner and deletable |
| 2026-11-14 | The mirror uses our own cards and names, and labels results "suggested" and "told by you" | The four-letter type and the four-quadrant thinking profile belong to their publishers (The Myers-Briggs Company; Kobus Neethling and Solutionsfinding). No question of theirs is copied and nothing here is their official test |
| 2026-11-14 | Star sign and year animal by tap, never a birth date; stored only if the player taps them | A date is far more identifying, and a birth year is an age |
| 2026-11-14 | What a player tells us is never sent to a model | It would leak into the Sym's predictions and spoil the test of sign and type against the Sym |
| 2026-11-14 | Brain regions in the ontology are labelled as loose textbook associations | The game measures taps, not brains |
| 2026-11-14 | An answer cannot be changed; cleared gates leave the journey and live only in the player's log | Changing answers would let a player game the Sym test. Views change through new gates, where newer picks count |
| 2026-11-14 | Jobs come from invented requesters and pay play credits; the human reviews every answer before it is paid or counted | Shows work income without real buyers or money. A requester sees the split across Syms, never one person. The Sym never acts for a person unreviewed |
| 2026-11-14 | The collective split on a fresh copy is mostly the made-up sample Syms, and the screen says how many | An honest illustration until real players exist |
| 2026-11-14 | Batch questions are answered by plain code from pick counts, not by a model, and are not reviewed by the human | Data income must cost close to nothing per Sym. It is opt-in, counts only, 5 Syms or more. Reviewed, model-written work is the separate, better paid stream |
| 2026-11-14 | Audiences are all Syms, certified Syms or a leading thinking style; no targeting of one person, and no recruiting decision about a person | A recruiter question returns a count across a crowd. Choosing a hire from a Sym is roadmap, with its legal questions |
| 2026-11-14 | The download holds the player's inputs only; certificates issued here stay here | Protects the content and agent work that make the product (the student's call), while the player still sees everything stored and can delete it. Limit: anything shown on a screen can be copied by hand; this stops a bulk file, not a determined reader. If real personal-data law applied, a person could also ask for the inferences about them |
| 2026-11-14 | Every word a player reads is fifth-grade plain English, calm in tone, with no idioms, slang, metaphors or contractions | The student's rule: anyone should understand it, and it must translate cleanly into any language. It covers screens, cards, jobs, questions, definitions, server messages and what the agents write (the shared prompt says so) |
| 2026-11-14 | Screens stay short; the longer explanation sits behind a hover or a tap | The student's rule: the first read must be quick, and more is there for those who want it |
| 2026-11-14 | House style, second pass: infinite black, one sharp 2px corner everywhere, platinum hairlines for structure, gold only for what is active or earned; on wide screens the Sym (a sphere of connected points of light) holds the left and the content the right | The student's adjectives: futuristic, minimalist, sharp, bold, premium. Contrast and focus rings unchanged; the layout still stacks to one column on a phone |
| 2026-11-14 | A Motion switch under the Sym lets the player turn movement on or off; with no choice made it follows the device setting | The student asked for a moving sphere on a machine whose device setting is off. An explicit choice by the person is respected in both directions |
| 2026-11-14 | Color on the sphere is never the only signal: a legend names each area with its number, and a pointed-at dot says its area and state in words | Seven colors on black cannot be told apart by everyone |
| 2026-11-14 | With device motion turned off the Sym is one still picture, redrawn whenever the Sym changes | Respecting the setting must not freeze the Sym in its first state (a bug found on the student's own machine, where motion is off) |
| 2026-11-14 | Worth is never weighed by money. On every sphere a point's size is progress or head count; an agency pays every Sym in a group the same price; each agency sees a balance score for how evenly it reaches across groups; pay rises with a certificate, which is earned by play | The student's rule: diversity and balance, no large fish in a small pond, money flows to what advances. The principles are in the ontology and a test fails if the code that sizes points or scores balance reads credits, budgets or pay |
| 2026-11-14 | On the agency and creator spheres a point belongs to a group of 5 or more Syms; a smaller group is hidden; a tap opens facts about the group, never about one Sym; other seats appear as a count, never a name | An agency must be able to see whom it could reach without ever seeing a person |
| 2026-11-14 | The sample Syms answer any card added after they were created, each time the server starts | Otherwise every sample falls into one group when new gates arrive, and the crowd's guess has no data for new cards |
| 2026-11-14 | Asking the same group again costs an agency more each time (half again for each earlier ask, up to three times). The Syms are paid the same; the extra goes to a growth fund | The student's rule: spending should spread across groups, and no group should be bought by one payer |
| 2026-11-14 | The growth fund pays 10 credits to a player who passes a skill step, once for each step, and only what it holds. It starts with 200 play credits | The student's rule: money flows to what advances. The fund is never stored: it is counted from the campaign and earnings rows each time |
| 2026-11-14 | One build for every screen: a wide two-column layout, a phone layout with the menu under the thumb, a Glance mode for small or brief screens (a watch, glasses, a car, a phone on its side) and a Wall mode for a projector or large screen | The student's ask. Glance has nothing to tap but the way out, so it is safe to look at briefly; nobody should play while driving, and the game never asks for that |
| 2026-11-14 | Mono is the default look for everyone (black and white, no glow, heavy capitals, gold only for something earned). The Light look stays as a choice in the footer, kept in the browser | The student's decision. The look is a personal preference: later a player can shape their own space further, as part of the "your space" idea |
| 2026-11-14 | "Color comes from other people." A player's sphere is white until the Sym connects with others (a job checked, a question answered for an agency, the choice to earn); four connections bring full color. Groups of people and the sky of other Syms are always in color | The student's line. Color now means connection, and the number that drives it is in the ontology with a test |
| 2026-11-14 | One login holds all three seats. A new person picks which seat to start in; every login is a player underneath, and an agency or a creator seat is opened under a made-up name from inside that login | The student's ask. No second kind of account, so nothing more is collected. Other seats see a count of agencies and creators, never a name |
| 2026-11-14 | Log out makes the browser forget the Sym; the Sym stays in the game and cannot be reached again | There is no password or email to sign back in with, by design. The screen says so before logging out. A way to come back (a key the player keeps) is a later choice |
| 2026-11-14 | The game keeps the days a player used it (a date only), and a Sym's share of data income follows how lately its owner played: full within 7 days, half within 30, a quarter after that, never less than 1 credit. The Sym is still asked and still paid; the part held back goes to the growth fund | The student's rule: agencies and creators must be able to trust they are working with active people, and higher royalties go to active people. It is behaviour data, so it is in the notice, shown to the player, in the download, deleted with the player, and shown to other seats only as a count for a group of 5 or more |
| 2026-11-14 | No agent answers real paid surveys | It would deceive the survey buyer; buyers here know they are asking Syms |

## Wallets and the ledger (added 2026-11-15)

- Every player, agency seat and creator seat has a wallet. The game has five of its own: the outside (where added play credits come from), the growth fund, job requesters, token fees, and sample Syms.
- Every move of credits is one row in `transfers`: from one wallet, to another, an amount, a reason. Rows are added and never changed or removed. All balances together always add up to zero; a test checks this.
- A balance is never stored. It is counted from the moves each time. The growth fund is now the balance of its own wallet.
- Privacy: a transfer holds two wallet ids, an amount and a reason. It holds no player id, nickname, answer or question text. A person sees only the moves of their own wallets, and the other side is shown as a kind ("an agency", "the growth fund"), never as a wallet or a person. A question paid to many Syms is one line for the agency ("to 8 Syms"), never a list.
- Deleting your data closes your wallets and cuts the link to you. The past moves stay, without an owner, so every other sum still holds.
- Credits are play money. No real money moves, and no card, bank or payment detail is collected. Adding credits takes fixed amounts only (100, 500, 1000), so there is no typed amount.
- Token fees: one credit stands for one cent. When a player wallet holds enough, it pays the real measured cost of each agent run to the token fee wallet. When it does not, it is not charged and the game covers the run, so a new player is never blocked. Decision by the build, to be confirmed by the student.
- Not built: real payment, moving credits between a person's own wallets, and any limit on how often credits are added beyond the request rate limit and the wallet cap.


## The creator studio and one to one meetings (added 2026-11-15)

- **What a creator can do, by taps only.** Send its crew on a survey (one fixed question to a group), a test (where
  a group stands on a skill, in three bands) or a claim on a waiting skill step. Nothing is typed. A group smaller
  than 5 returns nothing and costs nothing, the same rule as the agency.
- **The crew is plain code.** The boss, the scout, the asker and the counter shown on screen are the fixed steps of
  one server call, replayed as a picture. No model is called, so there is no token fee. The seat pays a flat crew
  fee of 2 credits to the game instead. The screen says this.
- **A privacy tradeoff, written down.** Until now a seat saw totals over 5 or more Syms and never one Sym. The
  student asked for a second, costly path: a seat may pay a large royalty (50 credits, against 1 to 5 for a group
  question) to meet one Sym and see who it is. The limits that keep this safe:
  - It is off for every player until that player turns it on (a separate choice from data income, on the Work screen).
  - What is shown: the nickname, the two strongest areas, and the Sym's answers to the six fixed questions, all
    worked out by code from pick counts. Nothing the player typed, no single pick, no times, and no free text.
  - The seat cannot name a Sym. It picks a group and code picks the Sym.
  - The whole royalty goes to the Sym's owner. The owner sees that a seat met their Sym, and never which seat.
  - Turning the choice off hides the Sym from every seat that met it. Deleting the player's data removes the
    meeting rows. The seat is not refunded.
  - Made-up sample Syms can always be met, so the path can be tried while the game is small.
- **Building a skill step (added 2026-11-15).** A creator claims a waiting step (25 credits, one creator per step),
  then builds it: it taps 4 cards from a pack of 6 that we wrote (`backend/data/steps.json`) and pays the crew fee.
  The step then opens for every player on the skills screen.
  - A creator never types a card, so it cannot put its own words, a link or a question about a person in front of a
    player. This keeps the rule that no free text passes between seats.
  - The right answers stay on the server. The creator picks cards without seeing them, and can play its own step.
  - Code decides a pass (3 of 4 right). A pass pays the player 10 credits from the growth fund, as before, and pays
    the creator a royalty of 3 credits from the same fund. The player is paid first, the fund only pays what it
    holds, and a creator earns no royalty for passing its own step.
  - The creator sees, for each step it built, how many other players passed it and what that paid. A count and a
    sum, never who. Its wallet shows the royalties as one line for each step.
  - If the creator's owner deletes their data the step closes and waits for a new maker. Players keep the
    certificates and credits they earned on it, but the step shows as coming later again.
- **Not built.** Packs exist for 8 of the 20 waiting steps (Logic 3, Planning 3, New ideas 1, Understanding people
  1). The other steps have no pack and cannot be claimed. A creator cannot write a new card.

## Jobs an agency posts (added 2026-11-15)

- **Why.** Every job used to come from a made-up requester and was paid by a game wallet, so no seat funded work
  income. An agency can now post a job, and the pay comes from its own wallet.
- **Taps only.** The agency taps one of the six fixed questions, a pay (10, 20 or 40 credits) and a number of Syms
  (5, 10 or 25). It types nothing, so no free text reaches a player or the Worker agent.
- **The pay is held first.** Posting moves the pay for every place into a holding wallet: the pay times 2, because a
  Sym with a certificate is paid double. When a player checks the Sym's answer, the pay moves to the player and the
  rest of that place's hold goes back to the agency. Closing a job gives back the hold for every place no Sym took.
  A player is therefore never left unpaid by an agency that ran out of credits.
- **Who sees what.** The player sees "An agency in the game", never the agency's name. The agency sees how many
  Syms took the job, how many answers were checked and the totals for each option, never who. The made-up sample
  Syms answer too, by code and for free, and are counted apart on screen. An agency's own Sym cannot take its job.
- **A job is not a question to a group.** A group question is answered by code from pick counts, costs 1 to 5
  credits a Sym and has no human check. A job is answered by the Worker agent (AI) and checked by the Sym's owner,
  so it costs more and is worth more: it is a confirmed answer from a living person.
- **Deleting.** When the agency's owner deletes their data the posted jobs go. Credits still on hold stay in the
  holding wallet without an owner, so every sum still holds. A Sym that had answered and not yet been checked is
  not paid for that job.

## Talking to the Sym (added 2026-11-15)

- **A decision that trades privacy for a feature.** Until now no typed text from a player ever reached a model:
  the Sym was built from taps only. The student asked for a way to talk to the Sym, so one channel now does: a
  line of at most 200 characters, typed or spoken, goes to the Guide agent.
- **What limits it.**
  - The line is not stored. It is not in the database, not in the download, and not in the committed audit trail
    (the task message is a fixed sentence; the line travels inside the tool result, and the trail keeps names and
    sizes only). The local forensic log, which is never committed, can hold the first 300 characters of the
    Sym's answer.
  - The line passes the prompt guard first. A line that reads as an order to the model is flagged and never sent;
    the Sym then answers by plain code.
  - The Guide reads no identity: the beliefs, progress and open work as counts, a list of moves, and the line.
  - Its answer is cleaned, guarded and cut to length. A move is used only if it is on the list code gave it, so
    the model cannot send a player anywhere new. It may not give health, legal or real-money advice.
  - The Sym does not learn from the words. It learns from taps: it may ask one card back, and that tap is saved
    like any other pick. So what is stored about a player is still only what they tapped.
  - The screen tells the player, before they type, that the words go to an AI model once and are not saved, and
    asks them not to say a name or anything private.
- **Voice.** Speak and Read aloud use the browser's own speech features and are off until tapped. Speech to text
  may send the sound to the browser's maker; our server never receives sound. The screen says so.
- **Cost.** Each line is one Guide run, counted, priced and charged to the player's wallet like every agent run.
  Ten lines a minute at most.
- **Health and other sensitive uses.** The student's long-term aim includes insight for treatments and mental
  health. Nothing in this build collects, infers or sells health information, and the agents are told not to write
  about health. Doing so would need informed consent, an ethics review and specialist safeguards first.

## Leaving, free Syms and erasing (added 2026-11-15)

- **The student's rule.** When someone leaves, the ecosystem lives on. Leaving removes the login and the nickname
  and closes the wallets, so that person is paid nothing more. The Sym stays as a free Sym with no name. An
  agency or a creator seat they opened is released to the collective: a skill step they built stays open to
  players and earns no royalty, and a job they posted takes no new Syms.
- **What is removed on leaving.** The nickname, the login, what the player told the Sym about themselves, both
  earning choices, and every one to one meeting with that Sym. **What stays, with no name on it:** the taps, the
  beliefs written from them, the certificates, the work answers, the days played, and the past wallet moves.
- **Free Syms.** The made-up Syms and the Syms of players who left are one group: anonymous, counted in a
  group question, never paid, and never offered for a one to one meeting. The screens call them free Syms and say
  that some are made up. A seat can ask "Members who earn" to leave them out.
- **A decision that trades privacy for a feature, written down.** Rows that came from a real person now stay after
  that person leaves. They carry no nickname and no login, and no free text was ever stored, but they are a real
  person's choices. Two things keep this honest: the notice at signup now says so before the first write, and
  **Erase everything is still there** (`DELETE /me`), which removes the rows as before. Erase was kept because the
  class rules require that a user can delete their own data, and because players who joined before today were
  promised it. Removing erase is the student's decision to make with the instructor.
- **Not built yet.** Different prices for free Syms and members, and paying more to go deeper into a cluster.

## The loops between seats, the plan, and the world view (added 2026-11-15)

- **Reach royalty.** When an agency pays for a checked job answer, it also pays one tenth of that pay to the
  creators whose skill steps the Sym's owner passed, split evenly. The agency holds 2.2 times the pay for each
  place to cover this. A creator sees one sum, never which player or which agency.
- **An agency backs a skill.** By taps, an agency holds 50, 100 or 200 credits behind a skill. Each time a player
  passes a built step of that skill, 5 credits go to the player and 5 to the creator, until the credits run out;
  what is left goes back. Creators see, for each skill, the sum agencies have left behind it, never who.
- **Insight certificates.** A third kind of certificate, issued by code like the others: when a player corrects
  their Sym on a job, or when their confirmed answer is not the one most Syms give. It records the question and
  the share of Syms that agree. It does not raise pay.
- **The plan.** `GET /me/plan` lists up to four uses of the next few minutes, best first, by plain counting. The
  Guide reads the same list. No model ranks it.
- **A Sym that starts work by itself.** Off until the player picks 1 or 3 jobs a day. The Sym only answers:
  nothing is paid until its owner checks the answer, so the human check on every paid job is unchanged. Each run
  is a Worker run, counted and charged like any other, so the player is told the cost next to what the Sym earned.
- **The world view is public.** `GET /world` needs no login. It returns totals only: how many Syms, seats,
  certificates, checked answers and corrections there are, and how many credits moved between kinds of wallet. On
  a small game a total can be 1 (one agency, one creator). It never names a player, a seat or an answer.

## Deleting means leaving, and leaving is anonymous (the student's decision, 2026-11-15)

- **One path.** The screen has one button, "Delete my account". It removes the login, the nickname, what the
  player told the Sym about themselves, every choice (earning, one to one, working by itself), every one to one
  meeting, the days played, and the link from token costs to the player. The wallets close. The taps, the beliefs,
  the certificates and the work answers stay as a free Sym with no name.
- **Why this counts as anonymous, and its limit.** Nothing left behind holds a name or a way to sign in, and no
  free text was ever stored. The rows are still held together by one internal number, which is what makes them a
  Sym. That number is not shown to anyone and nothing maps it back to a person. The remaining risk is small and
  is stated plainly: someone who already knew a person's exact picks could recognise the pattern.
- **Keeping trust in certificates and authorship.**
  - A certificate vouches for a Sym with a living owner. A free Sym is never counted as certified: it does not
    match the "certified" group and is not paid double.
  - A skill step whose creator left stays open and is shown without a maker. No royalty is paid for it to anyone.
  - A job whose agency left takes no new Syms. A Sym that had already answered is still paid.
  - Free Syms are counted apart on every result screen, and never offered for a one to one meeting.
- **The notice at signup says this before the first write.** The older full erase route (`DELETE /me`) is still in
  the back end for a request that must remove the rows themselves. No screen calls it.

## Price tiers, and screens that do not scroll (added 2026-11-15)

- **Tiers.** A group question has a tier, picked by tap. Blend: free Syms and members; a free Sym costs half
  the price (it has no owner to pay; that half goes to the game's wallet for free Syms) and a member costs the
  price. Members only: each member costs, and is paid, 2 times the price. Members with a certificate: 3 times.
  The deepest tier is one Sym, met one to one for 50 credits, which already existed. The price of asking the same
  group again still applies on top.
- **The minimum still holds at every tier.** Fewer than 5 matching Syms means no one is asked and nothing is
  charged. Before asking, the agency sees how many free Syms and members a tier would reach, as two counts, and
  sees nothing when the total is under 5.
- **What the Guide may read about money.** The player's own wallet totals and the fixed labels of the last five
  moves. No names, no other wallet.
- **No scrolling.** Each screen is one panel at a time: taps change the panel, and long lists show a few rows with
  two arrows. Notes open over the screen. This was checked on one wide screen only; a phone is not checked yet.
- **The world view** is now drawn as a graph inside a turning tesseract. It holds still when motion is off, and
  every node can be read by tapping its name below the picture.

## A battle now teaches the Sym (added 2026-11-15)

- **What was wrong.** Battle picks were held out so the test was fair, but they stayed held out for good, and the
  beliefs were never rewritten after a loss. The Sym did not learn from a battle.
- **What happens now.** Every guess is still sealed before the first card. Before each pick the player sees how
  sure the Sym is (not the guess). After the pick they see the guess, whether the crowd's guess was right, and the
  belief the Sym leaned on. That belief is looked up by code from the stored beliefs; the model only names a topic.
- **Learning.** When the battle is scored, its picks become proof (they are no longer held out). If any guess was
  wrong, the Profiler is given the misses (the card, the guess, the real pick, the belief leaned on; all of it game
  content and stored beliefs, no free text) and told to rewrite only the beliefs that failed. Code compares the
  beliefs before and after and stores each change in `lessons`. With no model, code records that the missed picks
  now count. A model never scores the battle and never issues the certificate.
- **The fairness of later battles.** A later battle uses other cards, held out in the same way, so its score is
  still on picks the Sym has not seen.
- **The area map.** For each brain area, code counts the picks that fell in it and how many the Sym guessed. The
  areas are loose textbook links. Nothing here measures a brain.

## Two new games (added 2026-11-15)

- **Dot patterns.** A grid of four or twelve squares flashes dots in an order made by a rule in the card file.
  Code works out the squares and the next one; the next square never leaves the server. After a tap the player
  sees how many other players got that puzzle right, as two counts. With motion off the order is shown as numbers.
- **Rock, paper, scissors against the Sym.** Plain code, no model, no tokens. Before each round the Sym reads the
  player's earlier throws, says which throw it expects and why, and plays the throw that beats it. Its throw is
  computed before the new throw is stored, from the earlier rows alone.
- **The league.** After 10 throws a Sym plays every other Sym that has 10 or more, and the made-up Syms. Each
  Sym throws the way its owner throws. Another Sym is shown as a number with its wins and losses, never a
  nickname. This is a new use of one player's habits against another's: only win and loss counts cross over.
- **Leaving.** A player who leaves keeps their throws on the free Sym, like their taps. A full erase removes them.
- **Not in the download yet:** the throws. The screen shows the player's own rounds and habits.

## Confidence on pattern puzzles (added 2026-11-15)

- **The Sym's bet.** Before a pattern gate starts, code works out for each puzzle whether the player will get it
  and how sure the Sym is: the player's record on right-or-wrong cards outside that gate, pulled toward how other
  players did on that puzzle. The player sees how sure the Sym is before tapping, and the bet after.
- **The player's own sureness.** After choosing a square the player taps Sure, Think so or A guess. It is stored
  with the answer. The screen then shows how often they were right at each level.
- **Why it is collected.** The gap between how sure and how right is a plain measure of how a person judges risk.
  It is shown to the player and the Guide may read the totals. It is not shown to any agency or creator, and it is
  not used to price or rank anyone. The Guide is told not to give money or health advice from it.

## Judgment (added 2026-11-15)

- The sureness tap is now asked on the strategy games as well as the pattern puzzles, and `responses.sure` is stored
  for any card that has a right answer.
- `GET /me/judgment` gives the player their own record: right at each level of sureness, their taps in order, and
  one line worked out by code from fixed cut-offs (3 answers before anything is said; right 8 times in 10 when sure
  counts as a feeling to trust). No model writes it. It is advice about checking a choice, never about money or health.

## A certificate is earned, never bought (the student's rule, 2026-11-15)

- **Who can issue one.** Code, in three places only, each from play: a finished battle, a finished skill gate, a
  checked job answer. No route that moves credits issues a certificate, and a test tries every such route.
- **Not for luck.** A skill certificate needs at least two of three right, and a score that tapping at random
  would reach at most 2 times in 100. On a three card gate that means all three. A gate too short for any score to
  rule out luck gives no certificate at all. The finish screen says what was needed.
- **What a certificate changes.** Only a Sym certificate (the Sym beat the crowd's guess on picks it had not seen)
  doubles work pay. A skill certificate does not raise pay. An agency that backs a skill pays only when a
  certificate is earned under the rule above.
- **Certificates issued before this rule** stay as they are; they are not taken back.
- **Not built yet.** The Sym does not use skill certificates when it works: its jobs are questions of taste, with
  no right answer. So no skill can be faked in its work today, and no skill is used there either. A failed gate
  still cannot be tried again.

## Trying again, and reaction games (added 2026-11-15)

- **Trying again.** A skill gate finished without its certificate can be tried again after 12 hours. The earlier
  answers to that gate are removed (the only place a stored answer is removed outside leaving); the points stay. A
  gate whose certificate was earned cannot be retried, so a certificate is never put at risk or farmed.
- **Reaction games.** Three packs of reaction drills that a creator claims and builds like any other step. The
  screen measures the time between the signal and the tap and reports in time, too slow, too soon or wrong ring.
  The time is measured in the player's browser, so a person who changes the page could report a false time. That
  is accepted for play credits and is said here plainly; a reaction certificate should not be read as proof to a
  third party.

## What the Sym may keep from what you say (the student's decision, 2026-11-15)

- **Before:** nothing said to the Sym was stored. **Now:** the Sym may ask to keep one short fact from a line.
- **What is stored.** One sentence that starts "This person", written by the Guide in its own words, with a scope
  (true of the person anywhere, or a view about one topic) and a topic. Never the words the player said, never
  sound.
- **Checked by code before it is even offered.** Refused if it has a capital letter after the first (so no names
  or places), three digits in a row, an address, or a word about health, money, belief, politics or similar. Refused
  if the guard finds an instruction in it.
- **Only after a yes.** The offer waits in the server's memory for ten minutes and is not in the database. The
  route that keeps it takes no text at all, so a request cannot write its own line. At most 30 facts for a player.
- **The player stays in control.** Kept facts are listed in My Sym, each with a way to make the Sym forget it,
  and they are in the download.
- **Who reads them.** The player, and that player's own Sym (the Guide, the Profiler and the Sym agent, as
  evidence weaker than picks). No agency or creator, and they play no part in pay, groups or certificates.
- **Leaving.** These facts are removed when a player leaves: a free Sym keeps taps, not sayings.
- **The limit of the check.** The code check is a filter of words and form. A fact could still be private in a way
  no word list catches, which is why the player sees the exact sentence and must tap yes.

## Topics, a smaller brief, and needs that emerge (added 2026-11-15; ideas from VoiceMem, see docs/SOURCES.md)

- **A fixed list of topics.** The ontology now lists ten topics. A belief or a kept fact is mapped by code to one of
  them, and the Sym holds one belief for each topic, so a belief keeps its name when it is rewritten.
- **A new group to ask.** An agency may ask "Syms that hold a view on" a topic. The rules do not change: only
  Syms whose owners chose to earn, totals only, and nothing at all under 5 Syms. Knowing that a Sym holds a view
  on food is one more fact a seat can target on, so it is listed here; the view itself is never shown.
- **A smaller brief for the Guide.** Plain words in the player's line decide which parts of their situation the
  Guide is sent (money, work, what the Sym knows, how sure and how right, what to do next). The moves, the plan
  and the topic list are always sent. Less is sent to the model on every line, which lowers cost and sends less
  about the player.
- **What agencies want.** Creators see, for each skill, how many agencies have asked about it (through a question,
  a job or backing it), and pairs of skills that at least 2 agencies want together. Counts only. With few agencies
  a count can be 1; no agency is named and nothing an agency asked is shown.

## The names Symbolon and Sym (the student's choice, 2026-11-15)

- BYT stays the name of the game. Symbolon is the working name for its maker. A symbolon was a token two people
  broke in half to seal a pact; one half later proved who its holder was by fitting the other.
- The word on every screen for a player's stand-in is now Sym, not twin and not digital twin. A Sym is the other
  half that has to fit its person, not a copy of them. Names inside the code (files, routes, table and column
  names, the certificate kind) keep the working word and are never shown.
- These are names on a class project. No company is registered and no trademark is claimed.
- Quick web searches on 2026-11-15, not trade mark searches:
  - Symbolon: no company or product found with the name. The nearest is Symbolica AI.
  - Sym: taken as a plain name by a security software company in Boston, and used by a UK startup as the name of
    its AI agent. So Sym is used here as a short word inside the game, not as a company name.
- Names considered and dropped the same day: Geminus (an AI company of that name makes industrial digital twins),
  Dokimos (the student did not like its sound; a UK trade mark application exists in the software class), Tessera
  (an AI company of that name raised 60 million dollars in 2026), Dominus (it means master) and Gemus (not a word).

## The first screen: everyone, and what is known together (the student's request, 2026-11-16)

- After signing in, a player lands on a screen called Everyone (`GET /commons`, signed-in players only). It shows
  how many real people have a Sym, how many played today, how many stand-ins hold places, and the seats.
- A stand-in is a made-up Sym or a Sym left behind by someone who deleted their account. It is drawn as an empty
  ring and is called a stand-in on the screen, so nobody takes it for a person. A real person is a point of color.
- The number in the middle is what is known together: answers real people gave, answers of a Sym that its person
  checked, things people told their Sym and kept, and things a Sym changed after being wrong. The screen also says
  how much of it came from the reader. This is counting in code. No model is used.
- The screen says that what people know is the money here, and that credits keep count of who gave what. Credits
  are still play money. Nothing about how credits move was changed.
- The list of what is happening holds nameless lines only (for example: a person checked their Sym). It never
  holds a nickname, an answer, a topic or an id. The time is said loosely on purpose (now, today, this week,
  earlier), so a line cannot be matched to a person by its minute. A line the reader did is marked "you".
- A trade written down: with very few real players, a friend could still guess who did something from a line and
  its loose time. The line says only that a kind of thing happened, never what was chosen or said.
- The points on the map are drawn from counts. No row about any one person is sent to the browser.

## My effect: seeing what one person set moving (the student's request, 2026-11-16)

- The Everyone screen has a tab called My effect (`GET /me/ripple`). It draws four points: me, my agency, my
  studio and everyone. Each line between them is a count from the books, and each has one plain sentence.
- It shows a person how one seat reaches their other seats. Examples: your own agency asked your own Sym, so your
  taps as a player came back as answers on your agency desk; other people passed a step your studio built.
- Every number is the reader's own rows. Other people appear only as a count (how many were paid, how many
  passes). No name, answer or id of another person is sent.
- The rules about paying yourself did not change and the screen says them: a Sym cannot take a job its own owner
  posted, and a studio is not paid when its own owner passes its step. A group question from your own agency can
  reach your own Sym, as before; the pay moves from your agency wallet to your player wallet.
- A seat that is not open is drawn as a dashed point, with one tap to open it. Counting in code. No model is used.

## Everyone leads to the next place (the student's request, 2026-11-16)

- The Everyone screen stands alone: the Sym's brain is not drawn beside it.
- A box named My Sym says one next thing to do, with one tap. It is chosen by counting in code, with no model:
  a person who came as an agency or creator is pointed at that seat; a person with no taps is asked to start the
  first gate; otherwise it is the first line of the plan the game already works out.
- A person who signs up as an agency or creator now lands on Everyone first, like every player.
- A Roles tab says what players, agencies and creators each bring, with a count of each and one tap to go there.

## Everyone, drawn in space (the student's request, 2026-11-16)

- The picture on the Everyone screen is now a scene in three dimensions on a canvas, drawn by our own code with
  no library. It can be turned by dragging or with the arrow keys.
- What each thing is: the core holds one point of light for each thing known (up to 900 points; past that a
  point stands for more than one), and the reader's own points are the brightest. A person and their Sym are a
  colored point with a small white point beside it, and no two move alike. Two people who pass close are joined
  by a line until they part. A stand-in is an empty ring that keeps to one of three tracks. Agencies are
  diamonds and creators are cubes. Light runs from people into the core; pay runs back out from the seats.
- How people move, who passes whom and which point sends light are made up by the drawing, from a fixed seed.
  They show no real event. Only the counts are real: people, people who played today, stand-ins, seats, things
  known and the reader's share. No row about any one person reaches the browser.
- With motion off, or when the device asks for less motion, one still picture is drawn. The canvas has a text
  label that says the same counts in words.

## The crew at work, as a scene (the student's request, 2026-11-16)

- When a seat sends its crew, or a player sends their Sym to a job, the replay now takes the whole screen as a
  scene in space: the boss, three crew with a shape each, and who they reach. Each line of the replay is a pulse
  of light from the one who speaks to the one who hears. When the crew reaches a group, the light fans out to
  every Sym in it, and each Sym sends its own light back when the group answers.
- The numbers under the scene (Syms found, answers, credits paid and the like) are the real numbers of the run
  that just happened, and count up at the line where they land. The group is drawn with the real count of Syms
  (up to 60), and the made-up sample Syms among them are empty rings.
- The note under the scene still says what it is: a replay, and that the crew is a computer program, not AI.
  Only a Sym doing a job uses a model. The scene adds no claim.
- With motion off, one still picture is drawn and every line is listed. The lines are always a list for a
  screen reader.
- The agency and creator menus now have Everyone as their first item: it is the hub for every seat.

## The crew scene, redrawn as light made of grains (the student's direction, 2026-11-16)

- The student named the look to aim at: Blade Runner 2049, Foundation, Interstellar, Dune and Terminator. These
  are references for mood only. Nothing is copied from them: no image, frame, logo, name, character or sound.
  The scene is drawn by our own code on a canvas, from points of light.
- What is drawn: the boss is a dark core inside a bright turning ring; each of the crew is a small storm of
  grains; a group of Syms is a field of small storms, pale for made-up sample Syms. A line of the replay is a
  river of grains that leaves the speaker and wraps the listener. At the end of a group question the crew's
  grains settle into one column for each choice, as tall as that choice's share, with the real percent.
- The counts, the shares and the numbers under the scene are from the run that just happened. The paths the
  grains take are made up by the drawing.
- The films are credited as inspiration in docs/SOURCES.md.

## One way of drawing: paths that are forged (the student's direction, 2026-11-16)

- The student set the picture for the whole game: nerve cells forging a path to make a connection. That is what
  the agents do, and what people do when they explore. The dark core with a ring was dropped at the student's
  word; the film references are for the size of space only.
- `frontend/src/neural.ts` holds the shared drawing: a path leaves one body, searches, sends out side shoots that
  find nothing, and connects; then signals run along it. Two screens use it so far.
- The crew scene: nothing is joined at the start. Each line of the replay forges a path from the one who speaks
  to the one who hears. Where the crew reaches a group, the path branches to every Sym. At the end everything
  dims and the answer stands alone as plain bars with the real shares.
- The World map: each kind of wallet is a cell body; a path is forged wherever credits really moved between two
  kinds, and more signals run where more credits moved. The path to AI grows part of the way and stops, because
  that link is drawn and not built.
- What is real and what is drawn: which bodies are joined, the counts, the shares and the credits are real. The
  route a path takes, its side shoots and its timing are made up by the drawing.
- Changed the same day at the student's word: the answer at the end of the crew scene is no longer bars. One
  body stands for each choice, and one fine path runs into it for each Sym that chose it (rounded from the real
  share), with the real percent beside it. The paths leave from the middle of the group, never from one Sym, so
  the picture does not show who chose what.

## The look of the pages: tried first on Everyone (the student's direction, 2026-11-16)

- The student's rule for the look: the frame stays blunt (bold type, hard edges, black and white), and inside it
  the pages should feel like the future, in the mood of Blade Runner 2049 and Foundation. These are references
  for mood only; nothing is copied from them (see docs/SOURCES.md).
- Tried on the Everyone screen only, under one CSS class (`future`): deep space behind the whole page, panels as
  displays with corner marks, amber and teal light, numbers that run up, words that write themselves in, and
  lists that arrive one line after another.
- Words that write themselves in are always present in full for a screen reader. With motion off, or when the
  device asks for less motion, nothing moves and every word and number is shown at once.
- The Everyone scene lost its wire frame; agencies and creators are drawn as cell bodies like everything else.
- The student's stated aim, written down so it is not lost: everyone plays, takes part and leaves with something
  of value, and Syms and agents made sturdy here could later serve larger roles. One role the student named is a
  Sym that can speak for a person in later years. That is an idea only. Nothing in this project builds it, and
  it would need its own written rules first (who may ask, what the person agreed to, and how it ends).

## One look on every page, and World inside Everyone (the student's direction, 2026-11-16)

- The look tried on Everyone now applies to every page and every seat: the page body carries one CSS class
  (`future`), and deep space is drawn once behind everything. Panels, chips, buttons, lists and inputs take the
  same corner marks, amber and teal light and arriving motion. Words and controls are unchanged.
- One switch (Motion, in the footer) stills every moving thing on every page; a device that asks for less motion
  gets the same.
- The World menu item is gone. The map of where credits move is now the Economy tab of the Everyone screen, so
  there is one hub. The sign-up page still shows the small version of the map.
- Not yet redrawn in the new way: the brain, the seat spheres, the stand-ins in the Everyone scene and the
  My effect picture.

## The brain, redrawn as forged paths (the student's direction, 2026-11-16)

- The links between the points of the brain are drawn as bowed fibres, not ruled lines, and signals follow them.
- At the edge of what a Sym has formed, paths reach from a formed point toward one that is not formed yet,
  search with fine feelers, and draw back. This shows the Sym looking for its next connection. It is drawn from
  the real state (which points are formed), but the reaching itself is made up by the drawing: no path is added
  to the Sym until its person taps.
- The frame with four directions around the brain is much fainter, so it reads as space. Its four names still
  work as controls.

## The arrival: the ecosystem meets a person at the door (2026-11-17)

After signing in, and on each fresh load, a person first sees the whole game from far off (`frontend/src/Arrival.tsx`). It starts as one light marked as you, paths grow outward from it, and the view draws back until everyone is in sight. It ends on three choices: Player, Agency, Creator, plus a link to the Everyone hub.

- Real: the number of bodies of each kind (people, stand-ins, agencies, creators, each capped for drawing), the four counts in the corner, and the small lights along the paths (one for each thing known, capped at 1,500; the amber ones are the share that came from this person).
- Drawn: where each body sits, which bodies are joined, and the order the paths grow in. No path is a real link between two people. The line "Every tap you make forges a path" is a picture of the idea, not a record.
- Privacy: it reads `GET /commons` only, so counts and no names. No body stands for a known person except the one marked as you.
- Access: the picture is hidden from screen readers and a written description takes its place. Any tap, Escape, Enter or Space ends the opening. With motion off there is no opening: one still picture and the choices. The full opening plays once per browser (a flag in local storage, no personal data); after that it is quick.

## My Sym asks for the next tap (2026-11-17)

On the player's pages a panel shows the Sym as a living body that speaks in the first person and offers one button (`frontend/src/SymCue.tsx`). Its job is to bring the person back to tapping.

- Every line is written by code in `App.tsx` from counts the person already sees elsewhere: open jobs, taps left in a gate, gates finished, days played. No model writes these lines and nothing new is collected.
- The Sym encourages; it does not pressure. No countdowns, no loss warnings, no made-up urgency, and no claim that is not a real count.
- The path from the body to the button, and the signals on it, are drawn. They record nothing.
- With motion off the panel is still and the full line shows at once. A screen reader gets the whole line as text.

## My Sym inside a gate (2026-11-17)

While a gate is played, a panel at the top stays in sight and shows the Sym answering each tap (`frontend/src/SymLive.tsx`). It replaces the plain progress bar.

- The lines are written by code in `GatePlay.tsx` from what just happened: the tap count, whether the answer was right, the Sym's sealed guess or bet and how sure it was. After a tap with no right answer the Sym only says it kept it; it never claims to have expected or guessed a tap it did not guess.
- The path is the progress: taps made out of taps in this sitting, one light for each. That count is real; the shape of the path is drawn.
- It still reports progress to a screen reader as a progress bar, and the existing spoken results are unchanged.

## The crew speaks on the agency and creator desks (2026-11-17)

Each desk opens with a "My crew" panel: three small bodies, one line, and one button, using the same component as the player's Sym (`SymCue.tsx`).

- The lines are written by code in `AgencyDesk.tsx` and `CreatorDesk.tsx` from that seat's own counts: credits left, questions asked, jobs posted, Syms that can answer, steps waiting or claimed, passes and credits earned. No model writes them.
- The button only does what the desk already allowed: pick a question, open a tab, send the crew, or go to the wallet. It adds no new power and shows no new data. The rule that a seat sees totals over at least the minimum number of Syms is unchanged.
- The crew encourages; it does not pressure. It states prices before any spend, and never spends without the tap that already existed.

## The reward loop is led by the agent (2026-11-17)

The idea the student set: this is the Syms' space; money comes in from agencies, and the agents and the people behind them get value from it. Each role now hears that from its agent, with the next tap attached.

- Player: on the player's pages the Sym first says what came in since the person was last here (count and credits of real wallet lines: pay for answers, jobs, meetings and skill steps; deposits and returned holds are left out), then asks for the next tap. "Last here" is a time kept in this browser's local storage only; it is not sent anywhere and holds no personal data. On a first visit nothing is reported.
- End of a gate: the Sym says what the gate was worth (taps, points, any credits from the growth fund or a backing agency, a certificate) and its button goes straight to the next gate. These are the same numbers the page showed before as plain lines.
- Agency results: the crew says how many Syms the last question reached, how many credits went to them and the people behind them, and how many went to the growth fund, then offers the next question.
- Creator results: the crew says how many times the studio's steps were passed and what they earned, then offers the next thing to build.
- All lines are written by code from the caller's own rows. No model, no new data, no new route. The agents report and invite; they do not spend, and they add no urgency that is not a real count.
- Design rule from the student: little scrolling and little typing, except when talking to the agent. The agent's panel sits at the top of each page so the loop needs no scroll.
