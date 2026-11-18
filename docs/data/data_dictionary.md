# Data dictionary

Every column the app stores, classified before anything is collected. Timestamps are UTC ISO 8601.
"PII" here includes pseudonymous behaviour and inferred traits: a nickname plus a pattern of picks can identify a person.

Not collected at all: email, real name, password, photo, location, IP address (the rate limiter holds addresses in
memory only), device id, free typed text. Decks never ask about health, politics, religion, sexuality, money owed or
any other sensitive category.

## players

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| id | uuid | server | no (random) | Stable key | Until the player deletes, or 2027-01-31 |
| nickname | text, 2 to 20 chars | player | **yes** (may be a real name) | Shown to the player and on the friend challenge | Same |
| token_hash | text | server | no, but a secret | SHA-256 of the random player token kept in the browser; proves the player is the same one | Same |
| consent_at | timestamp | server | no | When the notice was accepted | Same |
| points | integer | server | no | Rewards | Same |
| level | integer | server | no | Journey progress | Same |
| streak_days | integer | server | no | Rewards | Same |
| created_at | timestamp | server | no | Analytics | Same |

## cards (content we write, no player data)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| id | text | seed file | no | Stable key | Life of the app |
| deck | text | seed file | no | Topic, for example style or spending | Life of the app |
| kind | text | seed file | no | preference, strategy, logic, reflex, feedback | Life of the app |
| difficulty | text | seed file | no | easy, medium, hard (skill cards) | Life of the app |
| prompt | text | seed file | no | What the card asks | Life of the app |
| options | json | seed file | no | The tappable options | Life of the app |
| correct_option | text, nullable | seed file | no | Answer for skill cards; never sent to the browser or to a model | Life of the app |
| traits | json | seed file | no | Which underlying trait each option signals | Life of the app |

## responses

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| id | uuid | server | no | Key | With the player |
| player_id | uuid | server | linked to a player | Scope every query to the player | With the player |
| card_id | text | server | no | Which card | With the player |
| choice | text | player tap | **yes** (preference or behaviour) | Trains and tests the Sym | With the player |
| is_correct | boolean, nullable | server | **yes** (performance) | Skill certs | With the player |
| response_ms | integer | browser timer | **yes** (behaviour) | Strength of preference, reflex and skill timing | With the player |
| held_out | boolean | server | no | True if the Sym must never see this pick before the battle | With the player |
| created_at | timestamp | server | no | Ordering | With the player |

## tendencies (what the Sym knows)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| id | uuid | server | no | Key | With the player |
| player_id | uuid | server | linked to a player | Scope | With the player |
| topic | text | Profiler agent | no | Deck or trait | With the player |
| statement | text, 200 chars max | Profiler agent | **yes** (inferred trait) | The Sym's working knowledge; shown to the player | With the player |
| evidence_count | integer | code | no | How many picks support it | With the player |
| updated_at | timestamp | server | no | Freshness | With the player |

## battles and predictions

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| battles.id | uuid | server | no | Key | With the player |
| battles.player_id | uuid | server | linked | Scope | With the player |
| battles.gate_id | text | server | no | Which battle gate; one battle per player per gate | With the player |
| battles.topic | text | server | no | Topic shown on the cert | With the player |
| battles.twin_kind | text | code | no | model (the Sym agent) or offline (the practice Sym, no AI model) | With the player |
| battles.n | integer | code | no | Cards predicted | With the player |
| battles.twin_matches | integer | code | **yes** (derived) | Sym score | With the player |
| battles.baseline_matches | integer | code | no | "Always guess the popular pick" on the same cards | With the player |
| battles.created_at | timestamp | server | no | Ordering | With the player |
| predictions.id | uuid | server | no | Key | With the player |
| predictions.battle_id | uuid | server | no | Link | With the player |
| predictions.player_id | uuid | server | linked | Scope and deletion | With the player |
| predictions.card_id | text | server | no | Which card | With the player |
| predictions.baseline | text | code | no | What the crowd guess would pick, from other players only | With the player |
| predictions.predicted | text, nullable | Sym agent | **yes** (inferred) | The Sym's pick, or null for "do not know" | With the player |
| predictions.confidence | real | Sym agent | no | How sure the Sym said it was. Shown to the player before the pick | With the player |
| predictions.because | text, nullable | code, from the Sym's stored beliefs | **yes** (inferred) | The belief the Sym leaned on for this guess, copied when the guess was sealed | With the player |
| predictions.actual | text, nullable | player tap | **yes** | The real pick | With the player |

