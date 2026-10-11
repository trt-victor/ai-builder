import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import * as L from './public/logic.js';
import { STAGES, PHASES } from './public/content.js';
import { toNodeFile, fromNodeFile, pathOf } from './kosanima.js';
import { methodMd, OUT } from './skills/build-skill.js';
import { createRepo } from './kosanima-repo.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PGLITE_DIR = 'memory://';
delete process.env.DATABASE_URL; delete process.env.AUTH;

const node = (layer, type, name, body = 'x', properties = {}) => ({ layer, type, name, body, properties });
const stageBy = (id) => STAGES.find((s) => s.id === id);
const SESSION = {
  caseName: 'Order changes', proto: '<!doctype html><title>p</title>',
  f: { usecase: 'Order change desk', user: 'Order desk specialist. Works the queue', outcome: 'Fewer late changes', data: 'Orders, changes' },
  steps: [{ id: 'a', name: 'Order entry' }, { id: 'b', name: 'Fulfilment' }],
  notes: [{ zone: 'fr:a', text: 'Re-typed by hand' }],
  rows: { jtbd: [{ job: 'Order entry', who: 'ai', why: 'Typing is not judgement' }, { job: 'Approve exceptions', who: 'human', why: 'Risk' }] },
  scenario: { title: 'T', tagline: 'Agents prepare, people decide', steps: [{ name: 'Trigger', does: 'd', agent: 'Intake agent' }, { name: 'Check', does: 'c', agent: null }, { name: 'Finish', does: 'f', agent: null }] },
};

test('content is consistent with the catalog', () => {
  assert.deepEqual([...new Set(STAGES.map((s) => s.phase))], PHASES.slice(1).map((p) => p.id));
  for (const st of STAGES) for (const w of st.widgets.filter((x) => x.type === 'nodes')) {
    assert.ok(L.LAYERS[w.layer].includes(w.ntype), `${w.layer}.${w.ntype}`);
    for (const fx of w.fixed || []) assert.ok(L.validName(fx.name), fx.name);
    for (const c of w.cols.filter((x) => x.kind === 'link')) for (const t of c.to) {
      const other = `${t}.x`, mine = `${w.layer}.${w.ntype}.y`;
      assert.ok(c.dir === 'out' ? L.edgeOk(c.edge, mine, other) : L.edgeOk(c.edge, other, mine), `${w.title}: ${c.edge} ${t}`);
    }
  }
});

test('the skill method file is up to date with content.js (npm run skill)', () => {
  assert.equal(readFileSync(OUT, 'utf8'), methodMd());
});

test('roles: who may do what', () => {
  assert.ok(L.can('lead', 'gate') && L.can('lead', 'members') && L.can('lead', 'edit', 'build'));
  assert.ok(L.can('engineer', 'edit', 'build') && !L.can('engineer', 'gate') && !L.can('engineer', 'members'));
  assert.ok(L.can('colleague', 'edit', 'boundaries') && !L.can('colleague', 'edit', 'build'));
  assert.ok(L.can('client', 'edit', 'knowledge') && L.can('client', 'ask') && !L.can('client', 'edit', 'boundaries') && !L.can('client', 'edit', 'pulse'));
  assert.ok(!L.can(undefined, 'read') && !L.can('admin', 'read'));
  assert.equal(L.stageOf('requirements', 'constraint'), 'boundaries');
  assert.equal(L.stageOf('solution', 'component'), 'build');
});

test('readiness follows the spine and gaps name what is open', () => {
  const B = { build: { name: 'b', client: '', summary: '' }, gates: [], questions: [], nodes: [
    node('requirements', 'requirement', 'r1', 'must', { acceptance: 'when', 'confirmed-by': 'a@b' }), node('requirements', 'requirement', 'r2'),
    node('domain', 'service', 's1'), node('solution', 'component', 'c1'), node('requirements', 'constraint', 'k1', 'x', { 'attaches-to': 'requirements.requirement.r1' }),
  ], edges: [{ kind: 'drives', from_fqn: 'requirements.requirement.r1', to_fqn: 'domain.service.s1' }, { kind: 'realised-by', from_fqn: 'domain.service.s1', to_fqn: 'solution.component.c1' }] };
  const [r1, r2] = L.readiness(B);
  assert.deepEqual([r1.confirmed, r1.acceptance, r1.boundary, r1.domain, r1.solution, r1.code], [true, true, true, true, true, false]);
  assert.deepEqual([r2.confirmed, r2.domain, r2.solution], [false, false, false]);
  const k = L.gaps(stageBy('knowledge'), B).join(' ');
  assert.match(k, /1 requirement has no "met when"/); assert.match(k, /Requirements: 2 so far, aim for at least 3/); assert.match(k, /not confirmed yet/);
  assert.match(L.gaps(stageBy('build'), B).join(' '), /1 requirement is not yet realised/);
  assert.match(L.gaps(stageBy('boundaries'), B).join(' '), /Risk lenses: Data leakage/);
  assert.match(L.coachReply(stageBy('knowledge'), B, 'what is still open?'), /still open/);
  assert.match(L.systemPrompt(stageBy('knowledge'), B, STAGES), /\[draft\]/);
});

