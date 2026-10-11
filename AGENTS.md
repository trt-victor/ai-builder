# Conventions for AI coding tools

Read this before editing. It applies to Claude Code, GitHub Copilot, Codex and any other agent.

- **No build step.** Vanilla JS modules in `public/`, one Node process. Do not add React, a bundler or a framework.
- **The method lives in `public/content.js`.** New questions, tables and stages go there, not in `app.js`. After changing it run `npm run skill`.
- **Items are Kosanima-shaped.** `layer.type.name`, kebab-case names, properties are string → string. Do not add columns to `nodes` for new attributes; add a property. Layer and type names in `logic.js` must match Kosanima's catalog.
- **One SQL dialect.** Plain SQL that runs on both PostgreSQL and PGlite. No ORM. Pass JSON as `JSON.stringify(x)` with a `::jsonb` cast.
- **Every change goes through an entry in `OPS` in `server.js`**: it names the permission it needs, and the router logs the event and bumps the revision. Never write to the database around it.
- **`events` is append-only, `prototypes` is insert-only.** Never UPDATE or DELETE there; version 0 of a prototype is the workshop original.
- **Permissions are decided in `can()` in `logic.js`** and enforced on the server. The browser only uses it to hide controls.
- **Sign-in:** the identity header is trusted only when `AUTH=entra`. Do not add another way in.
- **Text goes into the page as text nodes** (the `h()` helper). Prototype HTML is only ever shown in the sandboxed iframe.
- **LLM calls are server-side** through `providers.js`. A user's own key is passed through per request and never stored or logged.
- **Kosanima decides what is valid.** `kosanima-repo.js` runs the binary's scan and lint on what it writes; do not loosen that, and do not write notes without exactly one `details` edge into the graph.
- **Tests:** `npm test`. New logic gets a check in `logic.test.js`.