## certs

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| id | uuid | server | no | Key | With the player |
| player_id | uuid | server | linked | Scope | With the player |
| kind | text | code | no | Sym or skill | With the player |
| topic | text | code | no | Deck or skill | With the player |
| level | text | code | no | easy, medium, hard for skill certs; empty for Sym certs | With the player |
| accuracy | real | code | **yes** (derived) | The proof | With the player |
| baseline | real, nullable | code | no | What it had to beat | With the player |
| n | integer | code | no | Sample size | With the player |
| issued_at | timestamp | server | no | When | With the player |

## usage (token ledger, no player text)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| run_id | text | server | no (random) | Key, matches the audit trail | Life of the project |
| agent | text | server | no | Which agent | Life of the project |
| model | text | server | no | Model name | Life of the project |
| requests | integer | model response | no | Model requests in the run | Life of the project |
| ms | integer | server | no | Run time | Life of the project |
| player_id | uuid, nullable | server | linked; set to null on delete | Cost per player | Life of the project |
| input_tokens, cached_tokens, output_tokens | integer | model response | no | Tokenomics | Life of the project |
| cost_usd | real | code | no | Tokenomics | Life of the project |
| stopped_reason | text | harness | no | Reliability | Life of the project |
| created_at | timestamp | server | no | Analytics | Life of the project |

## self_reports (what a player chooses to tell us; opt-in)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| player_id | uuid | server | linked to a player | Key and scope, one row per player | With the player, or until the player clears it |
| ei, sn, tf, jp | one letter each, nullable | player tap | **yes** (self-described trait) | Compared with the letters the picks suggest (aligned, differs) | Same |
| analyse, organise, explore, connect | integer 1 to 5, nullable | player tap | **yes** (self-described trait) | The band the player's own report gives each thinking style | Same |
| sign | text, one of 12, nullable | player tap | **yes** (narrows the birth date to a month) | Tested as a predictor of picks against the Sym | Same |
| animal | text, one of 12, nullable | player tap | **yes** (narrows the birth year to one in twelve) | Same test | Same |
| updated_at | timestamp | server | no | Freshness | Same |

No birth date is ever asked for. This table is never sent to a model. It is shown on "What my Sym knows",
included in the download, cleared with one button and deleted with the player.

## work (jobs the Sym did; play credits)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| id | uuid | server | no | Key | With the player |
| player_id | uuid | server | linked to a player | Scope; unique with job_id, so a Sym answers a job once | With the player |
| job_id | text | server | no | Which job (content file `backend/data/jobs.json`) | With the player |
| twin_kind | text | code | no | model (the Worker agent) or offline (the practice Sym, no AI model) | With the player |
| answer | text, nullable | Worker agent or code | **yes** (inferred) | The option the Sym chose for its human; null means it did not know | With the player |
| reason | text, 200 chars max | Worker agent | **yes** (inferred, model-written) | One line shown to the player with the answer; cleaned and guarded | With the player |
| verdict | text, nullable | player tap | **yes** | approved or corrected | With the player |
| final_choice | text, nullable | player tap | **yes** (preference) | What the player confirmed; joins the collective split and teaches the Sym | With the player |
| credits | integer | code | no | Play credits paid for the job | With the player |
| created_at, reviewed_at | timestamp | server | no | Ordering | With the player |

