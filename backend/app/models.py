"""
Core data model.

Entities:
- User: a teacher or student
- Group: a class/cohort of students, owned by a teacher
- SkillTree: a collection of skills, created by a teacher, assignable to groups/students
- Skill: a node in a skill tree, can depend on other skills as prerequisites
- Evidence: a student's submission proving they've achieved a skill
"""
import enum
import datetime

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Enum, Table
)
from sqlalchemy.orm import relationship

from .database import Base


class UserRole(str, enum.Enum):
    teacher = "teacher"
    student = "student"


class EvidenceStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


# --- Association tables (many-to-many) -------------------------------------

group_students = Table(
    "group_students",
    Base.metadata,
    Column("group_id", Integer, ForeignKey("groups.id"), primary_key=True),
    Column("student_id", Integer, ForeignKey("users.id"), primary_key=True),
)

skilltree_groups = Table(
    "skilltree_groups",
    Base.metadata,
    Column("skilltree_id", Integer, ForeignKey("skill_trees.id"), primary_key=True),
    Column("group_id", Integer, ForeignKey("groups.id"), primary_key=True),
)

skilltree_students = Table(
    "skilltree_students",
    Base.metadata,
    Column("skilltree_id", Integer, ForeignKey("skill_trees.id"), primary_key=True),
    Column("student_id", Integer, ForeignKey("users.id"), primary_key=True),
)

# Self-referential many-to-many: a skill can require multiple prerequisite skills
skill_prerequisites = Table(
    "skill_prerequisites",
    Base.metadata,
    Column("skill_id", Integer, ForeignKey("skills.id"), primary_key=True),
    Column("prerequisite_id", Integer, ForeignKey("skills.id"), primary_key=True),
)


# --- Core tables -------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Groups this user teaches (if teacher)
    groups_taught = relationship("Group", back_populates="teacher")

    # Groups this user belongs to (if student)
    groups = relationship("Group", secondary=group_students, back_populates="students")

    # Skill trees this user created (if teacher)
    skill_trees_created = relationship("SkillTree", back_populates="teacher")

    # Skill trees individually assigned (if student)
    assigned_skill_trees = relationship(
        "SkillTree", secondary=skilltree_students, back_populates="assigned_students"
    )

    evidence_submissions = relationship("Evidence", back_populates="student")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    teacher = relationship("User", back_populates="groups_taught")
    students = relationship("User", secondary=group_students, back_populates="groups")
    skill_trees = relationship(
        "SkillTree", secondary=skilltree_groups, back_populates="assigned_groups"
    )


class SkillTree(Base):
    __tablename__ = "skill_trees"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    teacher = relationship("User", back_populates="skill_trees_created")
    skills = relationship("Skill", back_populates="skill_tree", cascade="all, delete-orphan")

    assigned_groups = relationship(
        "Group", secondary=skilltree_groups, back_populates="skill_trees"
    )
    assigned_students = relationship(
        "User", secondary=skilltree_students, back_populates="assigned_skill_trees"
    )


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)
    skill_tree_id = Column(Integer, ForeignKey("skill_trees.id"), nullable=False)
    title = Column(String, nullable=False)
    evidence_required = Column(Text, nullable=True)
    # Optional layout hints for rendering the tree visually
    position_x = Column(Integer, default=0)
    position_y = Column(Integer, default=0)

    skill_tree = relationship("SkillTree", back_populates="skills")

    # Skills that must be completed before this one
    prerequisites = relationship(
        "Skill",
        secondary=skill_prerequisites,
        primaryjoin=id == skill_prerequisites.c.skill_id,
        secondaryjoin=id == skill_prerequisites.c.prerequisite_id,
        backref="unlocks",
    )

    evidence_submissions = relationship("Evidence", back_populates="skill")


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(Integer, primary_key=True, index=True)
    skill_id = Column(Integer, ForeignKey("skills.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    content_text = Column(Text, nullable=True)   # written explanation / notes
    file_url = Column(String, nullable=True)     # link to uploaded file, if any
    file_name = Column(String, nullable=True)    # original filename the student uploaded
    link_url = Column(String, nullable=True)     # external link (e.g. video, doc)

    status = Column(Enum(EvidenceStatus), default=EvidenceStatus.pending, nullable=False)
    teacher_feedback = Column(Text, nullable=True)

    submitted_at = Column(DateTime, default=datetime.datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)

    skill = relationship("Skill", back_populates="evidence_submissions")
    student = relationship("User", back_populates="evidence_submissions")
