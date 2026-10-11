// Writes the skill's method file from public/content.js, so the app and the skill teach the same method.
// Run with `npm run skill` after changing content.js; a test fails when the file is out of date.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { STAGES, PHASES, GATES } from '../public/content.js';

export const OUT = new URL('./ai-builder/references/build_method.md', import.meta.url);

export function methodMd() {
  const out = ['# AI Builder method', '', '_Generated from `public/content.js` by `npm run skill`. Do not edit by hand._', '',
    'Layers `requirements`, `domain`, `solution` and `global` are Kosanima layers: items there become node files `<layer>/<type>/<name>.json` in the repository. `release` and `pulse` stay in the AI Builder app.', '',
    `Every stage ends with a gate: ${GATES.map((g) => g[1].toLowerCase()).join(', ')}. Going ahead with open points needs a written reason.`];
  for (const p of PHASES.slice(1)) {
    out.push('', `## Phase ${p.n}: ${p.name}`, '', p.sub);
    for (const st of STAGES.filter((s) => s.phase === p.id)) {
      out.push('', `### ${st.title}`, '', st.objective, '', '**Steps**', ...st.steps.map((s, i) => `${i + 1}. ${s.t}: ${s.d}`), '', '**Questions to ask**', ...st.ask.map((q) => `- ${q}`), '', '**What to capture**');
      for (const w of st.widgets.filter((x) => x.type === 'nodes')) {
        const cols = w.cols.map((c) => c.label + (c.options ? ` (${c.options.join(' / ')})` : c.kind === 'link' ? ` (link: ${c.edge})` : c.kind === 'attach' ? ' (attaches-to)' : '')).join('; ');
        out.push(`- **${w.title}** — \`${w.layer}.${w.ntype}\`${w.min ? `, at least ${w.min}` : ''}. ${w.hint || ''} Columns: ${cols}.`.replace(/\s+/g, ' '));
        for (const fx of w.fixed || []) out.push(`  - \`${fx.name}\` ${fx.title}${fx.ph ? ': ' + fx.ph : ''}`);
      }
    }
  }
  return out.join('\n') + '\n';
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) { writeFileSync(OUT, methodMd()); console.log('Wrote', OUT.pathname); }
