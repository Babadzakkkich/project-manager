from datetime import datetime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, String, DateTime, Text, func

class Base(DeclarativeBase):
    __abstract__ = True
    
    id: Mapped[int] = mapped_column(primary_key=True)
    
class User(Base):
    __tablename__ = "users"
    
    login: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now()
    )

    groups: Mapped[list["Group"]] = relationship(
        "Group", secondary="group_user_association", back_populates="users"
    )
    assigned_tasks: Mapped[list["Task"]] = relationship(
        "Task", secondary="task_user_association", back_populates="assignees"
    )

class Group(Base):
    __tablename__ = "groups"
    
    name: Mapped[str] = mapped_column(String, unique=True)
    description: Mapped[str] = mapped_column(String, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, 
        server_default=func.now()
    )

    users: Mapped[list["User"]] = relationship(
        "User", secondary="group_user_association", back_populates="groups"
    )
    projects: Mapped[list["Project"]] = relationship(
        "Project", back_populates="group"
    )
    
class Project(Base):
    __tablename__ = "projects"
    
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, nullable=True)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String)

    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    group: Mapped["Group"] = relationship("Group", back_populates="projects")
    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="project")
    
class Task(Base):
    __tablename__ = "tasks"
    
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, 
        server_default=func.now()
    )
    deadline: Mapped[DateTime] = mapped_column(DateTime(timezone=True))
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    project: Mapped["Project"] = relationship("Project", back_populates="tasks")
    assignees: Mapped[list["User"]] = relationship(
        "User", secondary="task_user_association", back_populates="assigned_tasks"
    )