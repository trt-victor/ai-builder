// All method content lives here: phases, stages, questions, tables. Edit this file to change the method.
// No DOM in this file: the server imports it for gate checks and `npm run skill` turns it into the skill's method file.
//
// A `nodes` widget is a table of items stored as layer.type.name. Layers requirements / domain / solution / global
// are Kosanima layers (they become the active knowledge in the repo); release and pulse stay in this app.
// cols: { id, label, ph } is a text property; id 'body' is the item's main text.
//       kind 'select' picks from options; kind 'attach' points a boundary at one item (Kosanima `attaches-to`);
//       kind 'link' connects items with a Kosanima edge (dir 'out' = from this row, 'in' = to this row).
// fixed: rows that always exist and cannot be removed.

export const PHASES = [
  { id: 'blueprint', n: 1, name: 'Blueprint Studio', sub: 'Analyse · Shape · Prototype' },
  { id: 'builder', n: 2, name: 'AI Builder', sub: 'Turn the blueprint into working solutions and capabilities.' },
  { id: 'pulse', n: 3, name: 'AI Pulse', sub: 'Operate, scale and continuously improve for lasting value.' },
];

export const GATES = [['go', 'Go'], ['pivot', 'Pivot'], ['stop', 'Stop']];
export const TASK_STATUS = ['Not started', 'In progress', 'Waiting', 'Done'];

const PRIORITY = ['must', 'should', 'could'];
const SENSITIVITY = ['public', 'internal', 'confidential', 'personal data'];
const AUTONOMY = ['person decides, AI informs', 'AI proposes, person approves', 'AI acts, person reviews exceptions', 'AI acts alone'];
const REQ = ['requirements.requirement'], DOMAIN = ['domain.entity', 'domain.service'], SOLUTION = ['solution.system', 'solution.container', 'solution.component'];

