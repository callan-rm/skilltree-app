# Skill Charts — Frontend

A vanilla HTML/CSS/JS frontend for the Skill Tree backend. No build step,
no framework, no npm install required to run it — just static files served
to a browser.

## Design

Skills are rendered as a "star chart": nodes connected by lines that light
up gold → emerald as a student masters the prerequisites leading up to
them. This is the visual through-line of the whole app — locked skills sit
dim and dashed, unlocked ones glow gold and are clickable, pending
submissions pulse amber, and mastered skills turn emerald.

## Running it

You just need any static file server — the app is plain files.

**Option A — Python (already on most machines):**
```bash
cd skilltree-frontend
python3 -m http.server 5500
```
Then open **http://127.0.0.1:5500**.

**Option B — VS Code / VSCodium "Live Server" extension:**
Right-click `index.html` → "Open with Live Server".

**Option C — Node's `serve`:**
```bash
npx serve .
```

## Connecting to the backend

Make sure the FastAPI backend (from the other zip) is running first —
by default at `http://127.0.0.1:8000`. If you run it somewhere else, edit
`config.js`:

```js
const API_BASE = "http://127.0.0.1:8000"; // change this
```

The backend already has CORS wide open for local development, so a
frontend served from a different port works out of the box.

## Project layout

```
skilltree-frontend/
├── index.html      # shell — loads fonts, styles, and scripts
├── style.css       # design tokens + all styling
├── config.js       # API_BASE — the only thing you'll usually need to edit
├── api.js          # fetch wrapper for every backend endpoint
├── app.js          # all app state, rendering, and event handling
└── dev-tests/
    └── test_harness.js   # jsdom-based end-to-end test (dev tool, not needed to run the app)
```

There's no build tool and no bundler — `app.js` is a single file using
plain DOM string rendering with delegated event listeners. This keeps the
whole app easy to read top-to-bottom and easy to modify without tooling,
at the cost of not scaling as gracefully as a component framework would
for a much bigger app. If this grows a lot, migrating the render functions
into a framework (React, Svelte, etc.) would be the natural next step —
the `api.js` layer would carry over unchanged.

## How the tree visualization decides node status (student view)

For each skill:
1. **Locked** — not all prerequisite skills have *approved* evidence yet.
2. **Available** — unlocked, no evidence submitted yet (or a prior submission was rejected).
3. **Pending** — evidence submitted, awaiting teacher review.
4. **Mastered** — evidence approved.

This logic lives in `skillStatus()` in `app.js` and is recalculated from
the student's evidence list on every render — there's no separate
"progress" table on the backend; status is always derived live from
evidence records.

## Testing

`dev-tests/test_harness.js` is a jsdom-based script that loads the real
`index.html`/`api.js`/`app.js` and drives the UI exactly like a browser
would (filling forms, clicking nodes, submitting evidence) against a live
backend, asserting the full teacher → student → teacher review loop works.
It's a development tool, not something you need to run the app day-to-day.
To run it: `cd dev-tests && npm install jsdom node-fetch@2 && node test_harness.js`
(with the backend running on port 8000).

## Known limitations / next steps

- **No file upload UI** — the evidence form takes a file *URL*, not a
  direct upload. You'd need to add a file input + upload endpoint (e.g. to
  S3 or local disk) on the backend to support real uploads.
- **No student self-management of their own account** (e.g. changing
  password) — out of scope for now.
- **Student IDs are entered manually** by the teacher when adding to a
  group or assigning a tree — there's no student search/directory UI yet.
  Fine for a small class, would want a proper picker at scale.
- **No pagination** — group/tree/evidence lists assume small classroom-scale data.
