# Skill Tree Backend

A FastAPI backend for a teacher/student skill-tree platform.

## What's included

- **Auth**: signup/login with JWT tokens, teacher vs student roles
- **Groups**: teachers create groups and add/remove students
- **Skill trees**: teachers create trees, add skills, define prerequisites between skills
- **Assignment**: trees can be assigned to a whole group or to individual students
- **Evidence**: students submit evidence (text/file link/external link) against a skill;
  teachers approve or reject it. A skill's prerequisites must be approved before a
  student can submit evidence for it — this is the "tree" logic.

This is tested end-to-end and works, but it's a foundation, not a finished product —
see "Not yet included" below.

## Project layout

```
skilltree-backend/
├── app/
│   ├── main.py           # FastAPI app + route registration
│   ├── database.py       # DB engine/session setup (SQLite by default)
│   ├── models.py         # SQLAlchemy tables
│   ├── schemas.py        # Pydantic request/response shapes
│   ├── auth.py           # password hashing, JWT, role-based dependencies
│   └── routers/
│       ├── auth.py           # /auth/signup, /auth/login, /auth/me
│       ├── groups.py         # /groups
│       ├── skill_trees.py    # /skill-trees
│       └── evidence.py       # /evidence
└── requirements.txt
```

## Running it locally

```bash
python3 -m venv venv
source venv/bin/activate        # on Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then open **http://127.0.0.1:8000/docs** — FastAPI auto-generates an interactive
Swagger UI where you can try every endpoint without writing any client code yet.

By default it uses a local SQLite file (`skilltree.db`), created automatically on
first run. No database setup required to get started.

## Example flow (matches what was tested)

1. `POST /auth/signup` — create a teacher account (`role: "teacher"`)
2. `POST /auth/signup` — create a student account (`role: "student"`)
3. `POST /auth/login` — get a JWT (form-encoded: `username` = email, `password`)
4. As teacher: `POST /groups/` → create a group
5. As teacher: `POST /groups/{group_id}/students/{student_id}` → add student to group
6. As teacher: `POST /skill-trees/` → create a skill tree
7. As teacher: `POST /skill-trees/{tree_id}/skills` → add skills, referencing
   `prerequisite_ids` for any skill that depends on others
8. As teacher: `POST /skill-trees/{tree_id}/assign-group/{group_id}` → assign the
   tree to the group (or `assign-student/{student_id}` for an individual)
9. As student: `GET /skill-trees/` → see assigned trees
10. As student: `POST /evidence/` → submit evidence for a skill (blocked if
    prerequisites aren't approved yet)
11. As teacher: `GET /evidence/pending` → review queue
12. As teacher: `POST /evidence/{evidence_id}/review` → approve/reject with feedback

## Configuration

Two environment variables matter before deploying anywhere real:

- `SECRET_KEY` — used to sign JWTs. The code falls back to a dev-only default;
  **set a real random value in production** (e.g. `openssl rand -hex 32`).
- `DATABASE_URL` — defaults to local SQLite. Point this at Postgres for anything
  beyond a prototype, e.g. `postgresql://user:password@host:5432/skilltree`.

## Not yet included (natural next steps)

- **File uploads**: `Evidence.file_url` currently expects a URL you already have
  (e.g. from S3, Cloudinary, or Google Drive). Direct file upload handling isn't
  wired up yet.
- **Frontend**: this is API-only. Swagger docs (`/docs`) let you test it, but
  students/teachers need an actual UI — a good next step once the API shape feels right.
- **Skill tree visualization data**: `position_x`/`position_y` fields exist on
  each skill so a frontend can lay out the tree visually, but nothing renders that yet.
- **Migrations**: tables are created directly from the models on startup, fine for
  a prototype. Introduce Alembic once the schema stabilizes so you can evolve it
  without wiping data.
- **Password reset, email verification**: not implemented.
