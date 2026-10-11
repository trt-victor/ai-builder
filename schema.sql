-- One build = one client solution moving from the reimagination draft through AI Builder into AI Pulse.
-- Nodes and edges are shaped like Kosanima node files (layer.type.name, string properties) so the repo link is a mapping.

CREATE TABLE IF NOT EXISTS builds (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  repo TEXT NOT NULL DEFAULT '',
  rev INTEGER NOT NULL DEFAULT 0,          -- bumped on every change; pages poll it
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membership is by e-mail, so people can be added before their first sign-in.
CREATE TABLE IF NOT EXISTS members (
  build_id INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('lead', 'engineer', 'colleague', 'client')),
  PRIMARY KEY (build_id, email)
);

CREATE TABLE IF NOT EXISTS nodes (
  build_id INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  layer TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  properties JSONB NOT NULL DEFAULT '{}',  -- string -> string; title, origin, confirmed-by, ...
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (build_id, layer, type, name)
);

CREATE TABLE IF NOT EXISTS edges (
  id SERIAL PRIMARY KEY,                   -- insertion order is the order in the node file
  build_id INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  from_fqn TEXT NOT NULL,
  to_fqn TEXT NOT NULL,
  UNIQUE (build_id, kind, from_fqn, to_fqn)
);

CREATE TABLE IF NOT EXISTS gates (
  id SERIAL PRIMARY KEY,
  build_id INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('go', 'pivot', 'stop')),
  note TEXT NOT NULL DEFAULT '',
  by TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  build_id INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  due TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Not started'
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  build_id INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  about TEXT NOT NULL DEFAULT '',          -- fqn of the node it concerns, or ''
  text TEXT NOT NULL,
  asked_by TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  answered_by TEXT NOT NULL DEFAULT '',
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert-only: version 0 is the prototype as it left the reimagination and is never changed.
CREATE TABLE IF NOT EXISTS prototypes (
  build_id INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  html TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  by TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (build_id, version)
);

-- Append-only audit trail. Never UPDATE or DELETE rows here.
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  build_id INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
