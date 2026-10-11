import { STAGES, PHASES, GATES, TASK_STATUS } from './content.js';
import * as L from './logic.js';

const AKEY = 'builder-ai', CKEY = 'builder-chat-';
let ME = null, B = null, view = 'home', chatOpen = true, AI = false, PROV = {}, chat = [], live = [], protoV = null, protoCache = {};

// Tiny DOM builder; text always goes in as text nodes, never as HTML.
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...kids.flat(Infinity).filter((x) => x != null && x !== false));
  return el;
}
// replaceChildren that, like h(), accepts nested lists and skips empty values.
const set = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((x) => x != null && x !== false));
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };
const $ = (id) => document.getElementById(id);
const stage = () => STAGES[view];
const uid = () => Math.random().toString(36).slice(2, 6);

/* ---------- server ---------- */
async function api(path, body) {
  const r = await fetch('/api/' + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 409) { toast('Someone else changed this just now. Showing their version.'); await load(B.build.id); render(); throw new Error('stale'); }
  if (!r.ok) { const t = await r.text(); toast(t || 'That did not work.'); throw new Error(t); }
  return r.json();
}
// An operation on the open build. If the revision jumped by more than our own change, someone else was busy too: reload.
async function op(name, body) {
  const r = await api(`builds/${B.build.id}/${name}`, body);
  if (r.rev !== B.build.rev + 1) setTimeout(refresh, 0);
  B.build.rev = r.rev;
  return r;
}
async function load(id) { B = await api('builds/' + id); try { chat = JSON.parse(localStorage.getItem(CKEY + id)) || []; } catch { chat = []; } }
const may = (action, stageId) => L.can(B.role, action, stageId);
const editing = () => B.nodes.some((n) => n._busy || n._dirty) || ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName) || $('dlg').open;
async function refresh() { if (!B || editing()) return; await load(B.build.id); render(); }
setInterval(async () => {
  if (!B || editing() || document.hidden) return;
  try { const r = await (await fetch(`/api/builds/${B.build.id}/rev`)).json(); if (r.rev !== B.build.rev) refresh(); } catch { /* offline: try again next time */ }
}, 5000);

/* ---------- items (nodes) ---------- */
const nodesOf = (layer, type) => B.nodes.filter((n) => n.layer === layer && n.type === type);
const byFqn = (f) => B.nodes.find((n) => L.fqn(n) === f);
// Saves are queued per item so a second edit never races the first one's version.
function saveNode(n) {
  if (n._new) { delete n._new; B.nodes.push(n); }
  n._dirty = true;
  clearTimeout(n._t);
  if (!n._busy) n._t = setTimeout(() => flush(n), 500);
}
async function flush(n) {
  n._busy = true; n._dirty = false;
  try { const r = await op('node', { layer: n.layer, type: n.type, name: n.name, body: n.body, properties: n.properties, version: n.version }); n.version = r.version; } catch { n._busy = false; return; }
  n._busy = false;
  if (n._dirty) flush(n); else live.forEach((fn) => fn());
}
async function addNode(layer, type, ttl, body = '', props = {}) {
  let name = L.slug(ttl);
  while (byFqn(`${layer}.${type}.${name}`)) name = `${L.slug(ttl).slice(0, 54)}-${uid()}`;
  const n = { layer, type, name, body, properties: { title: ttl, ...props }, version: 0 };
  n.version = (await op('node', { ...n })).version;
  B.nodes.push(n);
  return n;
}
async function setEdge(kind, from, to, on) {
  await op('edge', { kind, from, to, on });
  B.edges = B.edges.filter((e) => !(e.kind === kind && e.from_fqn === from && e.to_fqn === to));
  if (on) B.edges.push({ kind, from_fqn: from, to_fqn: to });
}

/* ---------- home ---------- */
async function renderHome() {
  const builds = await api('builds');
  const name = h('input', { placeholder: 'Name of the solution', 'aria-label': 'Build name' }), client = h('input', { placeholder: 'Client', 'aria-label': 'Client' });
  const create = async () => { if (!name.value.trim()) return name.focus(); const r = await api('builds', { name: name.value.trim(), client: client.value.trim() }); await openBuild(r.id); };
  set($('app'), h('div', { class: 'setup glass' },
    h('div', { class: 'brand' }, 'EY.ai Lab · AI Leap'),
    h('h1', {}, 'AI Builder'),
    h('p', { class: 'lead' }, 'From the reimagination draft to a solution that can be built and run: confirmed knowledge, clear boundaries, an architecture connected to the engineers\' repository, then AI Pulse. One shared workspace per build.'),
    h('p', { class: 'hint' }, `Signed in as ${ME.name} (${ME.email}) · Coach: ${aiLabel()} · `, h('button', { class: 'aibtn', onclick: aiSettings }, '⚙ AI settings')),
    h('h2', {}, h('i', {}, '1'), 'Your builds'),
    builds.length ? h('div', { class: 'cards' }, builds.map((b) => h('button', { class: 'card', onclick: () => openBuild(b.id) }, h('small', { class: 'tag' }, b.role), h('b', {}, b.name), h('span', {}, [b.client, b.summary].filter(Boolean).join(' · ') || 'No description yet'))))
      : h('p', { class: 'hint' }, 'None yet. Finish a reimagination session and press "Continue to Build" there, or start an empty build below.'),
    h('h2', {}, h('i', {}, '2'), 'Start a build'),
    h('div', { class: 'bar' }, name, client, h('button', { class: 'primary', onclick: create }, 'Create build')),
    h('p', { class: 'hint' }, 'Coming from a workshop? ', h('a', { href: ME.reimagine, target: '_blank', rel: 'noopener' }, 'Open Process Reimagination'), ' and use "Continue to Build" on its last stage: the scenario, canvas and prototype come over as a draft.')));
}
async function openBuild(id, to = 'overview') { await load(id); view = to; protoV = null; protoCache = {}; render(); scrollTo(0, 0); }

