# Conceptual model

In plain language. The machine-readable form of the same ideas is `backend/data/ontology.json`.

## The seats

- A **player** is a person known only by a nickname. A player owns their inputs and can see and delete everything
  stored about them.
- An **agency** is a seat a player may open, under a made-up name, to ask many Syms one question and pay the Syms
  that answer.
- A **creator** is the seat for people who make skills. It is described but not built.

## Playing

- A **card** is one thing to tap: a preference pick, a one-move strategy board, or a reaction. Cards are written by
  us. Each option of a preference card carries a **trait** tag.
- A **gate** is a short run of cards of one kind. Gates sit in **bins** (Preference, Games, Skills, Sym battles).
  The **journey** is the ordered list of gates.
- A **response** is one tap by one player on one card, with how long it took. Some responses are **held out**: the
  Sym may not learn from them, so they can test it. A response cannot be changed.

## The Sym

- A **belief** (stored as a tendency) is one short statement the Profiler agent wrote about a player from their
  responses, with the number of picks behind it. The set of beliefs is the player's **Sym**.
- A **battle** is a test of the Sym: the Sym agent guesses the player's picks on held-out cards, the player then
  picks, and code counts the matches against **the crowd's guess** (what most other players picked).
- A **certificate** is proof. A Sym certificate says the Sym beat the crowd's guess on a topic. A skill certificate
  says the player passed a skill gate at a level. Code issues certificates; no model can.

## The mirror and the sphere (derived, never stored)

- An **axis** is a pair of traits that gives one letter. Four axes give the **suggested type**.
- A **thinking style** and a **faculty** (an area of the mind) are groups of traits. A faculty has a color and a
  loosely associated brain region.
- A **self report** is what a player chooses to tell the Sym: letters, bands, star sign, year animal.
- The **sphere** is the Sym drawn as a map: one slice for each faculty, filled by picks, with gold points for
  finished skill steps. Its **history** is the same map rebuilt at each past moment.
- A **skill** is a tree of steps. A step is either a gate that exists or a step still waiting for a maker.

## The economy

- A **job** is one question from a made-up requester. The Worker agent answers as the player; the player approves or
  corrects; code pays play **credits**. A reviewed job is stored as **work**. This is **work income**.
- A **consent** records that a player turned data income on.
- A **campaign** is one question an agency put to every matching Sym. It stores totals only. Each real Sym that
  answered receives an **earning**. This is **data income**.
- An **org** is an agency (or, later, a creator) opened by a player, with a budget of credits.
- A **usage** row is the token count and real cost of one agent run.

## Relationships

A player has many responses, beliefs, battles, certificates, work rows and earnings, at most one self report, one
consent and one agency. A battle has many predictions. An agency has many campaigns. A campaign has many earnings
and no link to which Sym chose what. A usage row belongs to one run and, until deletion, to one player.

Not built: links between agencies and creators, published skill steps with an owner and a share of earnings, friend
guesses, and any real money.
