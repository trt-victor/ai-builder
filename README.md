# AI Builder

Phase 2 and 3 of AI Leap in one shared workspace. A reimagination session ends with a scenario and a draft prototype; AI Builder takes that draft to something engineers can build and the client can run:

**Knowledge → Boundaries → Build → Release**, then **AI Pulse: Compliance → Finance → Perform**, on the same build.

It organises the build; the solution itself is built in the engineers' repository.

```bash
npm install
npm start        # http://localhost:4280
npm test
```

Locally there is nothing else to install: the database is PGlite (Postgres in-process) in `data/pg`, and you are signed in as `DEV_USER` (default `dev@local`).

## How it works

- **A build** is one client solution. Start one empty, or press **Continue to Build** on the last stage of the Process Reimagination app: the scenario, canvas, jobs-to-be-done, process steps and prototype come over.
- **Draft until confirmed.** Everything imported or suggested by the coach is a draft. A named person confirms each item; changing the text of a confirmed item makes it a draft again.
- **The prototype is kept.** Version 0 is the prototype as it left the workshop and is never changed. Work continues on copies; every change is a new version.
- **Traceability.** Each requirement is followed down: requirement → concept or process step → component → code.
- **Gates.** Every stage ends with go / pivot / stop, taken by the build lead. Going ahead with open points needs a written reason.
- **Overview.** One page with every stage, every answer and what is still open.
- **Questions.** Anyone on the build can ask and answer; open questions count against the stage's gate.
- **History.** Every change is logged with who and when.

## Roles

| Role | Can |
|---|---|
| lead | everything, including gates and people |
| engineer | edit every stage |
| colleague | edit Knowledge and Boundaries |
| client | edit and confirm Knowledge, read the rest |

Everyone can read, ask and answer. People are added by e-mail under **People**.

## Kosanima knowledge repository

Items in the layers `requirements`, `domain`, `solution` and `global` are stored exactly like Kosanima node files (`layer.type.name`, string properties, the same edge kinds). `kosanima.js` holds the mapping and is tested against the real node files in `../apg`.

**Create the Kosanima knowledge repository** (Overview, lead or engineer) makes the active-knowledge repo for a build in one step:

1. a new git repository in `KNOWLEDGE_ROOT` (default `../knowledge/<build-name>`),
2. initialised by the Kosanima binary (`apg init`),
3. seeded with one node file per stakeholder, user, requirement, concept, process step, system, container, component and boundary, with their links,
4. checked by Kosanima itself (`apg scan`, and the model rules of `apg spec lint`); if it refuses anything, nothing is created,
5. committed, and pushed to a new **private** GitHub repository when `KNOWLEDGE_GITHUB_OWNER` is set (uses the `gh` CLI).

The build is then linked to that repository. Free-standing notes (open points, build conditions, decision rights) are written to `BUILD.md` in the repo, because a Kosanima note must explain exactly one item.

The same creator runs from the command line, on a build or straight on a reimagination session:

```bash
node kosanima-repo.js build-or-session.json
```

It needs `git` and the Kosanima binary (`apg`, or `KOSANIMA_BIN`) on the machine the server runs on. It creates only: later changes are made in the repository, and reading those back into AI Builder is not built yet.

## Hosting on Azure (not deployed yet)

- App Service (Node) with **authentication switched on** (Microsoft Entra ID; clients as guests). Set `AUTH=entra`: the app then reads the signed-in person from the header App Service adds. Without `AUTH=entra` the app refuses to start on a hosted environment, because everyone would be the same dev user.
- Azure Database for PostgreSQL: set `DATABASE_URL`. The schema in `schema.sql` is created on start.
- Set `REIMAGINE_URL` to where the reimagination app runs, and `BUILDER_URL` there to where this app runs.

## Coach and AI

Same as the reimagination app: no model (guide mode), a local model through Ollama, Claude with a personal key, or Claude with a server key. Chosen under ⚙ AI settings. With a model the coach can also draft missing requirements from the prototype and change the prototype in plain language (always as a new version).

## Where things live

- `public/content.js`: the method. Phases, stages, questions and tables. Edit here to change what is asked.
- `public/logic.js`: pure logic shared by browser and server (roles, traceability, open points, import, coach), covered by `logic.test.js`.
- `public/app.js`, `style.css`: UI. The stylesheet is the reimagination app's, with additions at the end.
- `server.js`: static files, the JSON API, the model proxy. `schema.sql`, `db.js`: the database. `auth.js`: who is calling.
- `kosanima.js`: item ⇄ Kosanima node file. `kosanima-repo.js`: creates the knowledge repository.
- `skills/ai-builder/`: the build method as a skill for Claude or Copilot. `references/build_method.md` is generated from `content.js` with `npm run skill`.