test('a reimagination session becomes an unconfirmed draft', () => {
  const d = L.importSession(SESSION);
  assert.equal(d.name, 'Order change desk');
  assert.ok(d.nodes.length >= 7 && d.nodes.every((n) => n.properties.origin === 'reimagination' && !L.confirmed(n) && L.validName(n.name)));
  assert.ok(d.nodes.some((n) => L.fqn(n) === 'domain.service.order-entry' && /Re-typed/.test(n.body)));
  assert.deepEqual(d.edges, [{ kind: 'drives', from_fqn: 'requirements.requirement.order-entry', to_fqn: 'domain.service.order-entry' }]);
  assert.ok(d.nodes.some((n) => n.type === 'component' && n.properties.title === 'Intake agent'));
  assert.equal(d.prototype, SESSION.proto);
  assert.equal(L.importSession({}).nodes.length, 0); // junk in, nothing out
  assert.equal(L.importSession(null).name, 'Imported build');
});

test('model output parsing is defensive', () => {
  assert.deepEqual(L.parseDraft('nope'), []);
  const items = L.parseDraft('```json {"requirements":[{"title":"A","body":"must","acceptance":"when"},{"body":"no title"}],"open":[{"title":"Q"}]} ```');
  assert.deepEqual(items.map((x) => `${x.layer}.${x.type}`), ['requirements.requirement', 'requirements.note']);
  assert.equal(L.slug('  Très  Long — Name! '), 'tres-long-name');
});

test('Kosanima node files round-trip', () => {
  const n = node('requirements', 'requirement', 'r1', 'must', { title: 'R one' });
  const edges = [{ kind: 'drives', from_fqn: 'requirements.requirement.r1', to_fqn: 'domain.service.s1' }, { kind: 'contains', from_fqn: 'requirements.user.u', to_fqn: 'requirements.requirement.r1' }];
  const file = toNodeFile(n, edges);
  assert.equal(pathOf(n), 'apg/layers/requirements/requirement/r1.json');
  assert.deepEqual(file.out, [{ kind: 'drives', target: 'domain.service.s1', properties: {} }]);
  assert.deepEqual(file.in, [{ kind: 'contains', source: 'requirements.user.u', properties: {} }]);
  // Against the real thing, when the Kosanima repo sits next to this one.
  const root = new URL('../apg/apg/layers/', import.meta.url);
  if (!existsSync(root)) return;
  let count = 0;
  for (const layer of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) for (const type of readdirSync(new URL(layer.name + '/', root))) for (const f of readdirSync(new URL(`${layer.name}/${type}/`, root)).filter((x) => x.endsWith('.json'))) {
    const real = JSON.parse(readFileSync(new URL(`${layer.name}/${type}/${f}`, root), 'utf8')), back = fromNodeFile(real);
    assert.ok(L.validName(real.name), real.name);
    assert.deepEqual(toNodeFile(back.node, back.edges), real, f);
    count++;
  }
  assert.ok(count > 100);
});