// The reimagination app opens this page with #import and hands its session over with postMessage (only that origin is accepted).
function listenForImport() {
  if (location.hash !== '#import') return;
  history.replaceState(null, '', location.pathname);
  if (!window.opener) return toast('Nothing to import: use "Continue to Build" in the reimagination app.');
  addEventListener('message', async (e) => {
    if (e.origin !== ME.reimagine || e.data?.type !== 'reimagination-session') return;
    try { const r = await api('builds', { session: e.data.session }); await openBuild(r.id); toast('Imported as a draft. Nothing is confirmed yet.'); } catch { /* the toast already said why */ }
  });
  window.opener.postMessage('builder-ready', ME.reimagine);
}

/* ---------- widgets ---------- */
const badge = (t, cls = '') => h('span', { class: 'badge ' + cls }, t);
function linkCell(n, c, edit) {
  const mine = L.fqn(n), pair = (other) => (c.dir === 'out' ? [mine, other] : [other, mine]);
  const linked = () => B.edges.filter((e) => e.kind === c.edge && (c.dir === 'out' ? e.from_fqn === mine : e.to_fqn === mine)).map((e) => (c.dir === 'out' ? e.to_fqn : e.from_fqn));
  const btn = h('button', { class: 'linkbtn', 'aria-label': c.label, onclick: () => {
    const options = c.to.flatMap((t) => nodesOf(...t.split('.')));
    dialog(`${L.title(n)} · ${c.label.toLowerCase()}`, options.length ? options.map((o) => h('label', { class: 'chk' },
      h('input', { type: 'checkbox', disabled: !edit, checked: linked().includes(L.fqn(o)), onchange: async (e) => { try { await setEdge(c.edge, ...pair(L.fqn(o)), e.target.checked); } catch { e.target.checked = !e.target.checked; } draw(); } }),
      h('span', {}, h('b', {}, L.title(o)), ' ', badge(o.type)))) : h('p', { class: 'hint' }, 'Nothing to link to yet. Add those items first.'));
  } });
  const draw = () => { const l = linked(); btn.textContent = l.length ? l.map((f) => (byFqn(f) ? L.title(byFqn(f)) : f)).join(', ') : edit ? '+ link' : '–'; btn.classList.toggle('none', !l.length); };
  draw();
  return btn;
}

