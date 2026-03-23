from datetime import datetime, timezone
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import JSON, Boolean, Column, ForeignKey, String, DateTime, Table, Text, func, Integer, Enum, UniqueConstraint
from sqlalchemy import Enum as SQLEnum
from typing import Any, Dict, List, Optional
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

class NotificationType(enum.Enum):
    # Групповые уведомления
    GROUP_CREATED = "group_created"
    GROUP_UPDATED = "group_updated"
    GROUP_DELETED = "group_deleted"
    USER_ADDED_TO_GROUP = "user_added_to_group"
    USER_REMOVED_FROM_GROUP = "user_removed_from_group"
    USER_ROLE_CHANGED = "user_role_changed"
    
    # Проектные уведомления
    PROJECT_CREATED = "project_created"
    PROJECT_UPDATED = "project_updated"
    PROJECT_DELETED = "project_deleted"
    GROUP_ADDED_TO_PROJECT = "group_added_to_project"
    GROUP_REMOVED_FROM_PROJECT = "group_removed_from_project"
    
    # Задачные уведомления
    TASK_CREATED = "task_created"
    TASK_UPDATED = "task_updated"
    TASK_DELETED = "task_deleted"
    TASK_STATUS_CHANGED = "task_status_changed"
    TASK_PRIORITY_CHANGED = "task_priority_changed"
    USER_ASSIGNED_TO_TASK = "user_assigned_to_task"
    USER_UNASSIGNED_FROM_TASK = "user_unassigned_from_task"
    TASK_DEADLINE_APPROACHING = "task_deadline_approaching"
    TASK_OVERDUE = "task_overdue"
    
    # Приглашения
    GROUP_INVITATION = "group_invitation"
    GROUP_INVITATION_ACCEPTED = "group_invitation_accepted"
    GROUP_INVITATION_DECLINED = "group_invitation_declined"

class NotificationPriority(enum.Enum):
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


class GroupInvitation(Base):
    """Модель приглашения в группу"""
    __tablename__ = "group_invitations"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"))
    invited_email: Mapped[str] = mapped_column(String(255))
    invited_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.MEMBER)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, accepted, declined, expired
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(),
        onupdate=func.now()
    )
    
    # Связи
    group: Mapped["Group"] = relationship("Group", back_populates="invitations")
    invited_by: Mapped["User"] = relationship("User", foreign_keys=[invited_by_id], back_populates="sent_invitations")


class Notification(Base):
    __tablename__ = "notifications"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[NotificationType] = mapped_column(SQLEnum(NotificationType))
    priority: Mapped[NotificationPriority] = mapped_column(SQLEnum(NotificationPriority), default=NotificationPriority.MEDIUM)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(String(500))
    
    # Дополнительные данные в JSON
    data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc)
    )
    
    # Связи
    user: Mapped["User"] = relationship("User", back_populates="notifications")


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
        "GroupMember", back_populates="user", cascade="all, delete-orphan"
    )
    
    assigned_tasks: Mapped[List["Task"]] = relationship(
        "Task", secondary=task_user_association, back_populates="assignees"
    )
    
    notifications: Mapped[List["Notification"]] = relationship(
        "Notification", 
        back_populates="user",
        cascade="all, delete-orphan"
    )
    
    sent_invitations: Mapped[List["GroupInvitation"]] = relationship(
        "GroupInvitation", foreign_keys=[GroupInvitation.invited_by_id], back_populates="invited_by", cascade="all, delete-orphan"
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
        "GroupMember", back_populates="group", cascade="all, delete-orphan"
    )
    
    projects: Mapped[List["Project"]] = relationship(
        "Project", 
        secondary=project_group_association, 
        back_populates="groups",
    )
    tasks: Mapped[List["Task"]] = relationship(
        "Task", 
        back_populates="group",
        cascade="all, delete-orphan"
    )
    
    invitations: Mapped[List["GroupInvitation"]] = relationship(
        "GroupInvitation", back_populates="group", cascade="all, delete-orphan"
    )


class GroupMember(Base):
    __tablename__ = "group_members"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"))
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
        server_default=func.now(), 
        nullable=True
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
        back_populates="project",
        cascade="all, delete-orphan"
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
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    project: Mapped["Project"] = relationship("Project", back_populates="tasks")
    
    assignees: Mapped[List["User"]] = relationship(
        "User", secondary=task_user_association, back_populates="assigned_tasks"
    )
    group_id: Mapped[Optional[int]] = mapped_column(ForeignKey("groups.id", ondelete="SET NULL"))
    group: Mapped["Group"] = relationship("Group", back_populates="tasks")
    
    tags: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=True)


class TaskHistory(Base):
    __tablename__ = "task_history"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    
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
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(default=False)
    
    user: Mapped["User"] = relationship("User")