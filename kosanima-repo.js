// Creates a Kosanima active-knowledge repository from a build: a git repo, initialised by the Kosanima binary,
// seeded with one node file per item, and checked by the binary's own scan before anything is committed.
//   node kosanima-repo.js <file.json>     file = an AI Builder build ({ build, nodes, edges }) or a reimagination session
// shortcut: creates only, on the machine this runs on (needs git and the Kosanima binary). Later changes are made in
// the repository; reading them back, and creating repos from a hosted server, come with the GitHub App.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { slug, fqn, title, importSession } from './public/logic.js';
import { synced, pathOf, toNodeFile } from './kosanima.js';

const run = promisify(execFile);
const BIN = process.env.KOSANIMA_BIN || 'apg';
export const ROOT = resolve(process.env.KNOWLEDGE_ROOT || fileURLToPath(new URL('../knowledge', import.meta.url)));

export async function createRepo({ name, summary = '', nodes, edges, by = '' }, { root = ROOT, owner = process.env.KNOWLEDGE_GITHUB_OWNER } = {}) {
  const id = slug(name), dir = join(root, id);
  if (existsSync(dir)) throw new Error(`A repository for "${name}" already exists at ${dir}. Changes to it are made in the repository.`);
  // Kosanima notes explain exactly one item. The build's free-standing notes (open points, build conditions,
  // decision rights) do not fit that, so they go into BUILD.md as text instead of into the graph.
  const loose = nodes.filter((n) => synced(n) && n.type === 'note' && n.body.trim());
  const keep = nodes.filter((n) => synced(n) && n.type !== 'note'), names = new Set(keep.map(fqn)), live = edges.filter((e) => names.has(e.from_fqn) && names.has(e.to_fqn));
  if (!keep.length) throw new Error('There is no knowledge to seed yet. Add requirements first.');
  const sh = (cmd, ...args) => run(cmd, args, { cwd: dir, maxBuffer: 16e6 });
  const commit = (msg) => sh('git', 'add', '-A').then(() => sh('git', 'commit', '-q', '-m', msg, ...(/^[^@\s<>]+@[^@\s<>]+$/.test(by) ? ['--author', `${by.split('@')[0]} <${by}>`] : [])));
  mkdirSync(dir, { recursive: true });
  try {
    await sh('git', 'init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'README.md'), `# ${name}\n\n${summary ? summary + '\n\n' : ''}Kosanima active knowledge for this solution: requirements, domain, solution design and, as it is built, the implementation, as one connected and versioned model.\n\nSeeded from AI Builder. Items whose properties carry no \`confirmed-by\` are still drafts from the workshop.\n\nChanges are proposed on a branch (a Kosanima project) and merged after review. Do not edit the files under \`apg/layers/\` by hand.\n`);
    await commit('Initial commit');
    await sh(BIN, 'init', '.');
    for (const n of keep) { const p = join(dir, pathOf(n)); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(toNodeFile(n, live), null, 2) + '\n'); }
    if (loose.length) writeFileSync(join(dir, 'BUILD.md'), `# Build notes\n\nFrom AI Builder at the time this repository was created. Not part of the knowledge graph.\n\n${loose.map((n) => `## ${title(n)}\n\n${n.body.trim()}${n.properties['confirmed-by'] ? '' : '\n\n_Draft, not confirmed._'}`).join('\n\n')}\n`);
    // Kosanima's own checks decide: the scan refuses broken files and edges, the lint refuses rule violations.
    await sh(BIN, 'scan', '.');
    const lint = await sh(BIN, 'spec', 'lint').then((r) => r.stdout + r.stderr, (e) => String(e.stdout || '') + String(e.stderr || e.message));
    // Only the model rules (R2, R3, R4) count here. The lint's delta gates ask for a plan phase per changed
    // requirement, which is the engineers' first step in the repository, not something a seed can have.
    const broken = lint.split('\n').filter((l) => /spec lint: R\d/.test(l));
    if (broken.length) throw Object.assign(new Error('lint'), { stderr: broken.join(' ') });
    await commit(`Seed active knowledge from AI Builder (${keep.length} nodes)`);
  } catch (e) {
    rmSync(dir, { recursive: true, force: true }); // nothing half-made is left behind, so it can be tried again
    throw new Error(e.code === 'ENOENT' ? `"${e.path}" is not installed on this machine (git and the Kosanima binary are needed).` : `The repository was not created: ${String(e.stderr || e.message).trim().split('\n').slice(-3).join(' ').slice(0, 600)}`);
  }
  let remote = '', warning = '';
  if (owner) try { await sh('gh', 'repo', 'create', `${owner}/${id}`, '--private', '--source', '.', '--push'); remote = `${owner}/${id}`; } catch (e) { warning = `Created locally, but not on GitHub: ${String(e.stderr || e.message).trim().split('\n').at(-1)}`; }
  return { dir, remote, files: keep.length, warning };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const j = JSON.parse(readFileSync(process.argv[2], 'utf8')), d = j.build ? { name: j.build.name, summary: j.build.summary, nodes: j.nodes, edges: j.edges } : importSession(j);
  createRepo(d).then((r) => console.log(`Created ${r.dir}${r.remote ? ' and github.com/' + r.remote : ''} with ${r.files} nodes. ${r.warning}`), (e) => { console.error(e.message); process.exit(1); });
}