const W = {
  draft: () => {
    const drafts = B.nodes.filter((n) => n.properties.origin && !L.confirmed(n)).length, status = h('span', { class: 'hint', role: 'status' });
    const gen = async () => {
      status.textContent = 'Reading the board and the prototype…';
      let t = '';
      try { await stream({ system: 'You propose requirements as strict JSON.', messages: [{ role: 'user', content: L.draftPrompt(B, STAGES, await protoHtml(B.prototypes.at(-1)?.version)) }], effort: 'medium', json: true }, (d) => { t += d; }); } catch { /* handled below */ }
      const items = L.parseDraft(t).filter((x) => !nodesOf(x.layer, x.type).some((n) => L.title(n).toLowerCase() === x.title.toLowerCase()));
      if (!items.length) { status.textContent = 'The model had nothing to add.'; return; }
      for (const x of items) await addNode(x.layer, x.type, x.title, x.body, { ...x.properties, origin: 'coach' });
      toast(`${items.length} draft items added. Review and confirm them.`); render();
    };
    return h('div', { class: 'panel brief' }, h('h3', {}, 'From draft to confirmed'),
      h('p', {}, drafts ? `${drafts} item${drafts === 1 ? '' : 's'} came from the reimagination workshop or the coach and ${drafts === 1 ? 'is' : 'are'} still a draft. Correct each one, then confirm it. Editing the text of a confirmed item sets it back to draft.` : 'Nothing is waiting for confirmation.'),
      AI && may('edit', 'knowledge') && h('div', { class: 'bar' }, h('button', { class: 'add', onclick: gen }, 'Draft what is missing from the prototype'), status));
  },

  nodes: (w) => {
    const st = L.stageOf(w.layer, w.ntype), edit = may('edit', st), body = h('tbody');
    const rows = () => (w.fixed ? w.fixed.map((fx) => nodesOf(w.layer, w.ntype).find((n) => n.name === fx.name) || { layer: w.layer, type: w.ntype, name: fx.name, body: '', properties: { title: fx.title }, version: 0, _new: true, _ph: fx.ph }) : nodesOf(w.layer, w.ntype));
    const row = (n) => {
      const fx = w.fixed?.find((f) => f.name === n.name);
      const state = h('td', { class: 'state' });
      const drawState = () => set(state, 
        L.confirmed(n) ? h('button', { class: 'ok', disabled: !edit, title: 'Confirmed by ' + n.properties['confirmed-by'] + '. Click to withdraw.', onclick: () => { delete n.properties['confirmed-by']; saveNode(n); drawState(); } }, '✓ ' + n.properties['confirmed-by'].split('@')[0])
          : edit && (n.body.trim() || !w.fixed) ? h('button', { class: 'add', onclick: () => { n.properties['confirmed-by'] = ME.email; saveNode(n); drawState(); } }, 'Confirm') : null,
        !L.confirmed(n) && n.properties.origin && badge('draft · ' + n.properties.origin, 'draft'),
        h('button', { class: 'x', title: 'Ask a question about this', 'aria-label': 'Ask a question about ' + L.title(n), onclick: () => questions(L.fqn(n)) }, '?' + (B.questions.filter((q) => q.about === L.fqn(n) && !q.answer).length || '')),
        edit && !w.fixed && h('button', { class: 'x', 'aria-label': 'Remove ' + L.title(n), onclick: async () => { if (!confirm(`Remove "${L.title(n)}"?`)) return; await op('node-rm', { layer: n.layer, type: n.type, name: n.name }); B.nodes = B.nodes.filter((x) => x !== n); B.edges = B.edges.filter((e) => e.from_fqn !== L.fqn(n) && e.to_fqn !== L.fqn(n)); draw(); live.forEach((fn) => fn()); } }, '×'));
      drawState();
      const cell = (c) => {
        if (c.kind === 'link') return linkCell(n, c, edit);
        if (c.kind === 'select' || c.kind === 'attach') {
          const key = c.kind === 'attach' ? 'attaches-to' : c.id, opts = c.kind === 'attach' ? c.to.flatMap((t) => nodesOf(...t.split('.'))).map((o) => [L.fqn(o), L.title(o)]) : c.options.map((o) => [o, o]);
          return h('select', { disabled: !edit, 'aria-label': c.label, onchange: (e) => { if (e.target.value) n.properties[key] = e.target.value; else delete n.properties[key]; saveNode(n); } }, h('option', { value: '' }, '–'), opts.map(([v, l]) => h('option', { value: v, selected: n.properties[key] === v }, l)));
        }
        const isBody = c.id === 'body';
        return h('textarea', { rows: 2, readOnly: !edit, 'aria-label': c.label, placeholder: (isBody && (fx?.ph || n._ph)) || c.ph || '', value: isBody ? n.body : n.properties[c.id] || '', oninput: (e) => {
          // Changing the text withdraws the confirmation: what was confirmed is no longer what is written.
          if (isBody) { n.body = e.target.value; delete n.properties['confirmed-by']; } else if (e.target.value) n.properties[c.id] = e.target.value; else delete n.properties[c.id];
          saveNode(n); if (isBody) drawState();
        } });
      };
      return h('tr', {}, h('td', { class: 'ttlcell' }, w.fixed ? h('b', {}, L.title(n)) : h('textarea', { rows: 2, readOnly: !edit, class: 'ttl-in', 'aria-label': 'Name', value: L.title(n), oninput: (e) => { n.properties.title = e.target.value; saveNode(n); } })), w.cols.map((c) => h('td', {}, cell(c))), state);
    };
    const draw = () => set(body, ...rows().map(row));
    draw();
    const input = h('input', { placeholder: `New ${w.ntype === 'note' ? 'item' : w.ntype}…`, 'aria-label': 'Name of the new item', onkeydown: (e) => e.key === 'Enter' && add() });
    const add = async () => { const t = input.value.trim(); if (!t) return input.focus(); input.value = ''; await addNode(w.layer, w.ntype, t, '', w.defaults); draw(); live.forEach((fn) => fn()); };
    return h('div', { class: 'panel' }, h('h3', {}, w.title), w.hint && h('p', { class: 'hint' }, w.hint),
      h('div', { class: 'scroll' }, h('table', { class: 'rows items' }, h('thead', {}, h('tr', {}, h('th', {}, 'Name'), w.cols.map((c) => h('th', {}, c.label)), h('th'))), body)),
      edit && !w.fixed && h('div', { class: 'bar addrow' }, input, h('button', { class: 'add', onclick: add }, '+ add')));
  },

  trace: () => {
    const el = h('div', { class: 'panel' });
    const cols = [['confirmed', 'Confirmed'], ['acceptance', 'Met when'], ['boundary', 'Boundary'], ['domain', 'Knowledge'], ['solution', 'Solution'], ['code', 'Code']];
    const draw = () => {
      const r = L.readiness(B);
      set(el, h('h3', {}, 'Traceability'), h('p', { class: 'hint' }, 'Each requirement followed down to the solution: requirement → concept or step → component → code. "Code" fills in from the repository once the build is linked to Kosanima.'),
        r.length ? h('div', { class: 'scroll' }, h('table', { class: 'rows trace' }, h('thead', {}, h('tr', {}, h('th', {}, 'Requirement'), cols.map((c) => h('th', {}, c[1])))),
          h('tbody', {}, r.map((x) => h('tr', {}, h('td', {}, x.title), cols.map((c) => h('td', { class: x[c[0]] ? 'yes' : 'no', 'aria-label': `${c[1]}: ${x[c[0]] ? 'yes' : 'no'}` }, x[c[0]] ? '✓' : '○'))))))) : h('p', { class: 'hint' }, 'No requirements yet.'));
    };
    live.push(draw); draw();
    return el;
  },

  diagram: () => {
    const el = h('div', { class: 'panel' });
    const draw = () => {
      const cols = ['system', 'container', 'component'].map((t) => nodesOf('solution', t)), rowsN = Math.max(1, ...cols.map((c) => c.length)), CW = 250, RH = 62, pos = {};
      const g = svg('svg', { viewBox: `0 0 ${CW * 3} ${rowsN * RH + 34}`, class: 'diagram', role: 'img', 'aria-label': 'Architecture: systems, containers and components' });
      cols.forEach((c, i) => { g.append(svg('text', { x: i * CW + 100, y: 16, class: 'dh' }, ['Systems', 'Containers', 'Components and agents'][i])); c.forEach((n, j) => { pos[L.fqn(n)] = [i * CW, 30 + j * RH]; }); });
      for (const e of B.edges) if (e.kind === 'contains' && pos[e.from_fqn] && pos[e.to_fqn]) { const [a, b] = [pos[e.from_fqn], pos[e.to_fqn]]; g.append(svg('path', { d: `M${a[0] + 200},${a[1] + 23} C${a[0] + 230},${a[1] + 23} ${b[0] - 30},${b[1] + 23} ${b[0]},${b[1] + 23}`, class: 'dl' })); }
      for (const [f, [x, y]] of Object.entries(pos)) { const n = byFqn(f), t = L.title(n); g.append(svg('rect', { x, y, width: 200, height: 46, rx: 8, class: 'db' + (n.properties.role === 'agent' ? ' agent' : '') }), svg('text', { x: x + 100, y: y + 20, class: 'dt' }, t.length > 26 ? t.slice(0, 25) + '…' : t), svg('text', { x: x + 100, y: y + 36, class: 'ds' }, n.properties.role || n.properties.kind || n.properties.technology || n.type)); }
      set(el, h('h3', {}, 'Architecture'), h('p', { class: 'hint' }, 'Drawn from the tables above. Lines show "part of".'), Object.keys(pos).length ? h('div', { class: 'scroll' }, g) : h('p', { class: 'hint' }, 'Add systems, containers and components to see the picture.'));
    };
    live.push(draw); draw();
    return el;
  },

  tasks: () => {
    const edit = may('edit', 'build'), body = h('tbody');
    const save = (t) => op('task', t);
    const draw = () => set(body, ...B.tasks.map((t) => h('tr', {},
      h('td', {}, h('textarea', { rows: 1, readOnly: !edit, value: t.name, 'aria-label': 'Task', onchange: (e) => { t.name = e.target.value; save(t); } })),
      h('td', {}, h('input', { readOnly: !edit, value: t.owner, 'aria-label': 'Owner', onchange: (e) => { t.owner = e.target.value; save(t); } })),
      h('td', {}, h('input', { type: 'date', readOnly: !edit, value: t.due, 'aria-label': 'Due', onchange: (e) => { t.due = e.target.value; save(t); } })),
      h('td', {}, h('select', { disabled: !edit, 'aria-label': 'Status', onchange: (e) => { t.status = e.target.value; save(t); } }, TASK_STATUS.map((s) => h('option', { selected: t.status === s }, s)))),
      h('td', {}, edit && h('button', { class: 'x', 'aria-label': 'Remove task', onclick: async () => { await op('task-rm', { id: t.id }); B.tasks = B.tasks.filter((x) => x !== t); draw(); } }, '×')))));
    draw();
    const input = h('input', { placeholder: 'New step in the build…', 'aria-label': 'New task', onkeydown: (e) => e.key === 'Enter' && add() });
    const add = async () => { const name = input.value.trim(); if (!name) return input.focus(); input.value = ''; const t = { name, owner: '', due: '', status: TASK_STATUS[0] }; t.id = (await op('task', t)).id; B.tasks.push(t); draw(); };
    return h('div', { class: 'panel' }, h('h3', {}, 'Build plan'), h('p', { class: 'hint' }, 'The steps of the actual build, with an owner and a date. Engineers update the status as they go.'),
      h('table', { class: 'rows' }, h('thead', {}, h('tr', {}, ['Step', 'Owner', 'Due', 'Status', ''].map((x) => h('th', {}, x)))), body),
      edit && h('div', { class: 'bar addrow' }, input, h('button', { class: 'add', onclick: add }, '+ add')));
  },

  prototype: () => {
    const edit = may('edit', 'build'), vs = B.prototypes, el = h('div', { class: 'panel' });
    if (protoV == null || !vs.some((v) => v.version === protoV)) protoV = vs.at(-1)?.version ?? null;
    const status = h('span', { class: 'hint', role: 'status' }), frame = h('div');
    const put = (...kids) => el.append(...kids.flat(Infinity).filter((x) => x != null && x !== false));
    const saveVersion = async (html, note) => { const r = await op('prototype', { html, note }); B.prototypes.push({ version: r.version, note, by: ME.email }); protoCache[r.version] = html; protoV = r.version; render(); toast(`Saved as version ${r.version}. The original is untouched.`); };
    const change = h('input', { placeholder: 'Describe a change, e.g. "add the approval step for amounts above 10k"', 'aria-label': 'Change request' });
    const apply = async () => {
      if (!change.value.trim()) return change.focus();
      status.textContent = 'Building a new version…';
      let html = '';
      try { await stream({ system: 'You build small, self-contained HTML prototypes.', messages: [{ role: 'user', content: L.protoPrompt(B, STAGES, change.value.trim(), await protoHtml(protoV)) }], effort: 'medium' }, (d) => { html += d; status.textContent = `Building… ${html.length} chars`; }); } catch { html = ''; }
      html = L.stripFences(html);
      if (!/<html|<!doctype/i.test(html)) { status.textContent = 'The model did not return a prototype. Nothing was changed.'; return; }
      await saveVersion(html, change.value.trim().slice(0, 300));
    };
    const file = h('input', { type: 'file', accept: '.html,text/html', hidden: true, onchange: async (e) => { const f = e.target.files[0]; if (f) await saveVersion(await f.text(), 'Uploaded: ' + f.name.slice(0, 200)); } });
    put(h('h3', {}, 'Prototype'), h('p', { class: 'hint' }, 'Version 0 is the prototype exactly as it left the reimagination and is never changed. Work continues on copies: each change is saved as a new version.'));
    if (!vs.length) { put(h('p', {}, 'This build has no prototype yet.'), edit && h('div', { class: 'bar' }, h('button', { class: 'add', onclick: () => file.click() }, 'Add a prototype (.html)'), file)); return el; }
    put(h('div', { class: 'bar' }, h('select', { class: 'vsel', 'aria-label': 'Prototype version', onchange: (e) => { protoV = Number(e.target.value); render(); } }, vs.map((v) => h('option', { value: v.version, selected: v.version === protoV }, `v${v.version}${v.version === 0 ? ' · original (frozen)' : ''}${v.note ? ' · ' + v.note : ''}`))),
      edit && h('button', { class: 'add', onclick: () => file.click() }, 'Add a version from file'), file, status), frame,
      edit && AI && h('div', { class: 'bar' }, change, h('button', { class: 'add', onclick: apply }, 'Apply as new version')),
      edit && !AI && h('p', { class: 'hint' }, 'Connect a model (⚙ in the coach panel) to change the prototype in plain language, or add a version from a file.'));
    // Sandboxed without same-origin, and no network: prototype code cannot reach this app, its sign-in or the internet.
    protoHtml(protoV).then((html) => set(frame, h('iframe', { class: 'proto', title: 'Prototype version ' + protoV, sandbox: 'allow-scripts', srcdoc: `<meta http-equiv="Content-Security-Policy" content="default-src 'unsafe-inline' data: blob:">` + html })));
    return el;
  },

  boundaries: () => {
    const rules = B.nodes.filter((n) => L.stageOf(n.layer, n.type) === 'boundaries' && n.type === 'constraint' && n.body.trim());
    return h('div', { class: 'panel' }, h('h3', {}, 'The boundaries agreed in AI Builder'), rules.length ? h('ul', { class: 'ovlist' }, rules.map((n) => h('li', {}, h('b', {}, L.title(n) + ': '), n.body, n.properties.owner && h('span', { class: 'hint' }, ' · owner: ' + n.properties.owner)))) : h('p', { class: 'hint' }, 'No boundaries were written down in the Boundaries stage.'));
  },

  gate: () => {
    const st = stage(), el = h('div', { class: 'panel gate' }), note = h('textarea', { rows: 2, placeholder: 'Why this decision (required when you go ahead with open points)', 'aria-label': 'Decision note' });
    const decide = async (d) => { await op('gate', { stage: st.id, decision: d, note: note.value }); B.gates.push({ stage: st.id, decision: d, note: note.value.trim(), by: ME.email, at: new Date().toISOString() }); render(); };
    const draw = () => {
      const open = L.gaps(st, B), g = L.lastGate(B, st.id);
      set(el, h('h3', {}, `Gate: ${st.title}`),
        g ? h('p', {}, badge(g.decision.toUpperCase(), g.decision), ` decided by ${g.by} on ${String(g.at).slice(0, 10)}`, g.note && ` · "${g.note}"`) : h('p', { class: 'hint' }, 'No decision taken yet.'),
        open.length ? [h('b', {}, `Still open (${open.length})`), h('ul', { class: 'ovlist' }, open.map((x) => h('li', {}, x)))] : h('p', { class: 'yes' }, '✓ Nothing is flagged as open on this stage.'),
        may('gate') ? [note, h('div', { class: 'bar' }, GATES.map(([d, l]) => h('button', { class: d === 'go' ? 'primary' : 'add', onclick: () => decide(d) }, l)), h('span', { class: 'hint' }, 'Go, change direction, or stop. Stopping is a legitimate outcome.'))] : h('p', { class: 'hint' }, 'The build lead takes this decision.'));
    };
    live.push(draw); draw();
    return el;
  },
};

