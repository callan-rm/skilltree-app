"""
Pydantic schemas — define the shape of data going in/out of the API.
Kept separate from the SQLAlchemy models so the API contract can evolve
independently of the DB schema.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict

from .models import UserRole, EvidenceStatus


# --- User ---------------------------------------------------------------

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole


class UserCreate(UserBase):
    password: str


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# --- Group ----------------------------------------------------------------

class GroupBase(BaseModel):
    name: str


class GroupCreate(GroupBase):
    pass


class GroupOut(GroupBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    teacher_id: int
    created_at: datetime
    students: list[UserOut] = []


# --- Skill ------------------------------------------------------------------

class SkillBase(BaseModel):
    title: str
    evidence_required: Optional[str] = None
    position_x: int = 0
    position_y: int = 0


class SkillCreate(SkillBase):
    prerequisite_ids: list[int] = []


class SkillOut(SkillBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    skill_tree_id: int
    prerequisite_ids: list[int] = []

    @staticmethod
    def from_orm_with_prereqs(skill):
        data = SkillOut.model_validate(skill)
        data.prerequisite_ids = [p.id for p in skill.prerequisites]
        return data


# --- SkillTree ----------------------------------------------------------

class SkillTreeBase(BaseModel):
    title: str
    description: Optional[str] = None


class SkillTreeCreate(SkillTreeBase):
    pass


class SkillTreeOut(SkillTreeBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    teacher_id: int
    created_at: datetime


class SkillTreeDetail(SkillTreeOut):
    skills: list[SkillOut] = []


# --- Evidence -----------------------------------------------------------

class EvidenceBase(BaseModel):
    content_text: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    link_url: Optional[str] = None


class EvidenceCreate(EvidenceBase):
    skill_id: int


class EvidenceReview(BaseModel):
    status: EvidenceStatus
    teacher_feedback: Optional[str] = None


class EvidenceOut(EvidenceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    skill_id: int
    student_id: int
    status: EvidenceStatus
    teacher_feedback: Optional[str] = None
    submitted_at: datetime
    reviewed_at: Optional[datetime] = None
    skill_title: Optional[str] = None
    skill_tree_title: Optional[str] = None
    student_name: Optional[str] = None

    @staticmethod
    def from_orm_with_names(evidence):
        data = EvidenceOut.model_validate(evidence)
        data.skill_title = evidence.skill.title if evidence.skill else None
        data.skill_tree_title = (
            evidence.skill.skill_tree.title if evidence.skill and evidence.skill.skill_tree else None
        )
        data.student_name = evidence.student.full_name if evidence.student else None
        return data


# --- Student progress -----------------------------------------------------

class StudentProgressTree(BaseModel):
    skill_tree_id: int
    skill_tree_title: str
    attained_skills: list[str]
