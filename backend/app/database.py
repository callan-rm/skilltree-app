"""
Database connection setup.

Uses SQLite by default so you can run this immediately with zero setup.
To switch to Postgres later, just change DATABASE_URL, e.g.:
    postgresql://user:password@localhost:5432/skilltree
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./skilltree.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a DB session and closes it afterward."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