/* ---------- build views ---------- */
function header(titleText, objective, badgeText) {
  const gateOf = (s) => L.lastGate(B, s.id)?.decision;
  return h('header', { class: 'top' },
    h('div', { class: 'ttl' }, h('div', { class: 'brand' }, 'EY.ai Lab · AI Leap'), h('span', { class: 'round' }, badgeText), h('h1', {}, titleText), h('p', { class: 'hint' }, `${B.build.name}${B.build.client ? ' · ' + B.build.client : ''} · you are ${B.role}`)),
    h('div', { class: 'obj' }, h('b', {}, 'Objective:'), h('p', {}, objective),
      h('nav', { class: 'phases', 'aria-label': 'AI Leap phases' }, PHASES.map((p) => h('div', { class: 'phase' }, h('small', {}, `${p.n}. ${p.name}`),
        p.id === 'blueprint' ? h('a', { class: 'pstep done', href: ME.reimagine, target: '_blank', rel: 'noopener', title: 'Open the reimagination app' }, B.prototypes.some((v) => v.version === 0) ? '✓ Reimagination' : 'Reimagination')
          : h('div', { class: 'psteps' }, STAGES.map((s, i) => s.phase === p.id && h('button', { class: 'pstep' + (view === i ? ' on' : '') + (gateOf(s) ? ' ' + gateOf(s) : ''), 'aria-current': view === i ? 'step' : null, onclick: () => { view = i; render(); scrollTo(0, 0); } }, (gateOf(s) === 'go' ? '✓ ' : '') + s.title))))))),
    h('div', { class: 'tools' },
      h('button', { onclick: () => { B = null; view = 'home'; render(); } }, '⌂ Builds'),
      h('button', { class: view === 'overview' ? 'on' : '', onclick: () => { view = 'overview'; render(); scrollTo(0, 0); } }, 'Overview'),
      h('button', { onclick: () => questions() }, `Questions${B.questions.some((q) => !q.answer) ? ' · ' + B.questions.filter((q) => !q.answer).length : ''}`),
      h('button', { onclick: people }, 'People'), h('button', { onclick: history_ }, 'History'),
      view !== 'overview' && h('button', { onclick: () => { chatOpen = !chatOpen; render(); } }, chatOpen ? 'Hide coach' : 'Coach')));
}