test('server: import, roles, stale edits, confirmation, gate', async (t) => {
  const { createApp } = await import('./server.js');
  const server = await createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const call = async (path, body) => { const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, data: r.ok ? await r.json() : await r.text() }; };
  const as = (email) => { process.env.DEV_USER = email; };

  as('lead@ey.com');
  const { data: { id } } = await call('builds', { session: SESSION });
  let B = (await call('builds/' + id)).data;
  assert.equal(B.role, 'lead'); assert.equal(B.prototypes[0].version, 0); assert.ok(B.nodes.length >= 7);
  assert.equal((await call(`builds/${id}/prototype/0`)).data.html, SESSION.proto);

  // a form post from another site carries no JSON content type
  assert.equal((await fetch(base + `builds/${id}/gate`, { method: 'POST', body: 'x' })).status, 405);

  const req = { ...B.nodes.find((n) => L.fqn(n) === 'requirements.requirement.order-entry') };
  const ok = await call(`builds/${id}/node`, { ...req, body: 'The desk must see every change', properties: { ...req.properties, 'confirmed-by': 'someone@else.com' } });
  assert.equal(ok.data.version, 2); assert.equal(ok.data.properties['confirmed-by'], 'lead@ey.com'); // nobody confirms in another name
  assert.equal((await call(`builds/${id}/node`, { ...req, body: 'stale' })).status, 409);
  const edited = await call(`builds/${id}/node`, { ...req, version: 2, body: 'Changed text', properties: ok.data.properties });
  assert.equal(edited.data.properties['confirmed-by'], undefined); // a changed text is a draft again
  assert.equal((await call(`builds/${id}/node`, { layer: 'requirements', type: 'bogus', name: 'x', body: '', properties: {}, version: 0 })).status, 400);
  assert.equal((await call(`builds/${id}/edge`, { kind: 'drives', from: 'domain.service.order-entry', to: 'requirements.requirement.order-entry', on: true })).status, 400);

  // the original prototype is never overwritten
  assert.equal((await call(`builds/${id}/prototype`, { html: '<!doctype html>v1', note: 'change' })).data.version, 1);
  assert.equal((await call(`builds/${id}/prototype/0`)).data.html, SESSION.proto);

  // going ahead with open points needs a reason
  const blocked = await call(`builds/${id}/gate`, { stage: 'knowledge', decision: 'go', note: '' });
  assert.equal(blocked.status, 400); assert.match(blocked.data, /Open points remain/);
  assert.equal((await call(`builds/${id}/gate`, { stage: 'knowledge', decision: 'go', note: 'Accepted for the pilot' })).status, 200);

  as('client@client.com');
  assert.equal((await call('builds/' + id)).status, 403);
  assert.deepEqual((await call('builds')).data, []);
  as('lead@ey.com');
  assert.equal((await call(`builds/${id}/member`, { email: 'Client@client.com', role: 'client' })).status, 200);
  assert.equal((await call(`builds/${id}/member`, { email: 'lead@ey.com', role: 'client' })).status, 400); // last lead stays
  as('client@client.com');
  assert.equal((await call('builds/' + id)).data.role, 'client');
  assert.equal((await call(`builds/${id}/node`, { layer: 'requirements', type: 'user', name: 'planner', body: 'Plans', properties: { title: 'Planner' }, version: 0 })).status, 200);
  assert.equal((await call(`builds/${id}/node`, { layer: 'solution', type: 'component', name: 'x', body: '', properties: {}, version: 0 })).status, 403);
  assert.equal((await call(`builds/${id}/gate`, { stage: 'knowledge', decision: 'stop', note: '' })).status, 403);
  assert.equal((await call(`builds/${id}/ask`, { about: '', text: 'Who owns the order data?' })).status, 200);

  as('lead@ey.com');
  B = (await call('builds/' + id)).data;
  assert.ok(B.events.some((e) => e.action === 'gate' && /go with \d+ open points/.test(e.detail)));
  assert.equal(B.questions.length, 1);
  assert.equal((await call(`builds/${id}/rev`)).data.rev, B.build.rev);
});

test('a knowledge repository is created and accepted by the Kosanima binary', async (t) => {
  try { execFileSync('apg', ['--version']); } catch { return t.skip('Kosanima binary (apg) not installed'); }
  const root = mkdtempSync(join(tmpdir(), 'knowledge-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const d = L.importSession(SESSION), opts = { root, owner: '' };
  const r = await createRepo({ ...d, by: 'lead@ey.com' }, opts);
  assert.equal(r.files, d.nodes.filter((n) => n.type !== 'note').length);
  assert.match(readFileSync(join(r.dir, 'BUILD.md'), 'utf8'), /Intended outcome[\s\S]*Fewer late changes[\s\S]*Draft, not confirmed/);
  assert.ok(existsSync(join(r.dir, 'apg/layers/requirements/requirement/order-entry.json')) && existsSync(join(r.dir, 'apg/config.json')));
  const git = (...a) => execFileSync('git', a, { cwd: r.dir, encoding: 'utf8' });
  assert.equal(git('log', '--format=%s').trim().split('\n').length, 2);
  assert.equal(git('status', '--porcelain'), '');
  assert.match(execFileSync('apg', ['query', 'MATCH (r:Requirement)-[:Drives]->(s:Service) RETURN count(*)'], { cwd: r.dir, encoding: 'utf8' }), /\b1\b/);
  await assert.rejects(createRepo(d, opts), /already exists/);
  // an item the binary refuses stops the creation and leaves nothing behind
  const bad = { name: 'Bad one', nodes: [{ layer: 'domain', type: 'entity', name: 'x', body: '', properties: { kind: 'entity' } }, { layer: 'requirements', type: 'constraint', name: 'c', body: 'x', properties: {} }, { layer: 'requirements', type: 'constraint', name: 'c2', body: 'x', properties: { 'attaches-to': 'requirements.requirement.gone' } }], edges: [] };
  await assert.rejects(createRepo(bad, opts), /not created/);
  assert.ok(!existsSync(join(root, 'bad-one')));
});