A requester sees only the split across all Syms (counts per option), never one player's answer. Requesters are
invented. Credits are play money.

## wallets (where play credits sit)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| id | uuid | server | no | Key | Kept |
| owner_id | uuid, may be empty | server | linked to a player | Whose wallet it is. Empty for the game's own wallets and for a closed wallet | The link is cut when the player deletes their data |
| kind | text | server | no | player, agency or creator; or one of the game's own: bank (outside the game), fund (the growth fund), requesters, platform (token fees), samples, escrow (credits held for posted jobs) | Kept |
| closed | boolean | server | no | True once the owner deleted their data | Kept |
| created_at | timestamp, UTC | server | no | Order | Kept |

A wallet holds no name and no balance. The balance is counted from the transfers each time. When a player deletes
their data, their wallets are closed and the link to the player is removed. The row stays, without the owner, so
that every other wallet's sum still holds.

## transfers (every move of play credits between two wallets)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| id | uuid | server | no | Key | Kept |
| from_wallet | uuid | server | no by itself; linked to a player through an open wallet | Where the credits left | Kept |
| to_wallet | uuid | server | no by itself; linked to a player through an open wallet | Where the credits went | Kept |
| amount | whole number, thousandths of a credit | server | no | How much moved. Always above zero | Kept |
| kind | text | server | no | Why: deposit, grant, work, data, samples, fund_in, growth, fee, royalty, crew, claim, reach (a creator royalty when an agency reaches its players), sponsor, hold and release (credits held for a posted job, and what came back), maker (a royalty to the creator who built a step) | Kept |
| ref | text, may be empty | server | no | The campaign, job, skill step or agent run the move belongs to | Kept |
| created_at | timestamp, UTC | server | no | Order | Kept |

Rows are added and never changed or removed. A row names two wallets, an amount and a reason. It holds no player
id, no nickname, no answer and no question text. A player sees only the moves of their own wallets, and the other
side is shown as a kind ("an agency", "the growth fund"), never as a wallet or a person. Credits are play money;
no real money moves and no payment detail is ever collected.

## active_days (the days a player used the game)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| id | uuid | server | no | Key | With the player |
| player_id | uuid | server | linked to a player | Scope; unique with day, so a day is one row | With the player |
| day | text, a UTC date | server | **yes** (behaviour: when a person is active) | Shows a Sym has a living owner. Sets the Sym's share of data income. Counted for agencies and creators as "how many in this group played lately" | With the player |

Only the date is kept: no time of day, no place, no device, no address. A row is written the first time a player
uses the game on a day. Other event times already exist and are not repeated here: each tap (`responses.created_at`),
each certificate (`certs.issued_at`), each reviewed job (`work.reviewed_at`), each earning (`earnings.created_at`).
The player sees their days on the Data tab and in the download. An agency or a creator sees a count for a group of 5
or more, never a person's days.

## briefs, meets, one_to_one (the creator's crew jobs, and one to one meetings)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| briefs.id | uuid | server | no | Key | With the seat's owner |
| briefs.org_id | uuid | server | linked to a player through the seat | The creator seat that sent its crew | With the seat's owner |
| briefs.kind | text | player tap | no | survey, test, skill (a claim) or build | With the seat's owner |
| briefs.topic | text | player tap, from a fixed list | no | A question id or a skill id | With the seat's owner |
| briefs.audience | text | player tap, from a fixed list | no | The group that was asked | With the seat's owner |
| briefs.Syms, sample_twins, spent | whole numbers | code | no | How many Syms were asked, how many of them are made up, what it cost | With the seat's owner |
| briefs.counts | JSON text | code | no | Counts for each option or band, or the name of the claimed step. Never who answered what | With the seat's owner |
| briefs.created_at | timestamp, UTC | server | no | Order | With the seat's owner |
| meets.id | uuid | server | no | Key | Until either side deletes their data |
| meets.org_id | uuid | server | linked to a player through the seat | The seat that paid | Until either side deletes their data |
| meets.player_id | uuid | server | **linked to a player** | The Sym that was met | Until either side deletes their data |
| meets.paid | whole number | code | no | The royalty | Until either side deletes their data |
| meets.created_at | timestamp, UTC | server | no | Order | Until either side deletes their data |
| one_to_one.player_id | uuid | server | linked to a player | One row per player | With the player |
| one_to_one.on | boolean | player tap | no | Opt-in: a seat may pay to see this Sym's nickname and its answers. Off by default | With the player |
| one_to_one.updated_at | timestamp, UTC | server | no | When the choice was made | With the player |

