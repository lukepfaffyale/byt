# The ontology

`backend/data/ontology.json` is the one map of BYT. Code reads the content parts of it at start. A test
(`backend/tests/test_governance.py`) checks the agents and the rule numbers in it against the code.

## What each part says

| Part | Says | Used by |
|---|---|---|
| `bins` | Which kind of gate sits in which bin on the journey | `content.py`, the journey screen |
| `axes` | Which pair of traits gives which letter | `mirror.py`, the Type tab |
| `styles` | The four thinking styles: traits, a definition, a strength, a caution, the skills that help | `mirror.py`, the Mind tab, the agency's groups |
| `faculties` | The seven areas of the mind: traits, a color, a loosely associated brain region, a definition, a fact, the skills that help | `mirror.py`, the Brain tab, the sphere |
| `skills` | Each skill tree and its steps; a step with a gate exists, a step without one is waiting for a maker | `main.py` (`GET /skills`), the Skills tab, the creator seat |
| `seats` | Player, agency, creator: what each gives, gets, sees and never sees; the agency's sphere slices | `market.py`, the seat spheres, this record |
| `incomes` | Work income and data income: who answers, whether a person checks, who pays, what decides | This record; the rules live in `work.py` and `market.py` |
| `agents` | The register of AI agents: seat served, job, one tool, what it reads, what it never reads, its output, how the output is checked | Tested against `agent.py`, `tools.py` and the prompt files |
| `rules` | Every number a rule runs on, with where it lives in code and why | Tested against the code |
| `groups` | The clusters on the agency and creator spheres: one for each thinking style, one for twins still forming, other agencies, creators; each with a color | `market.py`, the seat spheres |
| `principles` | How worth is weighed: never by money. Each principle names the code that keeps it | Tested in `test_governance.py` |
| `unmapped` | Trait tags that deliberately count toward nothing | `content.py` |

## The path from a tap to a recommendation

1. A player taps an option. The option carries a **trait** tag.
2. The trait counts toward an **axis** (a letter), a **thinking style** and a **faculty**.
3. The faculty's slice of the **sphere** fills, and the leading and weakest styles are found.
4. Each style and faculty names the **skills** that help it. The Mind tab recommends: go deeper in the strongest,
   grow the weakest.
5. A skill is a tree of **steps**. A finished step can earn a **certificate**, and turns points on the sphere gold.
6. A certificate raises what the twin earns from **work**.

Every arrow in that path is plain code reading this file. No model is on the path.

## Adding to it

- A new trait tag: add it to an axis, a style, a faculty or `unmapped` first. The server refuses to start on a tag
  it does not know, and on a skill or gate id that does not exist.
- A new gate: a file in `backend/data/cards/`, using a kind that a bin lists.
- A new skill step: name it under a skill; give it a `gate` when the gate exists.
- A new agent: add it to `agents` with its one tool and what it never reads, then build it in the harness. The
  test fails until the register and the code agree.
- A new rule number: add it to `rules` with where and why. The test fails until it matches the code.

## Honest limits

- The brain regions are loose textbook associations for orientation. The facts were written from general knowledge
  and are not yet checked against sources. Nothing here measures a brain.
- The four letters and the thinking styles are our own reading from our own cards. They are not the official test
  of any publisher.
- The fill numbers on the spheres (30 cards for a faculty, 100 answers and 5 questions for an agency) are choices,
  not findings.
