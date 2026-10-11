# AI Builder method

_Generated from `public/content.js` by `npm run skill`. Do not edit by hand._

Layers `requirements`, `domain`, `solution` and `global` are Kosanima layers: items there become node files `<layer>/<type>/<name>.json` in the repository. `release` and `pulse` stay in the AI Builder app.

Every stage ends with a gate: go, pivot, stop. Going ahead with open points needs a written reason.

## Phase 2: AI Builder

Turn the blueprint into working solutions and capabilities.

### Knowledge

Turn the workshop draft into confirmed knowledge: who it is for, what it must do, and which concepts, data and process steps it rests on. Everything that came from the reimagination is a draft until a named person confirms it.

**Steps**
1. Review the draft: Read what came over from the reimagination. Correct it, remove what was only workshop talk, confirm what is true.
2. Write requirements: One sentence each, with how you would know it is met. Mark must, should or could.
3. Name the knowledge: List the concepts, data and process steps, with the source system, owner and sensitivity.
4. Connect them: Link every requirement to the concepts and steps it concerns.

**Questions to ask**
- Who would notice first if this requirement were not met?
- Which data must exist before this works at all, and who owns it today?
- What did the prototype assume that nobody has checked yet?

**What to capture**
- **Stakeholders** — `requirements.stakeholder`, at least 1. People and teams with a stake in the outcome. Columns: What they need from this; Role / organisation.
- **Users** — `requirements.user`, at least 1. The people who will work with the solution day to day. Columns: What they do with it; How many, how often.
- **Requirements** — `requirements.requirement`, at least 3. What the solution must do or guarantee. Columns: The solution must…; Met when; Priority (must / should / could); Concerns (link: drives).
- **Concepts and data** — `domain.entity`, at least 2. The things the process is about: an order, a claim, an invoice, a decision. Columns: What it means here; Source system; Owner; Sensitivity (public / internal / confidential / personal data).
- **Process steps** — `domain.service`, at least 2. What happens, in order. These are what the solution will carry out or support. Columns: What happens and what is hard about it; Done today by.
- **Open points and assumptions** — `requirements.note`. Anything not yet known or only assumed. Coach suggestions land here. Columns: What we need to find out; Who finds out.

### Boundaries

Define the guardrails before anything is built: what the solution may never do, which data it may touch, where a person decides, and who has the say. Responsible AI by design, not afterwards.

**Steps**
1. Work through the risk lenses: One rule per lens, an owner, and how you will prove it holds.
2. Place the human: For each decision in the process: who decides, and how much the AI may do alone.
3. Settle decision rights: Who can say yes, who can say no, who can stop it.

**Questions to ask**
- What is the worst thing this solution could do with the data it can reach?
- Which decision would you not accept from a machine, and why exactly?
- If the regulator asked tomorrow how a result came about, what would you show?

**What to capture**
- **Risk lenses** — `global.constraint`. These hold for the whole solution. Write a rule that can be checked. Columns: The rule; How we prove it; Owner.
  - `data-leakage` Data leakage: What may not leave, and to where
  - `data-loss` Data loss: What must be recoverable, and how fast
  - `data-confidentiality` Data confidentiality: Who may see what
  - `responsible-ai` Responsible AI: Fairness, explainability, human oversight
  - `regulatory-alignment` Regulatory alignment: EU AI Act risk class, GDPR, sector rules
  - `access-and-identity` Access and identity: How people and agents authenticate; least privilege
  - `hosting-and-sovereignty` Hosting and sovereignty: Where it runs, which model providers are acceptable
- **Where a person decides** — `requirements.constraint`, at least 1. One row per decision in the process. Columns: What must be true; Autonomy (person decides, AI informs / AI proposes, person approves / AI acts, person reviews exceptions / AI acts alone); Applies to (attaches-to).
- **Decision rights** — `global.note`. For the build itself. Columns: Who decides; Who is consulted.
  - `decides-scope` Scope changes
  - `decides-go-live` Go-live
  - `decides-stop` Stopping the build
  - `decides-data-access` Access to client data

### Build

Shape the solution that the engineers will build: keep the prototype and iterate on a copy, lay out the architecture, connect it to the knowledge, and plan the steps. The building itself happens in the repo; this is where it stays organised.

**Steps**
1. Keep the prototype: The original stays frozen. Iterate on the working copy; every change is a new version.
2. Lay out the architecture: Systems, containers, components and agents, and which knowledge each one realises.
3. Set the conditions: Environments, data access, test approach and the exit criteria, agreed before building.
4. Plan the steps: The action list for the build, with owners and dates.