A meeting is the one place where a seat sees a single Sym: its nickname, its two strongest areas and its answers
to the fixed questions. That view is built fresh each time from the Sym's data, only while its owner keeps one to
one on. Nothing about the Sym is copied into the meets row.

## facts (what a player told their Sym and chose to keep)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| facts.id | uuid | server | no | Key | Until the player removes it or leaves |
| facts.player_id | uuid | server | linked to a player | Scope and deletion | Until the player removes it or leaves |
| facts.scope | text (trait or topic) | Guide agent | no | Whether the fact is true of the person anywhere, or a view about one thing only | Until the player removes it or leaves |
| facts.topic | text, small letters only | Guide agent, cleaned by code | no | What the fact is about | Until the player removes it or leaves |
| facts.statement | text, one sentence | Guide agent, in its own words; checked by code; kept only after the player taps yes | **yes** (told by the player, about the player) | So the Sym can use what its human said about themselves. Never the player's own words | Until the player removes it or leaves |
| facts.created_at | timestamp, UTC | server | no | Order | Until the player removes it or leaves |

## throws (rock, paper, scissors against your own Sym)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| throws.id | uuid | server | no | Key | With the player |
| throws.player_id | uuid | server | linked to a player | Scope and deletion | With the player |
| throws.mine | text (r, p or s) | player tap | no by itself; a long run of them is a habit of one person | What the player threw. The Sym learns its owner's habits from these | With the player |
| throws.Sym | text (r, p or s) | code | no | What the Sym threw, worked out from the earlier rows before this one was written | With the player |
| throws.created_at | timestamp, UTC | server | no | Order | With the player |

## lessons (what a Sym changed after a battle)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| lessons.id | uuid | server | no | Key | With the player |
| lessons.player_id | uuid | server | linked to a player | Scope and deletion | With the player |
| lessons.battle_id | uuid | server | no | Which battle taught it | With the player |
| lessons.kind | text | code | no | changed, new, dropped, count or held | With the player |
| lessons.topic | text | Profiler agent, or the card's own words | no | What the lesson is about | With the player |
| lessons.before, after | text | Profiler agent (guarded like every belief), or code | **yes** (inferred) | The belief as it read before the battle and after it. The proof that the Sym learned | With the player |
| lessons.created_at | timestamp, UTC | server | no | Order | With the player |

## sponsorships, autowork (an agency backs a skill; a Sym may start jobs by itself)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| sponsorships.id | uuid | server | no | Key | With the seat |
| sponsorships.org_id | uuid | server | linked to a player through the seat | The agency that backs the skill. Never shown to a creator or a player | With the seat |
| sponsorships.skill | text | player tap, from a fixed list | no | Which skill | With the seat |
| sponsorships.budget, spent, passes | whole numbers | player tap; code | no | Credits held, credits paid out, and how many passes were paid for. Counts, never who | With the seat |
| sponsorships.closed | boolean | code | no | The credits ran out, or the owner left | With the seat |
| sponsorships.created_at | timestamp, UTC | server | no | Order | With the seat |
| autowork.player_id | uuid | server | linked to a player | One row per player | Until the player leaves |
| autowork.per_day | whole number | player tap, from a fixed list | no | How many jobs the Sym may start by itself in one day. 0 is off, and it is off until chosen | Until the player leaves |
| autowork.updated_at | timestamp, UTC | server | no | When the choice was made | Until the player leaves |

