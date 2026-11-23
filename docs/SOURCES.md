# Sources, and what came from where

This file lists every outside source that was read while BYT was built, when it was read, what BYT already had
before it was read, and what was taken from it afterwards. It exists so that a reader who finds one of these
papers can see plainly which ideas are theirs, which are ours, and in what order things happened.

## The short version

- BYT was designed and built first. The idea was settled on 2026-11-14 and the Sym, the battles, the economy,
  the sphere in its four-dimensional frame, the brain picture, talking to the Sym, the judgment record and the
  games were built on 2026-11-14 and 2026-11-15.
- All six sources below were found and read on 2026-11-15, after those parts existed. Each was brought in by the
  student because it looked like something BYT already did.
- All six were published before BYT was started. BYT does not claim to have come first. It claims to have been
  built without them.
- Four ideas were taken from one source after reading it, and each is credited where it is used. All four come
  from VoiceMem (source 6): the split of a belief into a trait and a view about one topic; a fixed list of topics
  over what the Sym knows; choosing the relevant part before the model is sent anything; and needs that emerge
  from what is asked for together.
- No code, data, model, figure or text from any source is in this project. Nothing was cloned, installed or run.

## How this can be checked, and the limit of the check

- `docs/data/CHANGELOG.md` and `RESUME.md` hold dated notes of each change, written as the work was done.
- The working session in which BYT was built records the order: each feature, then each paper as the student
  shared it. That record is kept outside this repository.
- The limit: this project had no version control while it was built, so there is no commit history to prove the
  dates. The notes above are the evidence. From the first commit onward, the history will show it.

## The sources

Each was read through the publisher's page, the abstract, or the text the student supplied. Where only part was
read, that is said.

### 1. Marzbani, Marateb and Mansourian (2016)

"Neurofeedback: A Comprehensive Review on System Design, Methodology and Clinical Applications." *Basic and
Clinical Neuroscience*, 7(2), 143 to 158. https://pmc.ncbi.nlm.nih.gov/articles/PMC4892319/

- **Read:** 2026-11-15, about the first two thirds of the text.
- **BYT already had:** the loop of measure, show back, correct, measure again (the battle that rewrites beliefs,
  the judgment record, rock, paper, scissors).
- **Taken:** nothing in the code. It is cited as an established example of a feedback loop.
- **Not the same thing:** the paper is about brain signals recorded at the scalp. BYT records choices, timing and
  how sure a player says they are. BYT measures no brain signal.

### 2. Kopańska, Ochojska, Dejnowicz-Velitchkov and Banaś-Ząbczyk (2022)

"Quantitative Electroencephalography (QEEG) as an Innovative Diagnostic Tool in Mental Disorders."
*International Journal of Environmental Research and Public Health*, 19(4), 2465.
https://pmc.ncbi.nlm.nih.gov/articles/PMC8879113/

- **Read:** 2026-11-15, in full.
- **Taken:** nothing. It is a clinical case series of five patients. BYT makes no health claim and collects no
  health data.

### 3. Bosch-Bayard and colleagues (2026)

"Back to the Future of qEEG: Lifespan Normative Modeling of Spectral Ratios and Functional Indices with
Potential Applications to Therapeutic Monitoring." *Brain Topography*, published 31 July 2026.
https://www.scienceopen.com/document/read?vid=79829d1f-ffd4-48bd-b26c-fb0fbfc1ca93

- **Read:** 2026-11-15, the abstract, the limitations and the conclusions.
- **BYT already had:** small comparisons against other players (the crowd's guess, how many other players solved
  a puzzle, insight certificates).
- **Taken:** nothing built. The idea of placing one person's measure against a population is noted as possible
  later work, and would be credited to this paper if built.

### 4. Kopańska, Trojniak and Pachalska (2026)

"Quantitative electroencephalography as a next-generation tool in neurodiagnostics: significance, clinical
applications, and practical interpretative frameworks." *Frontiers in Neuroscience*, 20, published 3 August 2026.
https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2026.1834391/full

- **Read:** 2026-11-15, about the first third of the text. Figure 1 was read from its caption and description.
- **BYT already had:** a brain picture with two halves and seven named areas, each growing from one seed.
- **Taken:** nothing built. Figure 1 shows the standard maps of electrode positions on the head. The resemblance
  is that both are maps of named places on two halves of a head. The paper's places are where a signal is
  recorded; BYT's are where an area is drawn.

### 5. Tozzi and Peters (2016)

"Towards a fourth spatial dimension of brain activity." *Cognitive Neurodynamics*, 10(3), 189 to 199.
https://pmc.ncbi.nlm.nih.gov/articles/PMC4870410/

- **Read:** 2026-11-15, the abstract only (the publisher does not release the full text through the official
  service).
- **BYT already had:** a sphere of points held inside a tesseract, with the frame turning through its fourth
  direction, and time as that fourth direction.
- **Taken:** nothing built. The paper proposes that brain activity can be read on a sphere in four dimensions.
  Its fourth dimension is space; BYT's is time. It is a hypothesis with a proposed test, not a finding.

### 6. Xie, Lang, An, Zhao, Yang, Li, Ma, Lin, Miao and Yan (2026): VoiceMem

