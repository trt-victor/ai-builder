// Pure logic (no DOM, no database): shared by the browser, the server and `node --test`.

// Node types per layer. The first four layers and their types are Kosanima's catalog; release and pulse are this app's own.
export const LAYERS = {
  requirements: ['stakeholder', 'user', 'requirement', 'note', 'constraint'],
  domain: ['group', 'entity', 'value', 'service', 'note', 'constraint'],
  solution: ['system', 'container', 'component', 'person', 'note', 'constraint'],
  global: ['constraint', 'note'],
  release: ['check', 'handover', 'note'],
  pulse: ['review', 'cost', 'value', 'metric', 'improvement', 'lesson'],
};
export const KOSANIMA_LAYERS = ['requirements', 'domain', 'solution', 'global'];
export const ROLES = ['lead', 'engineer', 'colleague', 'client'];

// The edges this app creates, as [kind, from layer, from types, to layer, to types] (a subset of Kosanima's matrix).
const EDGES = [
  ['contains', 'solution', ['system'], 'solution', ['container']],
  ['contains', 'solution', ['container'], 'solution', ['component']],
  ['drives', 'requirements', ['requirement'], 'domain', ['group', 'entity', 'value', 'service']],
  ['realised-by', 'domain', ['group', 'entity', 'service'], 'solution', ['system', 'container', 'component']],
  ['depends-on', 'requirements', ['requirement'], 'requirements', ['requirement']],
];
export function edgeOk(kind, from, to) {
  const [fl, ft] = String(from).split('.'), [tl, tt] = String(to).split('.');
  return EDGES.some(([k, a, as, b, bs]) => k === kind && a === fl && as.includes(ft) && b === tl && bs.includes(tt));
}

export const fqn = (n) => `${n.layer}.${n.type}.${n.name}`;
export const validName = (s) => typeof s === 'string' && s.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
export const slug = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'item';
export const title = (n) => n.properties.title || n.name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const confirmed = (n) => !!n.properties['confirmed-by'];
const filled = (n) => !!(n && n.body.trim());

/* ---------- roles ---------- */
export function stageOf(layer, type) {
  if (layer === 'global' || type === 'constraint') return 'boundaries';
  if (layer === 'requirements' || layer === 'domain') return 'knowledge';
  return layer === 'solution' ? 'build' : layer; // release, pulse
}
// Actions: read, ask (questions and answers), edit (items of a stage), gate, members.
export function can(role, action, stage) {
  if (!ROLES.includes(role)) return false;
  if (action === 'read' || action === 'ask') return true;
  if (role === 'lead') return true;
  if (action !== 'edit') return false;
  if (role === 'engineer') return true;
  if (role === 'colleague') return stage === 'knowledge' || stage === 'boundaries';
  return stage === 'knowledge'; // client
}

/* ---------- traceability ---------- */
const nodesOf = (B, layer, type) => B.nodes.filter((n) => n.layer === layer && n.type === type);
const targets = (B, from, kind) => B.edges.filter((e) => e.from_fqn === from && e.kind === kind).map((e) => e.to_fqn);

// One row per requirement along the Kosanima spine: requirement -drives-> domain -realised-by-> solution -implemented-by-> code.
export function readiness(B) {
  return nodesOf(B, 'requirements', 'requirement').map((n) => {
    const f = fqn(n), dom = targets(B, f, 'drives'), sol = dom.flatMap((d) => targets(B, d, 'realised-by'));
    return {
      fqn: f, title: title(n), confirmed: confirmed(n), acceptance: !!(n.properties.acceptance || '').trim(),
      boundary: B.nodes.some((c) => c.type === 'constraint' && c.properties['attaches-to'] === f),
      domain: dom.length > 0, solution: sol.length > 0, code: sol.some((s) => targets(B, s, 'implemented-by').length > 0),
    };
  });
}