**Questions to ask**
- Which existing client system does each component have to talk to?
- What must be true to call this build finished?
- What can be reused from something we or the client already have?

**What to capture**
- **Systems** — `solution.system`, at least 1. The solution itself and the systems around it. Columns: What it is for; Owner.
- **Containers** — `solution.container`. The deployable parts: applications, services, databases, queues. Columns: What it does; Kind (app / service / db / queue); Technology; Part of (link: contains).
- **Components and agents** — `solution.component`, at least 1. What does the work inside a container. Columns: What it does; Type (agent / service / screen / integration / data); Part of (link: contains); Realises (link: realised-by).
- **Build conditions** — `solution.note`. Columns: What is agreed; Owner.
  - `environments` Environments: Where it is built and tested; what data is in each
  - `integration-and-data-access` Integration and data access: Which systems, through which route, approved by whom
  - `test-approach` Test approach: How requirements are checked; who tests with real cases
  - `exit-criteria` Exit criteria: What must be true to stop building and release
  - `reuse` Reuse: What we take from existing assets instead of building new

### Release

Deploy to production and prepare for scale: check readiness against what was agreed, take the go-live decision, and hand over to AI Pulse so the solution is operated, not abandoned.

**Steps**
1. Check readiness: Every line done, or deliberately marked not needed with a reason.
2. Hand over: Write down what compliance, finance and operations each take over.
3. Decide: Go live, pivot, or stop. Stopping is a legitimate outcome.

**Questions to ask**
- Who is called when it breaks on a Sunday?
- What would make you roll back in the first week?
- What will you tell the people whose work changes?

**What to capture**
- **Readiness** — `release.check`. Columns: Status (open / done / not needed); Evidence or reason; Owner.
  - `exit-criteria-met` Exit criteria met
  - `security-review` Security review done
  - `data-protection` Data protection assessment done
  - `client-acceptance` Client acceptance
  - `support-owner` Support owner and runbook
  - `monitoring` Monitoring in place
  - `rollback` Rollback plan
  - `adoption` Communication and training
- **Handover to AI Pulse** — `release.handover`. Columns: What is handed over; Taken over by.
  - `compliance` Compliance: Which boundaries need ongoing review, and how often
  - `finance` Finance: Run costs, the value to measure, the baseline
  - `perform` Perform: What is monitored and who improves it
- **Publish and reuse** — `release.note`. What becomes a credential, a case story or a reusable asset. Columns: What and for whom.

## Phase 3: AI Pulse

Operate, scale and continuously improve for lasting value.

### Compliance

Ensure ongoing regulatory, ethical and risk compliance: the boundaries agreed in AI Builder are reviewed on a rhythm, with findings and follow-up.

**Steps**
1. Plan the reviews: One line per boundary that needs a recurring look.
2. Record findings: What was found, what changes.

**Questions to ask**
- Which boundary has changed since go-live?
- Has a new rule or model version changed the risk class?

**What to capture**
- **Reviews** — `pulse.review`, at least 1. Columns: Finding and follow-up; Cadence (monthly / quarterly / yearly / on change); Next review; Owner.

### Finance

Manage costs, measure value and optimise the return: what it costs to run, what it delivers against the baseline, and whether that still justifies it.

**Steps**
1. List the costs: Run, licences, model usage, people.
2. Measure the value: Against the baseline agreed at release.

**Questions to ask**
- Which cost grows with volume?
- Is the value measured or estimated?

**What to capture**
- **Costs** — `pulse.cost`, at least 1. Columns: What it covers; Per month; Budget owner.
- **Value** — `pulse.value`, at least 1. Columns: How it is measured; Baseline; Target; Actual.

### Perform

Monitor, learn and continuously improve people, processes and AI solutions. What is learned here feeds the next build.

**Steps**
1. Watch the measures: Quality, speed, adoption.
2. Improve: Turn what you learn into the next change.

**Questions to ask**
- Where do people still work around the solution?
- Which exception keeps coming back?

**What to capture**
- **Measures** — `pulse.metric`, at least 1. Columns: What it tells us; Baseline; Target; Actual.
- **Improvements** — `pulse.improvement`. Columns: What changes and why; Status (idea / planned / done); Owner.
- **Lessons** — `pulse.lesson`. What the next build should know. Columns: The lesson.
