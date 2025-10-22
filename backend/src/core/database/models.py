from datetime import datetime, timezone
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import JSON, Column, ForeignKey, String, DateTime, Table, Text, func, Integer, Enum, UniqueConstraint
from typing import List, Optional
import enum

class Base(DeclarativeBase):
    __abstract__ = True

class UserRole(enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MEMBER = "member"

class TaskStatus(enum.Enum):
    BACKLOG = "backlog"
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    DONE = "done"
    CANCELLED = "cancelled"

class TaskPriority(enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

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

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    login: Mapped[str] = mapped_column(String, unique=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc)
    )

    group_memberships: Mapped[List["GroupMember"]] = relationship(
        "GroupMember", back_populates="user"
    )
    
    assigned_tasks: Mapped[List["Task"]] = relationship(
        "Task", secondary=task_user_association, back_populates="assignees"
    )

class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )

    group_members: Mapped[List["GroupMember"]] = relationship(
        "GroupMember", back_populates="group"
    )
    
    projects: Mapped[List["Project"]] = relationship(
        "Project", 
        secondary=project_group_association, 
        back_populates="groups",
    )
    tasks: Mapped[List["Task"]] = relationship(
        "Task", 
        back_populates="group"
    )

class GroupMember(Base):
    __tablename__ = "group_members"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.MEMBER)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )
    __table_args__ = (
        UniqueConstraint('user_id', 'group_id', name='uq_user_group'),
    )
    
    user: Mapped["User"] = relationship("User", back_populates="group_memberships")
    group: Mapped["Group"] = relationship("Group", back_populates="group_members")

class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    start_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String)

    groups: Mapped[List["Group"]] = relationship(
        "Group", 
        secondary=project_group_association, 
        back_populates="projects",
    )
    tasks: Mapped[List["Task"]] = relationship(
        "Task", 
        back_populates="project"
    )

class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus), 
        default=TaskStatus.BACKLOG
    )
    priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority), 
        default=TaskPriority.MEDIUM
    )
    
    position: Mapped[int] = mapped_column(default=0)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    project: Mapped["Project"] = relationship("Project", back_populates="tasks")
    
    assignees: Mapped[List["User"]] = relationship(
        "User", secondary=task_user_association, back_populates="assigned_tasks"
    )
    group_id: Mapped[Optional[int]] = mapped_column(ForeignKey("groups.id"))
    group: Mapped["Group"] = relationship(back_populates="tasks")
    
    tags: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=True)

class TaskHistory(Base):
    __tablename__ = "task_history"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    
    action: Mapped[str] = mapped_column(String)
    old_value: Mapped[str | None] = mapped_column(String, nullable=True)
    new_value: Mapped[str | None] = mapped_column(String, nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )
    
    task: Mapped["Task"] = relationship("Task")
    user: Mapped["User"] = relationship("User")

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    token_hash: Mapped[str] = mapped_column(String, unique=True, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(default=False)
    
    user: Mapped["User"] = relationship("User")