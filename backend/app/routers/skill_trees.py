from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/skill-trees", tags=["skill trees"])


# --- Skill tree CRUD ---------------------------------------------------

@router.post("/", response_model=schemas.SkillTreeOut)
def create_skill_tree(
    tree_in: schemas.SkillTreeCreate,
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    tree = models.SkillTree(
        title=tree_in.title, description=tree_in.description, teacher_id=teacher.id
    )
    db.add(tree)
    db.commit()
    db.refresh(tree)
    return tree


@router.get("/", response_model=list[schemas.SkillTreeOut])
def list_skill_trees(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if current_user.role == models.UserRole.teacher:
        return db.query(models.SkillTree).all()

    # Student: trees assigned directly, or via one of their groups
    group_ids = [g.id for g in current_user.groups]
    trees = db.query(models.SkillTree).filter(
        (models.SkillTree.assigned_students.any(id=current_user.id))
        | (models.SkillTree.assigned_groups.any(models.Group.id.in_(group_ids)))
    ).all()
    return trees


def _get_tree_with_detail(tree_id: int, db: Session) -> schemas.SkillTreeDetail:
    tree = db.query(models.SkillTree).filter(models.SkillTree.id == tree_id).first()
    if not tree:
        raise HTTPException(status_code=404, detail="Skill tree not found")

    detail = schemas.SkillTreeDetail.model_validate(tree)
    detail.skills = [schemas.SkillOut.from_orm_with_prereqs(s) for s in tree.skills]
    return detail


@router.get("/{tree_id}", response_model=schemas.SkillTreeDetail)
def get_skill_tree(
    tree_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return _get_tree_with_detail(tree_id, db)


# --- Assignment ----------------------------------------------------------

@router.post("/{tree_id}/assign-group/{group_id}")
def assign_to_group(
    tree_id: int, group_id: int,
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    tree = db.query(models.SkillTree).filter(models.SkillTree.id == tree_id).first()
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not tree or not group:
        raise HTTPException(status_code=404, detail="Skill tree or group not found")

    if group not in tree.assigned_groups:
        tree.assigned_groups.append(group)
        db.commit()
    return {"detail": f"Assigned '{tree.title}' to group '{group.name}'"}


@router.post("/{tree_id}/assign-student/{student_id}")
def assign_to_student(
    tree_id: int, student_id: int,
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    tree = db.query(models.SkillTree).filter(models.SkillTree.id == tree_id).first()
    student = db.query(models.User).filter(
        models.User.id == student_id, models.User.role == models.UserRole.student
    ).first()
    if not tree or not student:
        raise HTTPException(status_code=404, detail="Skill tree or student not found")

    if student not in tree.assigned_students:
        tree.assigned_students.append(student)
        db.commit()
    return {"detail": f"Assigned '{tree.title}' to {student.full_name}"}


# --- Skills within a tree ------------------------------------------------

@router.post("/{tree_id}/skills", response_model=schemas.SkillOut)
def add_skill(
    tree_id: int,
    skill_in: schemas.SkillCreate,
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    tree = db.query(models.SkillTree).filter(models.SkillTree.id == tree_id).first()
    if not tree:
        raise HTTPException(status_code=404, detail="Skill tree not found")

    skill = models.Skill(
        skill_tree_id=tree.id,
        title=skill_in.title,
        evidence_required=skill_in.evidence_required,
        position_x=skill_in.position_x,
        position_y=skill_in.position_y,
    )

    if skill_in.prerequisite_ids:
        prereqs = db.query(models.Skill).filter(
            models.Skill.id.in_(skill_in.prerequisite_ids),
            models.Skill.skill_tree_id == tree.id,
        ).all()
        skill.prerequisites = prereqs

    db.add(skill)
    db.commit()
    db.refresh(skill)
    return schemas.SkillOut.from_orm_with_prereqs(skill)


@router.put("/{tree_id}/skills/{skill_id}", response_model=schemas.SkillOut)
def update_skill(
    tree_id: int,
    skill_id: int,
    skill_in: schemas.SkillCreate,
    db: Session = Depends(get_db),
    teacher: models.User = Depends(auth.require_teacher),
):
    tree = db.query(models.SkillTree).filter(models.SkillTree.id == tree_id).first()
    if not tree:
        raise HTTPException(status_code=404, detail="Skill tree not found")

    skill = db.query(models.Skill).filter(
        models.Skill.id == skill_id, models.Skill.skill_tree_id == tree.id
    ).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill.title = skill_in.title
    skill.evidence_required = skill_in.evidence_required
    skill.position_x = skill_in.position_x
    skill.position_y = skill_in.position_y

    prereqs = []
    if skill_in.prerequisite_ids:
        prereqs = db.query(models.Skill).filter(
            models.Skill.id.in_(skill_in.prerequisite_ids),
            models.Skill.skill_tree_id == tree.id,
            models.Skill.id != skill.id,
        ).all()
    skill.prerequisites = prereqs

    db.commit()
    db.refresh(skill)
    return schemas.SkillOut.from_orm_with_prereqs(skill)