"VoiceMem: Streaming Dual-Brain Memory for Real-Time Interaction." arXiv:2608.26005v1, 26 August 2026.
https://arxiv.org/abs/2608.26005 and https://xzf-thu.github.io/VoiceMem/

- **Read:** 2026-11-15, in full, from the text of the paper.
- **BYT already had, before it was read:** the brain picture on the left; talking to the Sym, with one answer
  and one move; beliefs the Sym holds about its person; the battle that rewrites a belief after a wrong guess.
- **Taken after reading, and credited:**
  - The split of a belief into a trait of the person and a view about one topic (`tendencies.scope`, and the
    `scope` of a kept fact). This follows their two kinds of persona node: one for the person, one tied to a
    specific thing. Their warning that mixing the two turns a reaction to one situation into a trait is the
    reason it was added.
  - A fixed list of topics (`topics` in the ontology, `content.topic_id`), with one belief for each topic and a
    group an agency can ask ("has a view on"). Theirs is a two-level index of topics and the things inside them.
    Ours is one level, set by hand, and tied to our market.
  - Sending the model only the part a line is about (`main.narrow`). Theirs matches topics while a person is
    still speaking and searches a small pool. Ours is a short list of plain words that picks which parts of the
    situation to send.
  - Needs that emerge from use (`main.demand`): pairs of skills that several agencies want together, shown to
    creators. Theirs promotes memories that are recalled together into a new topic, with a model as judge. Ours
    is plain counting, with no model, over what agencies asked for.
  - The marked points for beliefs on the brain picture follow from the fixed list of topics.
- **What a test showed:** the first idea (trait or topic) gave no measured gain in a small test: two steady
  players, 35 of 40 with it and 37 of 40 without. It is kept because it is cheap and it names a real mistake,
  not because it is proven. The other three are not yet measured against the real model.
- **Not taken:** their code, their model, their data, their graph, their retrieval method, and their choice to
  store what a person says and how they sound. BYT stores no words and no sound: at most one short sentence in
  the Sym's own words, checked by code, and only after the player taps yes.
- **Where the two differ in aim:** VoiceMem is a memory that lets a voice assistant serve a person. BYT is a Sym
  that is tested against its person's unseen choices, earns certificates only by that test, and is owned and paid
  through an economy of players, agencies and creators. None of that is in VoiceMem.

### 7. A song: Venjent, "Till Death We Do Art"

- **What it is:** a piece of music, named by the student from memory. It was not looked up or checked for this file.
- **What came from it:** an idea, heard in one of its lines: that something is without color on its own and in
  full color together with others. In BYT a Sym is drawn in white until it connects with other people (a checked
  job, a question answered for an agency, the choice to earn), and color comes in as it does.
- **What was removed on 2026-11-15:** an early build showed that idea on two screens in wording close to the
  song's. The student asked for it to be said in our own words. It now reads "Color comes from other people."
  No lyric is used anywhere in the project.

## What is BYT's own

These parts do not come from any source above:

- A Sym whose beliefs are tested on picks it has never seen, against what most people pick.
- Certificates issued by code only, earned by play, never bought, and not given for a score that guessing could
  reach.
- Three seats (player, agency, creator), wallets, royalties, the growth fund and the price tiers.
- Totals over at least five Syms for any seat, consent before earning, and leaving that removes the person and
  keeps an unnamed Sym.
- The judgment record of how sure a player was against how often they were right.

## If a source is added later

Add it here before the idea is used, with the date it was read and what was taken. An idea used without an entry
here is a mistake to be fixed, not a style choice.

## Look and mood of the crew scene (added 2026-11-16)

The student named five films as the mood to aim at for the scene that shows a crew at work: Blade Runner 2049,
Foundation (the television series), Interstellar, Dune and The Terminator. They are named here as inspiration
only. No image, frame, design, name, character, music or text from any of them is used. Every drawing in the
project is made by its own code. Each film belongs to its owners, and nothing here is official, licensed or for
sale.

## Prices and market figures (added 2026-11-22)

These are the outside numbers the report and the slides use. Each was read on the date shown. A price can change, so
the report gives the date beside each one.

- DataReportal, *Digital 2026 Global Overview Report* (October 2025, from GWI data): online adults spend about 33 and
  a half hours a week on online media. Read 2026-11-21.
- Prolific, pricing and researcher help pages: researchers are advised to pay 12 US dollars an hour, and the
  platform adds a fee of 42.8 percent for companies. Read 2026-11-21. An 8 dollar minimum and a university fee were
  seen on other pages and could not be confirmed on Prolific's own, so the report does not use them.
- Synthetic Users, its own site: its own words for its participants. Read 2026-11-21.
- Render, compute plan list: free, and 0.5 CPU with 512 MB at 7 US dollars a month. Read 2026-11-21 and 2026-11-22.
- Supabase, pricing page: the free plan holds 500 MB and pauses after a week without activity. Read 2026-11-21.
- Model token prices for `gpt-6-luna`: the rates set in `backend/agent.py` (`PRICES`). Every dollar figure in the
  report is token counts from real runs times those rates. It is not a bill.