## postings (jobs an agency posted)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| postings.id | text | server | no | "post-" and a random id. Work rows carry it as their job id | With the seat's owner |
| postings.org_id | uuid | server | linked to a player through the seat | The agency that posted the job. Never shown to a player | With the seat's owner |
| postings.question_id | text | player tap, from a fixed list | no | Which fixed question the job asks | With the seat's owner |
| postings.pay, seats | whole numbers | player tap, from fixed lists | no | Credits for one checked answer; how many Syms may take the job | With the seat's owner |
| postings.hold | whole number | code | no | Credits held for each seat: the pay times the certificate multiplier | With the seat's owner |
| postings.closed | boolean | player tap | no | The agency closed the job to new Syms | With the seat's owner |
| postings.created_at | timestamp, UTC | server | no | Order | With the seat's owner |

A posted job reaches a player as "An agency in the game": the agency's name is never sent. The agency sees how
many Syms took the job, how many answers were checked, and the totals for each option, never who. The answers a
Sym gives live in `work`, with the player, as for any job.

## made_steps (skill steps a creator built)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| made_steps.id | text | code | no | The id of the card pack in `backend/data/steps.json`. It is the key, so a step has one maker | With the seat's owner |
| made_steps.org_id | uuid | server | linked to a player through the seat | The creator seat that built the step | With the seat's owner |
| made_steps.cards | JSON text | player taps, from a fixed list | no | The ids of the cards the creator tapped from the pack. No typed text | With the seat's owner |
| made_steps.created_at | timestamp, UTC | server | no | Order | With the seat's owner |

The cards themselves are content we wrote (`backend/data/steps.json`). The right answer of a card never leaves the
server: not to a player, and not to the creator who picks the cards. A creator sees how many other players passed
its step and what that paid, as counts, never who. When the seat's owner deletes their data the row goes and the
step closes; players keep the certificates and credits they earned on it.

## consents, orgs, campaigns, earnings (the market; play credits)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| consents.player_id | uuid | server | linked to a player | One row per player | With the player |
| consents.data_income | boolean | player tap | no | Opt-in: agencies may include this Sym in batch questions. Off by default | With the player |
| consents.updated_at | timestamp | server | no | When the choice was made | With the player |
| orgs.id | uuid | server | no | Key | With the owner |
| orgs.owner_id | uuid | server | linked to a player | The player who opened the seat; one agency per player | With the owner |
| orgs.kind | text | code | no | agency or creator | With the owner |
| orgs.name | text, 2 to 30 chars | player, typed | **yes** (free text; may name a person or a real company) | Shown to its owner only; never sent to a model or to other players | With the owner |
| orgs.budget | integer | code | no | Play credits left | With the owner |
| orgs.created_at | timestamp | server | no | Ordering | With the owner |
| campaigns.id, org_id | uuid | server | no | Key and link | With the owner |
| campaigns.question_id, audience, pay | text, text, integer | player taps | no | What was asked, of whom, at what price per Sym | With the owner |
| campaigns.depth | text | player tap, from a fixed list | no | The price tier: blend (free Syms and members), members, or core (members with a certificate) | With the owner |
| campaigns.Syms, sample_twins, spent | integer | code | no | How many Syms answered, how many of them are made-up, credits charged | With the owner |
| campaigns.counts | json text | code | no (counts per option, 5 Syms or more) | The only result an agency ever gets | With the owner |
| campaigns.created_at | timestamp | server | no | Ordering | With the owner |
| earnings.id | uuid | server | no | Key | With the player |
| earnings.player_id | uuid | server | linked to a player | Whose Sym was paid | With the player |
| earnings.campaign_id | text, nullable | server | no | Which question from an agency (cleared if the agency is deleted, the credits stay); for a growth bonus, "step:" and the gate id, so a step is paid once | With the player |
| earnings.kind | text | code | no | Ad, Recruiting or Course for a question from an agency; "Skill step" for a growth bonus | With the player |
| earnings.credits | integer | code | no | Play credits earned | With the player |
| earnings.created_at | timestamp | server | no | Ordering | With the player |

