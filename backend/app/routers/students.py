from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/students", tags=["students"])


@router.get("/", response_model=list[schemas.UserOut])
def list_students(
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    return (
        db.query(models.User)
        .filter(models.User.role == models.UserRole.student)
        .order_by(models.User.full_name)
        .all()
    )


@router.get("/{student_id}/progress", response_model=list[schemas.StudentProgressTree])
def student_progress(
    student_id: int,
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    """Skill trees a student has started, with the skills they've mastered
    in each — 'started' means at least one evidence submission exists for a
    skill in that tree; mastery is based on each skill's most recent
    submission, matching the same latest-evidence-wins logic the student
    view uses to compute skill status."""
    student = db.query(models.User).filter(
        models.User.id == student_id, models.User.role == models.UserRole.student
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    evidences = (
        db.query(models.Evidence)
        .join(models.Skill)
        .filter(models.Evidence.student_id == student_id)
        .order_by(models.Evidence.submitted_at.desc())
        .all()
    )

    latest_by_skill = {}
    for e in evidences:
        latest_by_skill.setdefault(e.skill_id, e)

    trees: dict[int, schemas.StudentProgressTree] = {}
    for e in latest_by_skill.values():
        skill = e.skill
        tree = skill.skill_tree
        entry = trees.setdefault(
            tree.id,
            schemas.StudentProgressTree(skill_tree_id=tree.id, skill_tree_title=tree.title, attained_skills=[]),
        )
        if e.status == models.EvidenceStatus.approved:
            entry.attained_skills.append(skill.title)

    return list(trees.values())