export const STAGES = [
  {
    id: 'knowledge', phase: 'builder', title: 'Knowledge',
    objective: 'Turn the workshop draft into confirmed knowledge: who it is for, what it must do, and which concepts, data and process steps it rests on. Everything that came from the reimagination is a draft until a named person confirms it.',
    steps: [
      { t: 'Review the draft', d: 'Read what came over from the reimagination. Correct it, remove what was only workshop talk, confirm what is true.' },
      { t: 'Write requirements', d: 'One sentence each, with how you would know it is met. Mark must, should or could.' },
      { t: 'Name the knowledge', d: 'List the concepts, data and process steps, with the source system, owner and sensitivity.' },
      { t: 'Connect them', d: 'Link every requirement to the concepts and steps it concerns.' },
    ],
    ask: ['Who would notice first if this requirement were not met?', 'Which data must exist before this works at all, and who owns it today?', 'What did the prototype assume that nobody has checked yet?'],
    ideas: ['Which system is the source of truth for each data item?', 'What is the volume per month, and the peak?', 'Who signs off that a requirement is met?'],
    widgets: [
      { type: 'draft' },
      { type: 'nodes', layer: 'requirements', ntype: 'stakeholder', title: 'Stakeholders', hint: 'People and teams with a stake in the outcome.', min: 1, cols: [
        { id: 'body', label: 'What they need from this', ph: 'Their interest, in their words' }, { id: 'role', label: 'Role / organisation' }] },
      { type: 'nodes', layer: 'requirements', ntype: 'user', title: 'Users', hint: 'The people who will work with the solution day to day.', min: 1, cols: [
        { id: 'body', label: 'What they do with it', ph: 'Input → what the system does → output' }, { id: 'volume', label: 'How many, how often' }] },
      { type: 'nodes', layer: 'requirements', ntype: 'requirement', title: 'Requirements', hint: 'What the solution must do or guarantee.', min: 3, cols: [
        { id: 'body', label: 'The solution must…', ph: 'One sentence' }, { id: 'acceptance', label: 'Met when', ph: 'How we will know' },
        { id: 'priority', label: 'Priority', kind: 'select', options: PRIORITY }, { label: 'Concerns', kind: 'link', edge: 'drives', dir: 'out', to: DOMAIN }] },
      { type: 'nodes', layer: 'domain', ntype: 'entity', defaults: { kind: 'entity' }, title: 'Concepts and data', hint: 'The things the process is about: an order, a claim, an invoice, a decision.', min: 2, cols: [
        { id: 'body', label: 'What it means here' }, { id: 'source', label: 'Source system' }, { id: 'owner', label: 'Owner' },
        { id: 'sensitivity', label: 'Sensitivity', kind: 'select', options: SENSITIVITY }] },
      { type: 'nodes', layer: 'domain', ntype: 'service', title: 'Process steps', hint: 'What happens, in order. These are what the solution will carry out or support.', min: 2, cols: [
        { id: 'body', label: 'What happens and what is hard about it' }, { id: 'who', label: 'Done today by' }] },
      { type: 'nodes', layer: 'requirements', ntype: 'note', title: 'Open points and assumptions', hint: 'Anything not yet known or only assumed. Coach suggestions land here.', cols: [
        { id: 'body', label: 'What we need to find out' }, { id: 'owner', label: 'Who finds out' }] },
      { type: 'gate' },
    ],
  },
  {
    id: 'boundaries', phase: 'builder', title: 'Boundaries',
    objective: 'Define the guardrails before anything is built: what the solution may never do, which data it may touch, where a person decides, and who has the say. Responsible AI by design, not afterwards.',
    steps: [
      { t: 'Work through the risk lenses', d: 'One rule per lens, an owner, and how you will prove it holds.' },
      { t: 'Place the human', d: 'For each decision in the process: who decides, and how much the AI may do alone.' },
      { t: 'Settle decision rights', d: 'Who can say yes, who can say no, who can stop it.' },
    ],
    ask: ['What is the worst thing this solution could do with the data it can reach?', 'Which decision would you not accept from a machine, and why exactly?', 'If the regulator asked tomorrow how a result came about, what would you show?'],
    ideas: ['Which data may never leave the client environment?', 'What happens when the AI is not confident?', 'Who is told when a guardrail is hit?'],
    widgets: [
      { type: 'nodes', layer: 'global', ntype: 'constraint', title: 'Risk lenses', hint: 'These hold for the whole solution. Write a rule that can be checked.', cols: [
        { id: 'body', label: 'The rule', ph: 'The solution must never… / always…' }, { id: 'evidence', label: 'How we prove it' }, { id: 'owner', label: 'Owner' }],
        fixed: [
          { name: 'data-leakage', title: 'Data leakage', ph: 'What may not leave, and to where' },
          { name: 'data-loss', title: 'Data loss', ph: 'What must be recoverable, and how fast' },
          { name: 'data-confidentiality', title: 'Data confidentiality', ph: 'Who may see what' },
          { name: 'responsible-ai', title: 'Responsible AI', ph: 'Fairness, explainability, human oversight' },
          { name: 'regulatory-alignment', title: 'Regulatory alignment', ph: 'EU AI Act risk class, GDPR, sector rules' },
          { name: 'access-and-identity', title: 'Access and identity', ph: 'How people and agents authenticate; least privilege' },
          { name: 'hosting-and-sovereignty', title: 'Hosting and sovereignty', ph: 'Where it runs, which model providers are acceptable' },
        ] },
      { type: 'nodes', layer: 'requirements', ntype: 'constraint', title: 'Where a person decides', hint: 'One row per decision in the process.', min: 1, cols: [
        { id: 'body', label: 'What must be true', ph: 'e.g. payment above 10k is approved by a controller' }, { id: 'autonomy', label: 'Autonomy', kind: 'select', options: AUTONOMY },
        { label: 'Applies to', kind: 'attach', to: REQ }] },
      { type: 'nodes', layer: 'global', ntype: 'note', title: 'Decision rights', hint: 'For the build itself.', cols: [
        { id: 'body', label: 'Who decides' }, { id: 'consulted', label: 'Who is consulted' }],
        fixed: [
          { name: 'decides-scope', title: 'Scope changes' }, { name: 'decides-go-live', title: 'Go-live' },
          { name: 'decides-stop', title: 'Stopping the build' }, { name: 'decides-data-access', title: 'Access to client data' },
        ] },
      { type: 'gate' },
    ],
  },
  {
    id: 'build', phase: 'builder', title: 'Build',
    objective: 'Shape the solution that the engineers will build: keep the prototype and iterate on a copy, lay out the architecture, connect it to the knowledge, and plan the steps. The building itself happens in the repo; this is where it stays organised.',
    steps: [
      { t: 'Keep the prototype', d: 'The original stays frozen. Iterate on the working copy; every change is a new version.' },
      { t: 'Lay out the architecture', d: 'Systems, containers, components and agents, and which knowledge each one realises.' },
      { t: 'Set the conditions', d: 'Environments, data access, test approach and the exit criteria, agreed before building.' },
      { t: 'Plan the steps', d: 'The action list for the build, with owners and dates.' },
    ],
    ask: ['Which existing client system does each component have to talk to?', 'What must be true to call this build finished?', 'What can be reused from something we or the client already have?'],
    ideas: ['One agent per job, not one agent for everything', 'Where does the exception queue live?', 'Which component carries the audit trail?'],
    widgets: [
      { type: 'prototype' },
      { type: 'nodes', layer: 'solution', ntype: 'system', title: 'Systems', hint: 'The solution itself and the systems around it.', min: 1, cols: [{ id: 'body', label: 'What it is for' }, { id: 'owner', label: 'Owner' }] },
      { type: 'nodes', layer: 'solution', ntype: 'container', defaults: { kind: 'app' }, title: 'Containers', hint: 'The deployable parts: applications, services, databases, queues.', cols: [
        { id: 'body', label: 'What it does' }, { id: 'kind', label: 'Kind', kind: 'select', options: ['app', 'service', 'db', 'queue'] },
        { id: 'technology', label: 'Technology' }, { label: 'Part of', kind: 'link', edge: 'contains', dir: 'in', to: ['solution.system'] }] },
      { type: 'nodes', layer: 'solution', ntype: 'component', title: 'Components and agents', hint: 'What does the work inside a container.', min: 1, cols: [
        { id: 'body', label: 'What it does' }, { id: 'role', label: 'Type', kind: 'select', options: ['agent', 'service', 'screen', 'integration', 'data'] },
        { label: 'Part of', kind: 'link', edge: 'contains', dir: 'in', to: ['solution.container'] }, { label: 'Realises', kind: 'link', edge: 'realised-by', dir: 'in', to: DOMAIN }] },
      { type: 'diagram' },
      { type: 'nodes', layer: 'solution', ntype: 'note', title: 'Build conditions', cols: [{ id: 'body', label: 'What is agreed' }, { id: 'owner', label: 'Owner' }],
        fixed: [
          { name: 'environments', title: 'Environments', ph: 'Where it is built and tested; what data is in each' },
          { name: 'integration-and-data-access', title: 'Integration and data access', ph: 'Which systems, through which route, approved by whom' },
          { name: 'test-approach', title: 'Test approach', ph: 'How requirements are checked; who tests with real cases' },
          { name: 'exit-criteria', title: 'Exit criteria', ph: 'What must be true to stop building and release' },
          { name: 'reuse', title: 'Reuse', ph: 'What we take from existing assets instead of building new' },
        ] },
      { type: 'tasks' },
      { type: 'trace' },
      { type: 'gate' },
    ],
  },
  {
    id: 'release', phase: 'builder', title: 'Release',
    objective: 'Deploy to production and prepare for scale: check readiness against what was agreed, take the go-live decision, and hand over to AI Pulse so the solution is operated, not abandoned.',
    steps: [
      { t: 'Check readiness', d: 'Every line done, or deliberately marked not needed with a reason.' },
      { t: 'Hand over', d: 'Write down what compliance, finance and operations each take over.' },
      { t: 'Decide', d: 'Go live, pivot, or stop. Stopping is a legitimate outcome.' },
    ],
    ask: ['Who is called when it breaks on a Sunday?', 'What would make you roll back in the first week?', 'What will you tell the people whose work changes?'],
    ideas: ['Name the support owner before go-live', 'Agree the first review date now', 'Publish the case story, successful or not'],
    widgets: [
      { type: 'trace' },
      { type: 'nodes', layer: 'release', ntype: 'check', title: 'Readiness', cols: [
        { id: 'status', label: 'Status', kind: 'select', options: ['open', 'done', 'not needed'] }, { id: 'body', label: 'Evidence or reason' }, { id: 'owner', label: 'Owner' }],
        fixed: [
          { name: 'exit-criteria-met', title: 'Exit criteria met' }, { name: 'security-review', title: 'Security review done' },
          { name: 'data-protection', title: 'Data protection assessment done' }, { name: 'client-acceptance', title: 'Client acceptance' },
          { name: 'support-owner', title: 'Support owner and runbook' }, { name: 'monitoring', title: 'Monitoring in place' },
          { name: 'rollback', title: 'Rollback plan' }, { name: 'adoption', title: 'Communication and training' },
        ] },
      { type: 'nodes', layer: 'release', ntype: 'handover', title: 'Handover to AI Pulse', cols: [{ id: 'body', label: 'What is handed over' }, { id: 'owner', label: 'Taken over by' }],
        fixed: [
          { name: 'compliance', title: 'Compliance', ph: 'Which boundaries need ongoing review, and how often' },
          { name: 'finance', title: 'Finance', ph: 'Run costs, the value to measure, the baseline' },
          { name: 'perform', title: 'Perform', ph: 'What is monitored and who improves it' },
        ] },
      { type: 'nodes', layer: 'release', ntype: 'note', title: 'Publish and reuse', hint: 'What becomes a credential, a case story or a reusable asset.', cols: [{ id: 'body', label: 'What and for whom' }] },
      { type: 'gate' },
    ],
  },
  {
    id: 'compliance', phase: 'pulse', title: 'Compliance',
    objective: 'Ensure ongoing regulatory, ethical and risk compliance: the boundaries agreed in AI Builder are reviewed on a rhythm, with findings and follow-up.',
    steps: [{ t: 'Plan the reviews', d: 'One line per boundary that needs a recurring look.' }, { t: 'Record findings', d: 'What was found, what changes.' }],
    ask: ['Which boundary has changed since go-live?', 'Has a new rule or model version changed the risk class?'],
    ideas: ['Review access rights each quarter', 'Re-test fairness after each model change'],
    widgets: [
      { type: 'boundaries' },
      { type: 'nodes', layer: 'pulse', ntype: 'review', title: 'Reviews', min: 1, cols: [
        { id: 'body', label: 'Finding and follow-up' }, { id: 'cadence', label: 'Cadence', kind: 'select', options: ['monthly', 'quarterly', 'yearly', 'on change'] },
        { id: 'next', label: 'Next review' }, { id: 'owner', label: 'Owner' }] },
      { type: 'gate' },
    ],
  },
  {
    id: 'finance', phase: 'pulse', title: 'Finance',
    objective: 'Manage costs, measure value and optimise the return: what it costs to run, what it delivers against the baseline, and whether that still justifies it.',
    steps: [{ t: 'List the costs', d: 'Run, licences, model usage, people.' }, { t: 'Measure the value', d: 'Against the baseline agreed at release.' }],
    ask: ['Which cost grows with volume?', 'Is the value measured or estimated?'],
    ideas: ['Cost per case processed', 'Hours returned to the team per month'],
    widgets: [
      { type: 'nodes', layer: 'pulse', ntype: 'cost', title: 'Costs', min: 1, cols: [{ id: 'body', label: 'What it covers' }, { id: 'amount', label: 'Per month' }, { id: 'owner', label: 'Budget owner' }] },
      { type: 'nodes', layer: 'pulse', ntype: 'value', title: 'Value', min: 1, cols: [{ id: 'body', label: 'How it is measured' }, { id: 'baseline', label: 'Baseline' }, { id: 'target', label: 'Target' }, { id: 'actual', label: 'Actual' }] },
      { type: 'gate' },
    ],
  },
  {
    id: 'perform', phase: 'pulse', title: 'Perform',
    objective: 'Monitor, learn and continuously improve people, processes and AI solutions. What is learned here feeds the next build.',
    steps: [{ t: 'Watch the measures', d: 'Quality, speed, adoption.' }, { t: 'Improve', d: 'Turn what you learn into the next change.' }],
    ask: ['Where do people still work around the solution?', 'Which exception keeps coming back?'],
    ideas: ['Share of cases handled without a person', 'Time from request to result'],
    widgets: [
      { type: 'nodes', layer: 'pulse', ntype: 'metric', title: 'Measures', min: 1, cols: [{ id: 'body', label: 'What it tells us' }, { id: 'baseline', label: 'Baseline' }, { id: 'target', label: 'Target' }, { id: 'actual', label: 'Actual' }] },
      { type: 'nodes', layer: 'pulse', ntype: 'improvement', title: 'Improvements', cols: [{ id: 'body', label: 'What changes and why' }, { id: 'status', label: 'Status', kind: 'select', options: ['idea', 'planned', 'done'] }, { id: 'owner', label: 'Owner' }] },
      { type: 'nodes', layer: 'pulse', ntype: 'lesson', title: 'Lessons', hint: 'What the next build should know.', cols: [{ id: 'body', label: 'The lesson' }] },
      { type: 'gate' },
    ],
  },
];
