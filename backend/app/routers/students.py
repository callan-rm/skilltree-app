from fastapi import APIRouter, Depends
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
