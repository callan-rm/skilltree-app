from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/groups", tags=["groups"])


@router.post("/", response_model=schemas.GroupOut)
def create_group(
    group_in: schemas.GroupCreate,
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    group = models.Group(name=group_in.name, teacher_id=teacher.id)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.get("/", response_model=list[schemas.GroupOut])
def list_my_groups(
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    return db.query(models.Group).filter(models.Group.teacher_id == teacher.id).all()


@router.post("/{group_id}/students/{student_id}")
def add_student_to_group(
    group_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    group = db.query(models.Group).filter(
        models.Group.id == group_id, models.Group.teacher_id == teacher.id
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    student = db.query(models.User).filter(
        models.User.id == student_id, models.User.role == models.UserRole.student
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if student not in group.students:
        group.students.append(student)
        db.commit()

    return {"detail": f"Added {student.full_name} to {group.name}"}


@router.delete("/{group_id}/students/{student_id}")
def remove_student_from_group(
    group_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    group = db.query(models.Group).filter(
        models.Group.id == group_id, models.Group.teacher_id == teacher.id
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    student = next((s for s in group.students if s.id == student_id), None)
    if student:
        group.students.remove(student)
        db.commit()

    return {"detail": "Removed"}