// What is still open on a stage, in plain words. Feeds the coach, the overview and the gate.
export function gaps(stage, B) {
  const out = [], plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  for (const w of stage.widgets) {
    if (w.type !== 'nodes') continue;
    const rows = nodesOf(B, w.layer, w.ntype).filter((n) => !w.fixed || w.fixed.some((fx) => fx.name === n.name));
    if (w.fixed) {
      const settled = (n) => filled(n) || ['done', 'not needed'].includes(n?.properties.status);
      const empty = w.fixed.filter((fx) => !settled(rows.find((n) => n.name === fx.name)));
      if (empty.length) out.push(`${w.title}: ${empty.map((fx) => fx.title).join(', ')} still empty.`);
    } else if (w.min && rows.length < w.min) out.push(`${w.title}: ${rows.length} so far, aim for at least ${w.min}.`);
    const draft = rows.filter((n) => filled(n) && !confirmed(n)).length;
    if (draft) out.push(`${w.title}: ${plural(draft, 'item is', 'items are')} not confirmed yet.`);
  }
  const r = readiness(B), count = (k) => r.filter((x) => !x[k]).length;
  if (stage.id === 'knowledge' && r.length) {
    if (count('acceptance')) out.push(`${plural(count('acceptance'), 'requirement has', 'requirements have')} no "met when".`);
    if (count('domain')) out.push(`${plural(count('domain'), 'requirement is', 'requirements are')} not linked to a concept or process step.`);
  }
  if (stage.id === 'build' && count('solution')) out.push(`${plural(count('solution'), 'requirement is', 'requirements are')} not yet realised by a component.`);
  if (stage.id === 'release') {
    const open = nodesOf(B, 'release', 'check').filter((n) => n.properties.status === 'open').length;
    if (open) out.push(`Readiness: ${plural(open, 'line is', 'lines are')} still open.`);
    if (count('solution')) out.push(`${plural(count('solution'), 'requirement is', 'requirements are')} not realised by the solution.`);
  }
  const unanswered = (B.questions || []).filter((q) => !q.answer && (stage.widgets.some((w) => w.type === 'nodes' && q.about.startsWith(`${w.layer}.${w.ntype}.`)) || (!q.about && stage.id === 'knowledge'))).length;
  if (unanswered) out.push(`${plural(unanswered, 'question is', 'questions are')} waiting for an answer.`);
  return out;
}
export const lastGate = (B, stageId) => B.gates.filter((g) => g.stage === stageId).at(-1) || null;