function renderStage() {
  const st = stage(), y = scrollY, go = (d) => { view += d; render(); scrollTo(0, 0); };
  live = [];
  set($('app'), header(st.title, st.objective, `${PHASES.find((p) => p.id === st.phase).name} · stage ${view + 1} of ${STAGES.length}`),
    h('div', { class: 'layout' + (chatOpen ? '' : ' nochat') },
      h('aside', { class: 'steps' }, st.steps.map((s, i) => h('div', { class: 'glass step' }, h('b', {}, `${i + 1}. ${s.t}`), h('p', {}, s.d))),
        h('div', { class: 'blob' }, h('b', {}, 'Questions along the way'), h('ul', {}, st.ask.map((q) => h('li', {}, q)))),
        h('div', { class: 'bar' }, view > 0 && h('button', { class: 'add', onclick: () => go(-1) }, '← Back'), view < STAGES.length - 1 && h('button', { class: 'primary', onclick: () => go(1) }, 'Next stage →'))),
      h('main', { class: 'glass board' }, st.widgets.map((w) => W[w.type](w))),
      chatOpen && chatPanel()));
  scrollTo(0, y);
}

// Everything on one page: every stage, every answer, what is confirmed and what is still open.
function renderOverview() {
  const y = scrollY, r = L.readiness(B), edit = may('edit', 'build');
  live = [];
  const field = (k, label) => h('label', { class: 'field' }, h('b', {}, label), h('input', { readOnly: !edit, value: B.build[k], onchange: (e) => { B.build[k] = e.target.value; op('patch', B.build); } }));
  set($('app'), header('Overview', 'The whole build on one page: every stage, every answer, what is confirmed and what is still open. Print it for a steering meeting.', 'Build overview'),
    h('div', { class: 'layout nochat ov' },
      h('aside', { class: 'steps' },
        h('div', { class: 'glass step' }, h('b', {}, 'Where it stands'), h('p', {}, `${B.nodes.filter(L.confirmed).length} of ${B.nodes.filter((n) => n.body.trim() || n.properties.origin).length} items confirmed`), h('p', {}, `${r.filter((x) => x.solution).length} of ${r.length} requirements realised by the solution`), h('p', {}, `${B.tasks.filter((t) => t.status === 'Done').length} of ${B.tasks.length} build steps done`), h('p', {}, `${B.questions.filter((q) => !q.answer).length} open questions`)),
        h('div', { class: 'glass step' }, h('b', {}, 'Prototype'), h('p', {}, B.prototypes.length ? `Original kept as v0 · working copy at v${B.prototypes.at(-1).version}` : 'No prototype attached'), h('button', { class: 'add', onclick: () => { view = STAGES.findIndex((s) => s.id === 'build'); render(); } }, 'Open in Build')),
        h('button', { class: 'add', onclick: () => window.print() }, 'Print this overview')),
      h('main', { class: 'glass board' },
        h('div', { class: 'panel' }, h('h3', {}, 'About this build'), h('div', { class: 'fgrid' }, field('name', 'Name'), field('client', 'Client'), field('summary', 'In one sentence'), field('repo', 'Knowledge repository')),
          !B.build.repo && edit && h('div', { class: 'bar' }, h('button', { class: 'add', onclick: async (e) => {
            e.currentTarget.disabled = true; toast('Creating the repository and checking it with Kosanima…');
            try { const r = await op('repo', {}); B.build.repo = r.repo; toast(r.warning || `Knowledge repository created with ${r.files} nodes.`); } catch { /* the toast already said why */ }
            render();
          } }, 'Create the Kosanima knowledge repository'), h('span', { class: 'hint' }, 'A new git repository, seeded with this build\'s requirements, domain, solution and boundaries as active knowledge. Engineers continue there.'))),
        STAGES.map((st, i) => {
          const open = L.gaps(st, B), g = L.lastGate(B, st.id);
          return h('div', { class: 'panel' },
            h('div', { class: 'bar ovhead' }, h('h3', {}, `${i + 1}. ${st.title}`), g ? badge(g.decision.toUpperCase(), g.decision) : badge('no decision'), badge(open.length ? `${open.length} open` : 'complete', open.length ? 'draft' : 'go'), h('button', { class: 'add', onclick: () => { view = i; render(); scrollTo(0, 0); } }, 'Open stage →')),
            st.widgets.filter((w) => w.type === 'nodes').map((w) => {
              const rows = nodesOf(w.layer, w.ntype).filter((n) => n.body.trim() || !w.fixed);
              return rows.length > 0 && [h('b', { class: 'ovsub' }, w.title), h('ul', { class: 'ovlist' }, rows.map((n) => h('li', {}, h('b', {}, L.title(n)), n.body.trim() && ': ' + n.body.trim(), ' ', L.confirmed(n) ? badge('✓ ' + n.properties['confirmed-by'].split('@')[0], 'go') : badge('draft', 'draft'))))];
            }),
            open.length > 0 && h('details', {}, h('summary', {}, 'What is still open'), h('ul', { class: 'ovlist' }, open.map((x) => h('li', {}, x)))));
        }),
        W.trace())));
  scrollTo(0, y);
}

