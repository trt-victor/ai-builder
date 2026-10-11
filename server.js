// Static files, the JSON API over the database, and a thin streaming proxy to the coach's model (see providers.js).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { providers } from './providers.js';
import { open } from './db.js';
import { userFrom, ENTRA } from './auth.js';
import * as L from './public/logic.js';
import { STAGES } from './public/content.js';
import { createRepo } from './kosanima-repo.js';

const REIMAGINE = (process.env.REIMAGINE_URL || 'http://localhost:4173').replace(/\/$/, '');
const FILES = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/logic.js': ['logic.js', 'text/javascript'], '/content.js': ['content.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };

class Fail extends Error { constructor(status, message) { super(message); this.status = status; } }
const need = (ok, status, message) => { if (!ok) throw new Fail(status, message); };
const text = (v, max, what) => { need(typeof v === 'string' && v.length <= max, 400, `${what} is missing or too long.`); return v; };

export async function createApp() {
  const db = await open();
  await db.exec(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  const q = async (sql, params) => (await db.query(sql, params)).rows;

  const roleIn = async (id, user) => (await q('SELECT role FROM members WHERE build_id = $1 AND email = $2', [id, user.email]))[0]?.role;
  // Every change is logged and bumps the build's revision, which open pages poll.
  async function changed(id, user, action, detail = '') {
    await q('INSERT INTO events (build_id, actor, action, detail) VALUES ($1, $2, $3, $4)', [id, user.email, action, String(detail).slice(0, 300)]);
    return (await q('UPDATE builds SET rev = rev + 1 WHERE id = $1 RETURNING rev', [id]))[0].rev;
  }
  async function full(id) {
    const [build] = await q('SELECT * FROM builds WHERE id = $1', [id]);
    need(build, 404, 'No such build.');
    const [nodes, edges, gates, tasks, questions, members, prototypes, events] = await Promise.all([
      q('SELECT layer, type, name, body, properties, version, updated_by FROM nodes WHERE build_id = $1 ORDER BY updated_at, name', [id]),
      q('SELECT kind, from_fqn, to_fqn FROM edges WHERE build_id = $1 ORDER BY id', [id]),
      q('SELECT stage, decision, note, by, at FROM gates WHERE build_id = $1 ORDER BY id', [id]),
      q('SELECT id, name, owner, due, status FROM tasks WHERE build_id = $1 ORDER BY id', [id]),
      q('SELECT id, about, text, asked_by, answer, answered_by FROM questions WHERE build_id = $1 ORDER BY id', [id]),
      q('SELECT email, role FROM members WHERE build_id = $1 ORDER BY role, email', [id]),
      q('SELECT version, note, by, at FROM prototypes WHERE build_id = $1 ORDER BY version', [id]),
      q('SELECT at, actor, action, detail FROM events WHERE build_id = $1 ORDER BY id DESC LIMIT 60', [id]),
    ]);
    return { build, nodes, edges, gates, tasks, questions, members, prototypes, events };
  }
  async function putNode(id, user, n, version) {
    const rows = await q(`INSERT INTO nodes (build_id, layer, type, name, body, properties, updated_by) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      ON CONFLICT (build_id, layer, type, name) DO UPDATE SET body = EXCLUDED.body, properties = EXCLUDED.properties, version = nodes.version + 1, updated_by = EXCLUDED.updated_by, updated_at = now()
      WHERE nodes.version = $8 RETURNING version`, [id, n.layer, n.type, n.name, n.body, JSON.stringify(n.properties), user.email, version]);
    need(rows.length, 409, 'This item was changed by someone else.');
    return rows[0].version;
  }
  async function createBuild(user, { name, client = '', summary = '' }) {
    const [b] = await q('INSERT INTO builds (name, client, summary) VALUES ($1, $2, $3) RETURNING id', [text(name, 120, 'Name').trim() || 'New build', text(client, 120, 'Client'), text(summary, 400, 'Summary')]);
    await q('INSERT INTO members (build_id, email, role) VALUES ($1, $2, $3)', [b.id, user.email, 'lead']);
    return b.id;
  }

  // Each operation: which permission it needs (action, stage) and what it does. It returns extra fields for the reply.
  const OPS = {
    node: {
      can: (b) => ['edit', L.stageOf(b.layer, b.type)],
      async run(id, user, b) {
        need(L.LAYERS[b.layer]?.includes(b.type) && L.validName(b.name), 400, 'Unknown kind of item or invalid name.');
        const p = b.properties;
        need(p && typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length <= 30 && Object.entries(p).every(([k, v]) => /^[a-z][a-z0-9-]{0,39}$/.test(k) && typeof v === 'string' && v.length <= 5000), 400, 'Invalid properties.');
        need(Number.isInteger(b.version) && b.version >= 0, 400, 'Missing version.');
        text(b.body, 20000, 'Text');
        const [prev] = await q('SELECT body, properties FROM nodes WHERE build_id = $1 AND layer = $2 AND type = $3 AND name = $4', [id, b.layer, b.type, b.name]);
        // A confirmation always carries the name of the person who gave it, and does not survive a change of the text.
        const was = prev?.properties['confirmed-by'] || '';
        if (p['confirmed-by'] && p['confirmed-by'] !== was) p['confirmed-by'] = user.email;
        if (prev && prev.body !== b.body && p['confirmed-by'] === was) delete p['confirmed-by'];
        if (!p['confirmed-by']) delete p['confirmed-by'];
        const version = await putNode(id, user, b, b.version);
        return { version, properties: p, detail: `${L.fqn(b)}${p['confirmed-by'] && p['confirmed-by'] !== was ? ' confirmed' : ''}` };
      },
    },
    'node-rm': {
      can: (b) => ['edit', L.stageOf(b.layer, b.type)],
      async run(id, user, b) {
        const f = L.fqn(b);
        await q('DELETE FROM nodes WHERE build_id = $1 AND layer = $2 AND type = $3 AND name = $4', [id, b.layer, b.type, b.name]);
        await q('DELETE FROM edges WHERE build_id = $1 AND (from_fqn = $2 OR to_fqn = $2)', [id, f]);
        return { detail: f };
      },
    },
    edge: {
      can: (b) => ['edit', L.stageOf(...String(b.from).split('.'))],
      async run(id, user, b) {
        need(L.edgeOk(b.kind, b.from, b.to), 400, 'These two items cannot be linked that way.');
        if (!b.on) await q('DELETE FROM edges WHERE build_id = $1 AND kind = $2 AND from_fqn = $3 AND to_fqn = $4', [id, b.kind, b.from, b.to]);
        else {
          const [{ n }] = await q("SELECT count(*)::int AS n FROM nodes WHERE build_id = $1 AND layer || '.' || type || '.' || name IN ($2, $3)", [id, b.from, b.to]);
          need(n === 2, 400, 'One of the linked items no longer exists.');
          await q('INSERT INTO edges (build_id, kind, from_fqn, to_fqn) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [id, b.kind, b.from, b.to]);
        }
        return { detail: `${b.from} ${b.on ? '' : 'no longer '}${b.kind} ${b.to}` };
      },
    },
    gate: {
      can: () => ['gate'],
      async run(id, user, b) {
        const stage = STAGES.find((s) => s.id === b.stage);
        need(stage && ['go', 'pivot', 'stop'].includes(b.decision), 400, 'Unknown stage or decision.');
        const note = text(b.note ?? '', 2000, 'Note').trim(), open = b.decision === 'go' ? L.gaps(stage, await full(id)) : [];
        need(!open.length || note, 400, `Open points remain (${open.length}). Add a note saying why you go ahead anyway.`);
        await q('INSERT INTO gates (build_id, stage, decision, note, by) VALUES ($1, $2, $3, $4, $5)', [id, stage.id, b.decision, note, user.email]);
        return { detail: `${stage.title}: ${b.decision}${open.length ? ` with ${open.length} open points` : ''}` };
      },
    },
    task: {
      can: () => ['edit', 'build'],
      async run(id, user, b) {
        const v = [text(b.name, 300, 'Task'), text(b.owner ?? '', 120, 'Owner'), text(b.due ?? '', 20, 'Due date'), text(b.status ?? 'Not started', 20, 'Status')];
        if (b.id == null) return { id: (await q('INSERT INTO tasks (build_id, name, owner, due, status) VALUES ($1, $2, $3, $4, $5) RETURNING id', [id, ...v]))[0].id, detail: v[0] };
        await q('UPDATE tasks SET name = $3, owner = $4, due = $5, status = $6 WHERE build_id = $1 AND id = $2', [id, b.id, ...v]);
        return { detail: `${v[0]} · ${v[3]}` };
      },
    },
    'task-rm': { can: () => ['edit', 'build'], async run(id, user, b) { await q('DELETE FROM tasks WHERE build_id = $1 AND id = $2', [id, b.id]); return { detail: String(b.id) }; } },
    ask: {
      can: () => ['ask'],
      async run(id, user, b) {
        const [r] = await q('INSERT INTO questions (build_id, about, text, asked_by) VALUES ($1, $2, $3, $4) RETURNING id', [id, text(b.about ?? '', 200, 'Subject'), text(b.text, 2000, 'Question'), user.email]);
        return { id: r.id, detail: b.text };
      },
    },
    answer: {
      can: () => ['ask'],
      async run(id, user, b) { await q('UPDATE questions SET answer = $3, answered_by = $4 WHERE build_id = $1 AND id = $2', [id, b.id, text(b.answer, 4000, 'Answer'), user.email]); return { detail: String(b.id) }; },
    },
    member: {
      can: () => ['members'],
      async run(id, user, b) {
        const email = text(b.email, 200, 'E-mail').trim().toLowerCase();
        need(/^[^@\s]+@[^@\s]+$/.test(email) && (b.role === null || L.ROLES.includes(b.role)), 400, 'Give an e-mail address and a role.');
        const leads = (await q("SELECT email FROM members WHERE build_id = $1 AND role = 'lead'", [id])).map((m) => m.email);
        need(b.role === 'lead' || leads.some((e) => e !== email), 400, 'A build needs at least one lead.');
        if (b.role === null) await q('DELETE FROM members WHERE build_id = $1 AND email = $2', [id, email]);
        else await q('INSERT INTO members (build_id, email, role) VALUES ($1, $2, $3) ON CONFLICT (build_id, email) DO UPDATE SET role = EXCLUDED.role', [id, email, b.role]);
        return { detail: `${email}: ${b.role || 'removed'}` };
      },
    },
    prototype: {
      can: () => ['edit', 'build'],
      async run(id, user, b) {
        const [r] = await q('INSERT INTO prototypes (build_id, version, html, note, by) SELECT $1, COALESCE(MAX(version), -1) + 1, $2, $3, $4 FROM prototypes WHERE build_id = $1 RETURNING version',
          [id, text(b.html, 1_500_000, 'Prototype'), text(b.note ?? '', 300, 'Note'), user.email]);
        return { version: r.version, detail: `version ${r.version}` };
      },
    },
    // Creates the Kosanima knowledge repository for this build and links the build to it.
    repo: {
      can: () => ['edit', 'build'],
      async run(id, user) {
        const B = await full(id);
        need(!B.build.repo, 400, 'This build is already linked to a repository.');
        const r = await createRepo({ name: B.build.name, summary: B.build.summary, nodes: B.nodes, edges: B.edges, by: user.email }).catch((e) => { throw new Fail(400, e.message); });
        const repo = r.remote || r.dir;
        await q('UPDATE builds SET repo = $2 WHERE id = $1', [id, repo]);
        return { repo, files: r.files, warning: r.warning, detail: `${repo} (${r.files} nodes)` };
      },
    },
    patch: {
      can: () => ['edit', 'build'],
      async run(id, user, b) {
        await q('UPDATE builds SET name = $2, client = $3, summary = $4, repo = $5 WHERE id = $1', [id, text(b.name, 120, 'Name').trim() || 'Build', text(b.client, 120, 'Client'), text(b.summary, 400, 'Summary'), text(b.repo ?? '', 400, 'Repository')]);
        return { detail: b.name };
      },
    },
  };

  async function api(req, path, body) {
    const user = userFrom(req);
    need(user, 401, 'Not signed in.');
    need(req.method !== 'POST' || (body && typeof body === 'object' && !Array.isArray(body)), 400, 'Send a JSON object.');
    const POST = req.method === 'POST', m = path.match(/^\/api\/builds\/(\d+)(?:\/([a-z-]+))?(?:\/(\d+))?$/);
    if (path === '/api/me') return { ...user, reimagine: REIMAGINE };
    if (path === '/api/builds' && !POST) return q('SELECT b.id, b.name, b.client, b.summary, m.role FROM builds b JOIN members m ON m.build_id = b.id WHERE m.email = $1 ORDER BY b.id DESC', [user.email]);
    if (path === '/api/builds' && POST) {
      if (!body.session) return { id: await createBuild(user, body) };
      const d = L.importSession(body.session), id = await createBuild(user, d);
      for (const n of d.nodes) await putNode(id, user, n, 0);
      for (const e of d.edges) await q('INSERT INTO edges (build_id, kind, from_fqn, to_fqn) VALUES ($1, $2, $3, $4)', [id, e.kind, e.from_fqn, e.to_fqn]);
      if (d.prototype) await q('INSERT INTO prototypes (build_id, version, html, note, by) VALUES ($1, 0, $2, $3, $4)', [id, d.prototype, 'Original from the reimagination', user.email]);
      await changed(id, user, 'import', `${d.nodes.length} draft items from the reimagination`);
      return { id };
    }
    need(m, 404, 'Not found.');
    const id = Number(m[1]), role = await roleIn(id, user);
    need(role, 403, 'You are not a member of this build.');
    if (!POST && !m[2]) return { ...(await full(id)), role };
    if (!POST && m[2] === 'rev') return (await q('SELECT rev FROM builds WHERE id = $1', [id]))[0];
    if (!POST && m[2] === 'prototype') { const [p] = await q('SELECT html FROM prototypes WHERE build_id = $1 AND version = $2', [id, Number(m[3])]); need(p, 404, 'No such version.'); return p; }
    const op = POST && Object.hasOwn(OPS, m[2]) && OPS[m[2]];
    need(op, 404, 'Not found.');
    need(L.can(role, ...op.can(body)), 403, 'Your role on this build does not allow that.');
    const { detail, ...out } = await op.run(id, user, body);
    return { ...out, rev: await changed(id, user, m[2], detail) };
  }

  async function readBody(req, max) {
    let raw = '';
    for await (const c of req) { raw += c; need(raw.length <= max, 413, 'Too large.'); }
    return raw;
  }
  async function chat(req, res) {
    const b = JSON.parse(await readBody(req, 2_000_000));
    const p = Object.hasOwn(providers, b.provider) && providers[b.provider];
    const ok = p && typeof b.system === 'string' && Array.isArray(b.messages) && b.messages.length && b.messages.every((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content)
      && (b.model == null || /^[\w.:\/-]{1,80}$/.test(b.model));
    need(ok, 400, 'Bad request');
    // A key typed into the app arrives per request in a header; it is passed on and never stored or logged.
    const key = b.provider === 'anthropic' && typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : undefined;
    try {
      for await (const t of p.stream({ system: b.system, messages: b.messages, model: b.model, effort: b.effort, json: !!b.json, key })) {
        if (!res.headersSent) res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.write(t);
      }
      if (!res.headersSent) res.writeHead(502);
      res.end();
    } catch (e) {
      console.error(`${b.provider} error:`, e.status ?? '', e.message);
      if (!res.headersSent) res.writeHead(e.status === 401 ? 401 : 502);
      res.end();
    }
  }
  const status = async () => Object.fromEntries(await Promise.all(Object.entries(providers).map(async ([k, p]) => [k, await p.status()])));

  return http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    try {
      if (!path.startsWith('/api/')) {
        const f = FILES[path];
        need(f && req.method === 'GET', 404, 'Not found');
        const d = await readFile(new URL('./public/' + f[0], import.meta.url));
        return res.writeHead(200, { 'content-type': f[1] + '; charset=utf-8', 'cache-control': 'no-store' }).end(d);
      }
      // Changes must be JSON posts: a form on another site cannot send that content type, so it cannot act for a signed-in user.
      need(req.method === 'GET' || (req.method === 'POST' && /^application\/json\b/.test(req.headers['content-type'] || '')), 405, 'Send JSON.');
      if (path === '/api/chat') { need(userFrom(req), 401, 'Not signed in.'); return await chat(req, res); }
      const out = path === '/api/status' ? await status() : await api(req, path, req.method === 'POST' ? JSON.parse(await readBody(req, 2_000_000)) : null);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    } catch (e) {
      const known = e instanceof Fail || e instanceof SyntaxError;
      if (!known) console.error(e);
      if (!res.headersSent) res.writeHead(e instanceof Fail ? e.status : known ? 400 : 500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(e instanceof Fail ? e.message : known ? 'Bad JSON' : 'Something went wrong on the server.');
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Without Entra sign-in every visitor is the same dev user, so that mode only ever listens on this machine.
  if (!ENTRA && (process.env.WEBSITE_SITE_NAME || process.env.NODE_ENV === 'production')) { console.error('Refusing to start: set AUTH=entra (App Service authentication) when hosted.'); process.exit(1); }
  const PORT = process.env.PORT || 4280;
  (await createApp()).listen(PORT, ENTRA ? '0.0.0.0' : '127.0.0.1', async () => {
    const st = await status_();
    console.log(`AI Builder on http://localhost:${PORT}\n  sign-in: ${ENTRA ? 'Microsoft Entra ID (App Service)' : 'local dev user ' + userFrom({}).email}\n  database: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'PGlite in ./data/pg'}\n  ${st}`);
  });
}
async function status_() {
  const [o, a] = await Promise.all([providers.ollama.status(), providers.anthropic.status()]);
  return `local model (Ollama): ${o.ok ? o.models.join(', ') || 'running, no models pulled' : 'not running'}\n  Claude: ${a.server ? 'server key set' : 'no server key (users can add their own in the app)'}`;
}
