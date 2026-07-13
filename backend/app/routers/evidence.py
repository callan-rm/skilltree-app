import datetime
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db
from ..storage import UPLOAD_DIR

router = APIRouter(prefix="/evidence", tags=["evidence"])


def _skill_is_unlocked(skill: models.Skill, student: models.User, db: Session) -> bool:
    """A skill is unlocked once all of its prerequisites have approved evidence."""
    if not skill.prerequisites:
        return True
    for prereq in skill.prerequisites:
        approved = db.query(models.Evidence).filter(
            models.Evidence.skill_id == prereq.id,
            models.Evidence.student_id == student.id,
            models.Evidence.status == models.EvidenceStatus.approved,
        ).first()
        if not approved:
            return False
    return True


@router.post("/upload")
def upload_evidence_file(
    file: UploadFile = File(...),
    student: models.User = Depends(auth.require_student),
):
    ext = os.path.splitext(file.filename or "")[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as out:
        out.write(file.file.read())
    return {"file_url": f"/uploads/{filename}"}


@router.post("/", response_model=schemas.EvidenceOut)
def submit_evidence(
    evidence_in: schemas.EvidenceCreate,
    db: Session = Depends(get_db),
    student: models.User = Depends(auth.require_student),
):
    skill = db.query(models.Skill).filter(models.Skill.id == evidence_in.skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    if not _skill_is_unlocked(skill, student, db):
        raise HTTPException(
            status_code=400,
            detail="Prerequisites for this skill haven't been approved yet",
        )

    evidence = models.Evidence(
        skill_id=skill.id,
        student_id=student.id,
        content_text=evidence_in.content_text,
        file_url=evidence_in.file_url,
        file_name=evidence_in.file_name,
        link_url=evidence_in.link_url,
    )
    db.add(evidence)
    db.commit()
    db.refresh(evidence)
    return schemas.EvidenceOut.from_orm_with_names(evidence)


@router.get("/mine", response_model=list[schemas.EvidenceOut])
def my_evidence(
    db: Session = Depends(get_db),
    student: models.User = Depends(auth.require_student),
):
    evidences = db.query(models.Evidence).filter(models.Evidence.student_id == student.id).all()
    return [schemas.EvidenceOut.from_orm_with_names(e) for e in evidences]


@router.get("/pending", response_model=list[schemas.EvidenceOut])
def pending_review(
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    """All pending evidence for skill trees this teacher owns."""
    evidences = (
        db.query(models.Evidence)
        .join(models.Skill)
        .join(models.SkillTree)
        .filter(
            models.SkillTree.teacher_id == teacher.id,
            models.Evidence.status == models.EvidenceStatus.pending,
        )
        .all()
    )
    return [schemas.EvidenceOut.from_orm_with_names(e) for e in evidences]


@router.post("/{evidence_id}/review", response_model=schemas.EvidenceOut)
def review_evidence(
    evidence_id: int,
    review: schemas.EvidenceReview,
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    evidence = (
        db.query(models.Evidence)
        .join(models.Skill)
        .join(models.SkillTree)
        .filter(models.Evidence.id == evidence_id, models.SkillTree.teacher_id == teacher.id)
        .first()
    )
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")

    evidence.status = review.status
    evidence.teacher_feedback = review.teacher_feedback
    evidence.reviewed_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(evidence)
    return schemas.EvidenceOut.from_orm_with_names(evidence)
