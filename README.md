# Skill Charts

A skill-tree based platform for teachers and students: teachers build
skill trees with prerequisite chains, assign them to groups or
individuals, and review evidence students submit; students work through
unlocked skills and submit evidence as they go.

## Structure

- `backend/` — FastAPI + SQLAlchemy API (auth, groups, skill trees, evidence review)
- `frontend/` — vanilla HTML/CSS/JS single-page app (no build step)

Each folder has its own README with setup instructions. Quick start:

```bash
# Terminal 1 — backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Terminal 2 — frontend
cd frontend
python3 -m http.server 5500
```

Then open http://127.0.0.1:5500 in a browser. The frontend talks to the
backend at http://127.0.0.1:8000 by default (change this in
`frontend/config.js` if you run the backend elsewhere).

This has been tested end-to-end: signup for both roles, skill tree and
skill creation with prerequisites, group assignment, the
locked-until-prerequisites-approved logic, evidence submission, and
teacher review/approval all work as a connected system.
