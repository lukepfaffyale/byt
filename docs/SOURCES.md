# Sources, and what came from where

This file lists every outside source that was read while BYT was built, when it was read, what BYT already had
before it was read, and what was taken from it afterwards. It exists so that a reader who finds one of these
papers can see plainly which ideas are theirs, which are ours, and in what order things happened.

## The short version

- BYT was designed and built first. The idea was settled on 2026-11-14 and the twin, the battles, the economy,
  the sphere in its four-dimensional frame, the brain picture, talking to the twin, the judgment record and the
  games were built on 2026-11-14 and 2026-11-15.
- All six sources below were found and read on 2026-11-15, after those parts existed. Each was brought in by the
  student because it looked like something BYT already did.
- All six were published before BYT was started. BYT does not claim to have come first. It claims to have been
  built without them.
- One idea was taken from a source after reading it, and it is credited where it is used: the split of a belief
  into a trait of the person and a view about one topic, from VoiceMem (source 6).
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
- **BYT already had, before it was read:** the brain picture on the left; talking to the twin, with one answer
  and one move; beliefs the twin holds about its person; the battle that rewrites a belief after a wrong guess.
- **Taken after reading, and credited:**
  - The split of a belief into a trait of the person and a view about one topic (`tendencies.scope`, and the
    `scope` of a kept fact). This follows their two kinds of persona node: one for the person, one tied to a
    specific thing. Their warning that mixing the two turns a reaction to one situation into a trait is the
    reason it was added.
- **Not taken:** their code, their model, their data, their graph, their retrieval method, and their choice to
  store what a person says and how they sound. BYT stores no words and no sound: at most one short sentence in
  the twin's own words, checked by code, and only after the player taps yes.
- **Where the two differ in aim:** VoiceMem is a memory that lets a voice assistant serve a person. BYT is a twin
  that is tested against its person's unseen choices, earns certificates only by that test, and is owned and paid
  through an economy of players, agencies and creators. None of that is in VoiceMem.

## What is BYT's own

These parts do not come from any source above:

- A twin whose beliefs are tested on picks it has never seen, against what most people pick.
- Certificates issued by code only, earned by play, never bought, and not given for a score that guessing could
  reach.
- Three seats (player, agency, creator), wallets, royalties, the growth fund and the price tiers.
- Totals over at least five twins for any seat, consent before earning, and leaving that removes the person and
  keeps an unnamed twin.
- The judgment record of how sure a player was against how often they were right.

## If a source is added later

Add it here before the idea is used, with the date it was read and what was taken. An idea used without an entry
here is a mistake to be fixed, not a style choice.
