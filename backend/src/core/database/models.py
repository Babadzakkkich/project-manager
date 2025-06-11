# core/database/models.py

from datetime import datetime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import Column, ForeignKey, String, DateTime, Table, Text, func, Integer
from typing import List, Optional

class Base(DeclarativeBase):
    __abstract__ = True

    id: Mapped[int] = mapped_column(primary_key=True)


# === Ассоциативные таблицы ===

group_user_association = Table(
    "group_user_association",
    Base.metadata,
    Column("group_id", Integer, ForeignKey("groups.id"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
)

task_user_association = Table(
    "task_user_association",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
)

project_group_association = Table(
    "project_group_association",
    Base.metadata,
    Column("project_id", Integer, ForeignKey("projects.id"), primary_key=True),
    Column("group_id", Integer, ForeignKey("groups.id"), primary_key=True),
)


# === Модели ===

class User(Base):
    __tablename__ = "users"

    login: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        default=func.now()
    )

    groups: Mapped[List["Group"]] = relationship(
        "Group", secondary=group_user_association, back_populates="users", 
    )
    assigned_tasks: Mapped[List["Task"]] = relationship(
        "Task", secondary=task_user_association, back_populates="assignees", 
    )


class Group(Base):
    __tablename__ = "groups"

    name: Mapped[str] = mapped_column(String, unique=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    users: Mapped[List["User"]] = relationship(
        "User", secondary=group_user_association, back_populates="groups", 
    )
    projects: Mapped[List["Project"]] = relationship(
        "Project", 
        secondary=project_group_association, 
        back_populates="groups",
        
    )


class Project(Base):
    __tablename__ = "projects"

    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    start_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=True
    )
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String)

    # Теперь проект может быть связан с несколькими группами
    groups: Mapped[List["Group"]] = relationship(
        "Group", 
        secondary=project_group_association, 
        back_populates="projects",
        
    )
    tasks: Mapped[List["Task"]] = relationship("Task", back_populates="project", )


class Task(Base):
    __tablename__ = "tasks"

    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    
    project: Mapped["Project"] = relationship("Project", back_populates="tasks", )
    assignees: Mapped[List["User"]] = relationship(
        "User", secondary=task_user_association, back_populates="assigned_tasks", 
    )