from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import models
from .database import engine
from .storage import UPLOAD_DIR
from .routers import auth, groups, skill_trees, evidence, students

# Creates tables if they don't exist yet (fine for dev; use Alembic migrations for prod)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Skill Tree API")

# Wide-open CORS for local development. Tighten this before deploying
# (restrict allow_origins to your actual frontend domain).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(skill_trees.router)
app.include_router(evidence.router)
app.include_router(students.router)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
def root():
    return {"status": "ok", "docs": "/docs"}
