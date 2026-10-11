---
name: ai-builder
description: |
  Runs the AI Builder phase of AI Leap for one client solution: turns the draft scenario and prototype
  from a Process Reimagination session into confirmed requirements, domain knowledge, guardrails and a
  solution architecture, written as Kosanima active knowledge (requirements / domain / solution / global
  node files) that engineers build from. Use when the user asks to "run the build phase", "turn this
  reimagination output into requirements", "define the requirements and boundaries for this prototype",
  "seed the Kosanima knowledge for this project", "prepare the build for the engineers" or "what is still
  open before we build".
  Do NOT use for running the reimagination workshop itself (use the Process Reimagination app), for
  writing the solution's code, or for steering-committee decks (use storyline-deck-builder).
metadata:
  category: custom
  icon: BuildingFactory
---

# AI Builder

## Overview
A reimagination session ends with a scenario and a prototype that came out of a conversation. Nothing in
it has been checked. This skill takes that draft through the four AI Builder stages (Knowledge,
Boundaries, Build, Release) and prepares the hand-over to AI Pulse (Compliance, Finance, Perform), so
that engineers start from confirmed knowledge instead of workshop notes.

The method lives in ONE place: [references/build_method.md](references/build_method.md). It is generated
from the AI Builder app's content, so the app and this skill always teach the same stages, questions
and tables. Read it on every run; do not restate it from memory.

## Principles
- **Draft until confirmed.** Everything from the workshop, and everything you propose, is a draft. Mark
  it as such. Only a named person confirms an item. Never present a draft as a fact.
- **Ask, do not invent.** Do not make up systems, volumes, owners or regulations. Where something is
  unknown, record it as an open point with who finds out.
- **One spine.** Each requirement is followed down: requirement → concept or process step (`drives`) →
  component (`realised-by`) → code (`implemented-by`). A requirement that stops halfway is a gap.
- **Boundaries before build.** The risk lenses and the human decision points are written before the
  architecture, and each one says how it will be proven.
- **The prototype is kept.** The original prototype is never edited. Work continues on copies.
- **This skill organises the build; it does not write the solution.**

## Inputs
1. The reimagination output: the summary (`reimagination-summary.md`), the session, or the prototype.
2. Who is involved: client sponsor, users, EY lead, engineers.
3. The target repository, if the Kosanima knowledge is to be written there.

If the AI Builder app is in use, work in the app (or through its API) so the client and engineers see
the same thing. Use this skill on its own when the app is not available.

## Steps
1. Read `references/build_method.md`.
2. **Take stock.** List what the reimagination produced and mark every item as draft. Say what the
   prototype assumes that nobody has checked.
3. **Knowledge.** Walk the "What to capture" tables of the Knowledge stage in order. Use the stage's
   questions. Write each requirement as one sentence with a "met when". Link each requirement to the
   concepts and process steps it concerns.
4. **Boundaries.** Go through every risk lens by name; none may be skipped silently (write "not
   applicable because …" if so). For each decision in the process, record who decides and the autonomy
   level. Record decision rights for the build itself.
5. **Build.** Lay out systems, containers, components and agents; link components to the knowledge they
   realise. Record environments, data access, test approach, exit criteria and reuse. Draft the build
   plan as steps with owners.
6. **Check the spine.** For every requirement state: confirmed? met-when? boundary? knowledge? solution?
   List the gaps in plain words.
7. **Gate.** Present the open points and ask for the decision: go, pivot or stop. A go with open points
   needs a written reason from the lead.
8. **Release and Pulse.** Before go-live, fill the readiness list and the three hand-overs. After
   go-live, the Pulse stages are reviewed on a rhythm.

## Writing Kosanima knowledge
When asked to seed the repository, write one node per item exactly as the method file names it
(`layer.type.name`, name in kebab-case), with the item's text as the body and string properties
(`title`, `acceptance`, `priority`, `owner`, `origin`, `confirmed-by`, …). Boundaries on a single item
carry `attaches-to`. Use the Kosanima tools (`node add`, `edge add`, session save) in a project branch;
do not hand-edit node files. Only confirmed items, or items clearly marked as draft, go in.

## Output
- The filled tables per stage, with draft / confirmed status per item.
- The traceability table (one row per requirement).
- The list of open points and unanswered questions, each with an owner.
- The gate recommendation with the reason.