An agency never sees which Sym chose what: answers are computed, counted and discarded in one request, and only the
counts are stored. The agency name is the one typed field besides the nickname.

## Ontology (content we write, no player data)

`backend/data/ontology.json` maps each gate kind to a bin (preference, games, skills, Sym) and each trait tag to
the axes, thinking styles and faculties it counts toward. The server refuses to start on a tag the file does not know.

## BOT Syms (made up)

193 rows in `players` named "BOT Sym <country>", one for each member state of the United Nations (the list is
`backend/data/countries.json`). Their picks are generated from a fixed seed, so the crowd guess has data on a fresh
copy and the economy has someone in it. They are not people, and no data about any person is in them. The country is
a place label: a bot's tastes are random and are not drawn from, or a claim about, the people of that country.
Their `token_hash` is a marker, not a hash, so nobody can sign in as one. Ten of them also own a seat in `orgs`
(six BOT agencies, four BOT creators). Not PII.

Tables added later in the week (friend guesses, wardrobe and outfits, panel questions, answers and royalties) are
classified here before they are created, with a line in `CHANGELOG.md`.

## Kept in the player's browser (local storage), not on the server

| Key | Holds | PII | Purpose | Retention |
|---|---|---|---|---|
| byt_token | The random player token | no, but a secret: it is the only proof of who the player is | Sent in the `Authorization` header | Until the player deletes their data or clears the browser |
| byt_motion | on or off | no | The player's choice for movement on the sphere | Until cleared |
| byt_speed | a number from 0 to 2 | no | The player's choice for how fast the sphere turns | Until cleared |
| byt_look | mono or light | no | The player's choice of look | Until cleared |

## Derived on request, never stored

The growth fund is one of these: its starting amount, plus every extra an agency paid for asking a group again
(`campaigns.spent` minus Syms times pay), minus every growth bonus paid. No table holds it.

The suggested letters, thinking styles and faculties (`GET /me/mirror`), the sphere and its history (`GET /me/sphere`,
`GET /seats/{seat}/sphere`), the skill trees with the player's place (`GET /skills`), the money view (`GET /me/money`)
and the split across Syms on a job result. Each is rebuilt from the tables above, so it disappears when they do.

## Content files (ours, no player data)

`backend/data/ontology.json` (the map, the seats, the agents, the rule numbers), `backend/data/cards/*.json` (gates
and cards), `backend/data/jobs.json` (jobs from made-up requesters), `backend/data/questions.json` (the six fixed
questions an agency may ask).

## Export for analysts (no PII)

`GET /export/battles.csv`: battle id, deck, n, Sym matches, baseline matches, date. No nickname, no player id.

## Talking to the Sym (nothing is stored)

`POST /twin/ask` takes one line of typed or spoken text, at most 200 characters. It is free text, so it may hold
PII if the player puts it there. It is therefore treated as PII and is not stored: no table, no column, no committed
trail entry holds it. It passes the prompt guard, is read once by the Guide agent, and is gone when the request ends.
The usage row for the run holds token counts only.

## responses.sure (added 2026-11-15)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| responses.sure | integer, nullable (3 sure, 2 think so, 1 a guess) | player tap, on pattern puzzles only | no by itself; with the right or wrong mark it shows how well one person judges their own answers | So the player can see how often they are right when they feel sure. The Sym may read the totals | With the player |

## tendencies.scope (added 2026-11-15)

| Column | Type | Source | PII | Purpose | Retention |
|---|---|---|---|---|---|
| tendencies.scope | text (trait or topic) | Profiler agent | no | Whether a belief holds for the person anywhere or inside its topic only, so a reaction to one situation is not read as a trait | With the player |