function questions(about = '') {
  const input = h('textarea', { rows: 2, placeholder: about ? 'Your question about this item…' : 'A question for the client, an engineer or a colleague…', 'aria-label': 'New question' });
  const list = h('div');
  const draw = () => set(list, ...B.questions.filter((q) => !about || q.about === about).map((q) => {
    const ans = h('textarea', { rows: 2, placeholder: 'Answer…', 'aria-label': 'Answer' });
    return h('div', { class: 'chal' }, h('b', {}, q.text), h('p', {}, `asked by ${q.asked_by}${q.about && byFqn(q.about) ? ' · about ' + L.title(byFqn(q.about)) : ''}`),
      q.answer ? h('p', { class: 'answer' }, `✓ ${q.answer} (${q.answered_by})`) : h('div', { class: 'bar' }, ans, h('button', { class: 'add', onclick: async () => { if (!ans.value.trim()) return; await op('answer', { id: q.id, answer: ans.value.trim() }); q.answer = ans.value.trim(); q.answered_by = ME.email; draw(); } }, 'Answer')));
  }));
  draw();
  dialog(about && byFqn(about) ? 'Questions · ' + L.title(byFqn(about)) : 'Questions', [h('p', { class: 'hint' }, 'Everyone on the build can ask and answer. Open questions count against the gate of their stage.'), list,
    h('div', { class: 'bar' }, input, h('button', { class: 'primary', onclick: async () => { const t = input.value.trim(); if (!t) return; const r = await op('ask', { about, text: t }); B.questions.push({ id: r.id, about, text: t, asked_by: ME.email, answer: '', answered_by: '' }); input.value = ''; draw(); } }, 'Ask'))]);
}
function people() {
  const email = h('input', { type: 'email', placeholder: 'name@company.com', 'aria-label': 'E-mail' }), role = h('select', { 'aria-label': 'Role' }, L.ROLES.map((r) => h('option', {}, r))), list = h('div');
  const setRole = async (e, r) => { await op('member', { email: e, role: r }); B.members = B.members.filter((m) => m.email !== e); if (r) B.members.push({ email: e, role: r }); draw(); };
  const draw = () => set(list, ...B.members.map((m) => h('div', { class: 'rev' }, h('span', {}, m.email + ' ', badge(m.role)), may('members') && m.email !== ME.email && h('button', { class: 'x', 'aria-label': 'Remove ' + m.email, onclick: () => setRole(m.email, null) }, '×'))));
  draw();
  dialog('People on this build', [h('p', { class: 'hint' }, 'Lead: everything, including gates and people. Engineer: edits every stage. Colleague: edits Knowledge and Boundaries. Client: edits and confirms Knowledge, reads the rest. Everyone can ask and answer questions.'), list,
    may('members') && h('div', { class: 'bar' }, email, role, h('button', { class: 'primary', onclick: () => email.value.trim() && setRole(email.value.trim().toLowerCase(), role.value).then(() => { email.value = ''; }) }, 'Add'))]);
}
function history_() { dialog('History', B.events.length ? B.events.map((e) => h('p', { class: 'ev-line' }, h('small', {}, `${String(e.at).slice(0, 16).replace('T', ' ')} · ${e.actor}`), h('br'), `${e.action}: ${e.detail}`)) : h('p', { class: 'hint' }, 'Nothing yet.')); }

