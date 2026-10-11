// Mapping between this app's items and Kosanima node files (pure, no I/O).
// A node file is `<DIR>/<layer>/<type>/<name>.json` and carries both halves of every edge: the out half in the
// source's file and the matching in half in the target's. Edge order in the file is insertion order.
import { KOSANIMA_LAYERS, fqn } from './public/logic.js';

// Kosanima is still published as `apg`; the folder is due to be renamed with it.
export const DIR = 'apg/layers';

export const synced = (n) => KOSANIMA_LAYERS.includes(n.layer);
export const pathOf = (n) => `${DIR}/${n.layer}/${n.type}/${n.name}.json`;

export function toNodeFile(n, edges) {
  const f = fqn(n);
  return {
    layer: n.layer, type: n.type, name: n.name, body: n.body, properties: n.properties,
    out: edges.filter((e) => e.from_fqn === f).map((e) => ({ kind: e.kind, target: e.to_fqn, properties: {} })),
    in: edges.filter((e) => e.to_fqn === f).map((e) => ({ kind: e.kind, source: e.from_fqn, properties: {} })),
  };
}

export function fromNodeFile(file) {
  const n = { layer: file.layer, type: file.type, name: file.name, body: file.body, properties: file.properties }, f = fqn(n);
  return { node: n, edges: [...file.out.map((e) => ({ kind: e.kind, from_fqn: f, to_fqn: e.target })), ...file.in.map((e) => ({ kind: e.kind, from_fqn: e.source, to_fqn: f }))] };
}