/* ---------- import from the reimagination app ---------- */
// Turns a finished reimagination session into a draft build. Nothing is confirmed: it is workshop output.
export function importSession(S) {
  const s = (v, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const f = S && typeof S.f === 'object' && S.f ? S.f : {}, sc = S && typeof S.scenario === 'object' ? S.scenario : null;
  const steps = Array.isArray(sc?.steps) ? sc.steps : [], nodes = [], edges = [], used = new Set();
  const add = (layer, type, ttl, body, props = {}) => {
    ttl = s(ttl, 120); if (!ttl) return null;
    let name = slug(ttl); for (let i = 2; used.has(`${layer}.${type}.${name}`); i++) name = `${slug(ttl).slice(0, 56)}-${i}`;
    used.add(`${layer}.${type}.${name}`);
    nodes.push({ layer, type, name, body: s(body), properties: { title: ttl, origin: 'reimagination', ...props } });
    return `${layer}.${type}.${name}`;
  };
  add('requirements', 'user', s(f.user).split(/[.\n]/)[0] || '', f.user);
  const notes = Array.isArray(S?.notes) ? S.notes : [];
  const service = {};
  for (const st of Array.isArray(S?.steps) ? S.steps : []) {
    const friction = notes.filter((n) => n.zone === 'fr:' + st.id && s(n.text)).map((n) => s(n.text, 300));
    service[s(st.name).toLowerCase()] = add('domain', 'service', st.name, friction.length ? 'Friction today: ' + friction.join(' · ') : '');
  }
  const jobs = (Array.isArray(S?.rows?.jtbd) ? S.rows.jtbd : []).filter((r) => s(r?.job));
  const reqs = jobs.length ? jobs.map((r) => [r.job, r.why, { who: s(r.who, 10) }]) : steps.slice(1, -1).map((x) => [x.name, x.does, {}]);
  for (const [ttl, body, props] of reqs) {
    const from = add('requirements', 'requirement', ttl, body, props), to = service[s(ttl).toLowerCase()];
    if (from && to) edges.push({ kind: 'drives', from_fqn: from, to_fqn: to });
  }
  for (const x of steps) if (s(x.agent)) add('solution', 'component', x.agent, `Supports "${s(x.name, 80)}": ${s(x.does, 400)}`, { role: 'agent' });
  for (const [layer, ttl, body] of [['requirements', 'Intended outcome', f.outcome], ['requirements', 'Intended value', f.value || sc?.value], ['requirements', 'Data requirements from the canvas', f.data], ['requirements', 'Tech stack from the canvas', f.tech]])
    if (s(body)) add(layer, 'note', ttl, body);
  return {
    name: s(f.usecase, 120).split('\n')[0] || s(sc?.title, 120) || s(S?.caseName, 120) || 'Imported build',
    summary: s(sc?.tagline, 400) || s(f.outcome, 400), nodes, edges, prototype: s(S?.proto, 1_500_000),
  };
}

/* ---------- coach ---------- */
export function snapshot(B, stages) {
  const out = [`Build: ${B.build.name}${B.build.client ? ' · client: ' + B.build.client : ''}`];
  if (B.build.summary) out.push('Summary: ' + B.build.summary);
  for (const st of stages) for (const w of st.widgets) {
    if (w.type !== 'nodes') continue;
    const rows = nodesOf(B, w.layer, w.ntype).filter((n) => filled(n) || !w.fixed);
    if (rows.length) out.push(`${st.title} / ${w.title}:`, ...rows.map((n) => `- ${title(n)}${n.body.trim() ? ': ' + n.body.trim().replace(/\n/g, ' ') : ''}${confirmed(n) ? '' : ' [draft]'}`));
  }
  const open = (B.questions || []).filter((q) => !q.answer).map((q) => '- ' + q.text);
  if (open.length) out.push('Open questions:', ...open);
  return out.join('\n');
}

export function systemPrompt(stage, B, stages) {
  return `You are the coach inside AI Builder, the phase after a Process Reimagination workshop. The team (EY consultants, engineers, the client) turns a workshop draft and prototype into confirmed requirements, guardrails and an architecture that engineers will build in a repository. You do not write the solution; you help them get the knowledge complete and honest.
Items marked [draft] came from the workshop or from you and are unconfirmed. Never present a draft as a fact.
Style: direct, at most 120 words. Ask one sharp question at a time. When you suggest items, put each on its own line starting with "- " (max 14 words) so they can be added as open points with one click. Do not invent numbers, systems or regulations the board does not mention; ask instead.
Current stage: ${stage.title}. Objective: ${stage.objective}
Stage steps: ${stage.steps.map((s) => s.t + ' — ' + s.d).join(' | ')}
Still open on this stage: ${gaps(stage, B).join(' ') || 'nothing flagged'}
The build so far:
${snapshot(B, stages)}`;
}

// Coach used when no model is connected.
export function coachReply(stage, B, text, turn = 0) {
  const t = (text || '').toLowerCase(), open = gaps(stage, B);
  if (/suggest|idea|example|open point/.test(t)) return `Points worth settling here. Keep the ones that apply:\n${stage.ideas.map((i) => '- ' + i).join('\n')}`;
  if (/challenge|review|check|missing|open|gap/.test(t)) return open.length ? `Here is what is still open:\n${open.map((g) => '• ' + g).join('\n')}` : 'Nothing is flagged on this stage. Read it once more as the person who has to build it: is every line specific enough to act on?';
  return `${stage.steps.map((s, i) => `${i + 1}. ${s.t}`).join('\n')}\n\n${open[0] ? 'Next: ' + open[0] : 'This stage looks complete.'}\n\nA question to think about: ${stage.ask[turn % stage.ask.length]}`;
}

/* ---------- AI drafting ---------- */
const stripTags = (html) => String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
export const draftPrompt = (B, stages, protoHtml) => `From the build below and the text of its prototype, propose what is still missing for the Knowledge stage. Reply with only JSON:
{"requirements": [{"title": short name, "body": "The solution must ...", "acceptance": how we would know it is met}], "entities": [{"title": concept or data item, "body": what it means here}], "open": [{"title": short name, "body": what must be found out}]}
At most 6 of each. Do not repeat items already on the board. Use only what the board and prototype show; where something is unknown, put it under "open" instead of guessing.

${snapshot(B, stages)}

Prototype text: ${stripTags(protoHtml) || '(no prototype)'}`;

export function parseDraft(text) {
  try {
    const o = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)), str = (v) => (typeof v === 'string' ? v.trim() : '');
    const list = (v) => (Array.isArray(v) ? v : []).filter((x) => x && str(x.title)).slice(0, 6);
    return [
      ...list(o.requirements).map((x) => ({ layer: 'requirements', type: 'requirement', title: str(x.title), body: str(x.body), properties: { acceptance: str(x.acceptance) } })),
      ...list(o.entities).map((x) => ({ layer: 'domain', type: 'entity', title: str(x.title), body: str(x.body), properties: { kind: 'entity' } })),
      ...list(o.open).map((x) => ({ layer: 'requirements', type: 'note', title: str(x.title), body: str(x.body), properties: {} })),
    ];
  } catch { return []; }
}

export const stripFences = (t) => { const m = t.match(/```(?:html)?\s*([\s\S]*?)```/); return (m ? m[1] : t).trim(); };
export const protoPrompt = (B, stages, change, prev) => `Modify the prototype below as requested. Keep it ONE self-contained HTML file (inline CSS and JS, no external resources, no network calls, realistic sample data). Respect the build's confirmed requirements and boundaries. Reply with only the HTML, starting with <!doctype html>.

Requested change: ${change}

${snapshot(B, stages)}

Current prototype:
${prev}`;