/* ---------- coach ---------- */
// Which model answers: the user's choice in AI settings, else the server's Claude key, else a local Ollama model, else none (guide mode).
let cfg = { provider: 'auto', model: '', key: '' };
try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem(AKEY)) }; } catch { /* defaults */ }
function active() {
  const o = PROV.ollama || {}, a = PROV.anthropic || {};
  const ollama = o.ok && o.models.length ? { provider: 'ollama', model: o.models.includes(cfg.model) ? cfg.model : o.models.find((m) => /mistral/i.test(m)) || o.models[0] } : null;
  const claude = a.ok && (cfg.key || a.server) ? { provider: 'anthropic', model: a.models[0] } : null;
  return cfg.provider === 'guide' ? null : cfg.provider === 'ollama' ? ollama : cfg.provider === 'anthropic' ? claude : (a.server && claude) || ollama || claude;
}
const aiLabel = () => { const m = active(); return !m ? 'guide mode' : m.provider === 'ollama' ? `local · ${m.model}` : 'Claude'; };
async function loadStatus() { try { PROV = await (await fetch('/api/status')).json(); } catch { PROV = {}; } AI = !!active(); }
function aiSettings() {
  const o = PROV.ollama || { models: [] }, a = PROV.anthropic || {};
  const key = h('input', { type: 'password', autocomplete: 'off', value: cfg.key, placeholder: 'sk-ant-…', 'aria-label': 'Anthropic API key' });
  const model = h('select', { 'aria-label': 'Local model' }, o.models.map((m) => h('option', { value: m, selected: m === (active()?.provider === 'ollama' ? active().model : cfg.model) }, m)));
  const opt = (v, title, note, extra) => h('label', { class: 'aiopt' }, h('input', { type: 'radio', name: 'prov', value: v, checked: cfg.provider === v }), h('span', {}, h('b', {}, title), h('small', {}, note), extra));
  dialog('AI settings', [
    opt('auto', 'Automatic', 'Use the server\'s Claude key if there is one, otherwise a local model, otherwise guide mode.'),
    opt('ollama', 'Local model (Ollama)', o.ok ? (o.models.length ? 'Runs on the machine hosting this app. Nothing leaves it.' : 'Ollama is running but has no models. Run: ollama pull mistral') : 'Ollama is not running on the host. Install it from ollama.com, then: ollama pull mistral', o.models.length > 0 && model),
    opt('anthropic', 'Claude with my own API key', a.ok ? (a.server ? 'This server already has a key; leave the field empty to use it.' : 'Your key is kept in this browser only and sent with each request. Build content goes to the Anthropic API.') : 'The Anthropic SDK is not installed on the server (npm install).', a.ok && key),
    opt('guide', 'Guide mode (no AI)', 'Scripted coach. Nothing is sent to a model.'),
    h('div', { class: 'bar' }, h('button', { class: 'primary', onclick: async () => {
      cfg = { provider: document.querySelector('input[name=prov]:checked')?.value || 'auto', model: model.value || '', key: key.value.trim() };
      try { localStorage.setItem(AKEY, JSON.stringify(cfg)); } catch { /* private mode: applies to this visit only */ }
      await loadStatus(); $('dlg').close(); render(); toast('Coach: ' + aiLabel());
    } }, 'Save'), h('span', { class: 'hint' }, 'Now: ' + aiLabel())),
  ]);
}
async function stream(body, onText) {
  const m = active();
  if (!m) throw new Error('No model');
  const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', ...(m.provider === 'anthropic' && cfg.key ? { 'x-api-key': cfg.key } : {}) }, body: JSON.stringify({ ...body, provider: m.provider, model: m.model }) });
  if (!r.ok) throw new Error(await r.text());
  const rd = r.body.getReader(), dec = new TextDecoder();
  for (;;) { const { done, value } = await rd.read(); if (done) break; onText(dec.decode(value, { stream: true })); }
}
const protoHtml = async (v) => (v == null ? '' : (protoCache[v] ??= (await api(`builds/${B.build.id}/prototype/${v}`)).html));
function chatPanel() {
  const log = h('div', { class: 'log', 'aria-live': 'polite' }), keep = () => { try { localStorage.setItem(CKEY + B.build.id, JSON.stringify(chat.slice(-40))); } catch { /* private mode */ } };
  const draw = () => {
    const msgs = chat.length ? chat : [{ role: 'assistant', content: `Hi ${ME.name}, I am the coach for this build. Ask me anything, or use the buttons below.` }];
    set(log, ...msgs.map((m) => h('div', { class: 'msg ' + m.role }, m.content.split('\n').map((line) => {
      const b = m.role === 'assistant' && line.match(/^\s*(?:[-*]|\d+[.)])\s+"?(.+?)"?\s*$/);
      return b && may('edit', 'knowledge') ? h('div', { class: 'sug' }, h('span', {}, b[1]), h('button', { title: 'Add as open point', 'aria-label': 'Add as open point: ' + b[1], onclick: async () => { await addNode('requirements', 'note', b[1].replace(/\*\*/g, '').slice(0, 110), '', { origin: 'coach' }); toast('Added to "Open points and assumptions" in Knowledge.'); if (stage()?.id === 'knowledge') render(); } }, '+')) : h('p', {}, line);
    }))));
    log.scrollTop = log.scrollHeight;
  };
  const ask = async (t) => {
    if (!t.trim()) return;
    const m = { role: 'assistant', content: '' }, turn = chat.filter((x) => x.role === 'user').length;
    chat.push({ role: 'user', content: t }, m); draw();
    if (AI) try {
      let hist = chat.slice(0, -1).filter((x) => x.content).slice(-12); while (hist[0]?.role !== 'user') hist.shift();
      await stream({ system: L.systemPrompt(stage(), B, STAGES), messages: hist, effort: 'low' }, (d) => { m.content += d; draw(); });
    } catch { m.content = ''; }
    if (!m.content) m.content = L.coachReply(stage(), B, t, turn);
    keep(); draw();
  };
  const input = h('textarea', { rows: 2, placeholder: 'Ask the coach…', 'aria-label': 'Message the coach', onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); input.value = ''; } } });
  draw();
  return h('aside', { class: 'glass chat' }, h('h3', {}, 'Coach ', h('button', { class: 'aibtn', title: 'AI settings', onclick: aiSettings }, '⚙ ' + aiLabel())),
    log,
    h('div', { class: 'chips' }, ['What should I do here?', 'What is still open?', 'Suggest open points'].map((c) => h('button', { onclick: () => ask(c) }, c))),
    h('div', { class: 'bar' }, input, h('button', { class: 'primary', 'aria-label': 'Send', onclick: () => { ask(input.value); input.value = ''; } }, '↑')));
}

/* ---------- dialog, toast ---------- */
function dialog(title, kids) {
  const d = $('dlg');
  set(d, h('header', {}, h('h2', {}, title), h('button', { 'aria-label': 'Close', onclick: () => d.close() }, '×')), h('div', { class: 'dbody' }, kids));
  if (!d.open) d.showModal();
  d.onclose = () => B && render();
}
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3600); }

function render() { if (!B) return renderHome(); return view === 'overview' ? renderOverview() : renderStage(); }
Promise.all([api('me'), loadStatus()]).then(([me]) => { ME = me; listenForImport(); render(); }, () => { set($('app'), h('div', { class: 'setup glass' }, h('h1', {}, 'AI Builder'), h('p', { class: 'lead' }, 'You are not signed in, or the server is not reachable. Reload the page to try again.'))); });
