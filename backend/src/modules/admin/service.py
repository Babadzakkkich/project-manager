from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Optional, TYPE_CHECKING

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database.models import (
    AdminAuditLog,
    ConferenceMessage,
    ConferenceParticipant,
    ConferenceRoom,
    ConferenceRoomType,
    ConferenceStats,
    Group,
    GroupMember,
    Project,
    SystemRole,
    Task,
    TaskHistory,
    TaskPriority,
    TaskStatus,
    User,
    UserRole,
    conference_invited_users,
    task_user_association,
)
from core.logger import logger
from core.utils.livekit import livekit_token
from .exceptions import AdminActionError, AdminObjectNotFoundError, AdminPermissionError
from .schemas import (
    AdminActionResult,
    AdminAuditLogRead,
    AdminConferenceDetailRead,
    AdminConferenceGroupRelationRead,
    AdminConferenceMessageRead,
    AdminConferenceParticipantRead,
    AdminConferenceRead,
    AdminConferenceRelationRead,
    AdminConferenceStatsRead,
    AdminGroupRead,
    AdminGroupDetailRead,
    AdminGroupMemberRead,
    AdminProjectRead,
    AdminProjectDetailRead,
    AdminShortGroupRead,
    AdminShortProjectRead,
    AdminShortUserRead,
    AdminStatsRead,
    AdminTaskDetailRead,
    AdminTaskHistoryRead,
    AdminTaskRead,
    AdminShortTaskRead,
    AdminUserRead,
)

if TYPE_CHECKING:
    from core.services import ServiceFactory


class AdminService:
    def __init__(self, session: AsyncSession, service_factory: Optional["ServiceFactory"] = None):
        self.session = session
        self.service_factory = service_factory
        self.logger = logger

    async def ensure_global_admin(self, user: User) -> User:
        if not user:
            raise AdminPermissionError("Пользователь не найден")

        if user.is_blocked:
            raise AdminPermissionError("Пользователь заблокирован")

        if user.system_role != SystemRole.GLOBAL_ADMIN:
            raise AdminPermissionError("Требуются права глобального администратора")

        return user

    async def log_action(
        self,
        *,
        actor: User,
        action: str,
        target_type: str,
        target_id: Optional[int] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> AdminAuditLog:
        audit_log = AdminAuditLog(
            actor_id=actor.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details or {},
        )
        self.session.add(audit_log)
        return audit_log

    async def get_stats(self, actor: User) -> AdminStatsRead:
        await self.ensure_global_admin(actor)
        now = datetime.now(timezone.utc)

        users_total = await self.session.scalar(select(func.count(User.id))) or 0
        users_blocked = await self.session.scalar(
            select(func.count(User.id)).where(User.is_blocked.is_(True))
        ) or 0
        users_global_admins = await self.session.scalar(
            select(func.count(User.id)).where(User.system_role == SystemRole.GLOBAL_ADMIN)
        ) or 0
        groups_total = await self.session.scalar(select(func.count(Group.id))) or 0
        projects_total = await self.session.scalar(select(func.count(Project.id))) or 0
        tasks_total = await self.session.scalar(select(func.count(Task.id))) or 0
        tasks_overdue = await self.session.scalar(
            select(func.count(Task.id)).where(
                Task.deadline.is_not(None),
                Task.deadline < now,
                Task.status != TaskStatus.DONE,
                Task.status != TaskStatus.CANCELLED,
            )
        ) or 0
        active_conferences_total = await self.session.scalar(
            select(func.count(ConferenceRoom.id)).where(ConferenceRoom.is_active.is_(True))
        ) or 0
        audit_events_total = await self.session.scalar(select(func.count(AdminAuditLog.id))) or 0

        return AdminStatsRead(
            users_total=users_total,
            users_blocked=users_blocked,
            users_global_admins=users_global_admins,
            groups_total=groups_total,
            projects_total=projects_total,
            tasks_total=tasks_total,
            tasks_overdue=tasks_overdue,
            active_conferences_total=active_conferences_total,
            audit_events_total=audit_events_total,
        )

    async def get_users(
        self,
        actor: User,
        q: Optional[str] = None,
        blocked: Optional[bool] = None,
        global_admin: Optional[bool] = None,
    ) -> list[AdminUserRead]:
        await self.ensure_global_admin(actor)

        stmt = select(User).options(
            selectinload(User.group_memberships),
            selectinload(User.assigned_tasks),
        ).order_by(User.id)

        if q:
            pattern = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(
                    User.login.ilike(pattern),
                    User.email.ilike(pattern),
                    User.name.ilike(pattern),
                )
            )

        if blocked is not None:
            stmt = stmt.where(User.is_blocked.is_(blocked))

        if global_admin is not None:
            if global_admin:
                stmt = stmt.where(User.system_role == SystemRole.GLOBAL_ADMIN)
            else:
                stmt = stmt.where(User.system_role != SystemRole.GLOBAL_ADMIN)

        result = await self.session.execute(stmt)
        users = result.scalars().all()

        return [self._build_admin_user(user) for user in users]

    async def block_user(self, actor: User, user_id: int, reason: Optional[str] = None) -> AdminUserRead:
        await self.ensure_global_admin(actor)

        if actor.id == user_id:
            raise AdminActionError("Глобальный администратор не может заблокировать собственный аккаунт")

        user = await self._get_user_for_admin(user_id)

        if user.system_role == SystemRole.GLOBAL_ADMIN:
            raise AdminActionError("Нельзя заблокировать глобального администратора")

        user.is_blocked = True
        user.blocked_reason = reason

        await self.log_action(
            actor=actor,
            action="USER_BLOCKED",
            target_type="user",
            target_id=user.id,
            details={
                "login": user.login,
                "email": user.email,
                "reason": reason,
            },
        )

        await self.session.commit()
        await self.session.refresh(user)
        return self._build_admin_user(user)

    async def unblock_user(self, actor: User, user_id: int) -> AdminUserRead:
        await self.ensure_global_admin(actor)
        user = await self._get_user_for_admin(user_id)

        user.is_blocked = False
        user.blocked_reason = None

        await self.log_action(
            actor=actor,
            action="USER_UNBLOCKED",
            target_type="user",
            target_id=user.id,
            details={
                "login": user.login,
                "email": user.email,
            },
        )

        await self.session.commit()
        await self.session.refresh(user)
        return self._build_admin_user(user)

    async def make_global_admin(self, actor: User, user_id: int) -> AdminUserRead:
        await self.ensure_global_admin(actor)
        user = await self._get_user_for_admin(user_id)

        if user.is_blocked:
            raise AdminActionError("Нельзя назначить заблокированного пользователя глобальным администратором")

        if user.system_role != SystemRole.GLOBAL_ADMIN:
            user.system_role = SystemRole.GLOBAL_ADMIN

            await self.log_action(
                actor=actor,
                action="GLOBAL_ADMIN_GRANTED",
                target_type="user",
                target_id=user.id,
                details={
                    "login": user.login,
                    "email": user.email,
                },
            )

            await self.session.commit()
            await self.session.refresh(user)

        return self._build_admin_user(user)

    async def get_groups(self, actor: User, q: Optional[str] = None) -> list[AdminGroupRead]:
        await self.ensure_global_admin(actor)

        stmt = select(Group).options(
            selectinload(Group.group_members).selectinload(GroupMember.user),
            selectinload(Group.projects),
            selectinload(Group.tasks),
        ).order_by(Group.id)

        if q:
            pattern = f"%{q.strip()}%"
            stmt = stmt.where(or_(Group.name.ilike(pattern), Group.description.ilike(pattern)))

        result = await self.session.execute(stmt)
        groups = result.scalars().all()
        return [self._build_admin_group(group) for group in groups]

    async def get_group_detail(self, actor: User, group_id: int) -> AdminGroupDetailRead:
        """Read-only просмотр группы через административный контур."""
        await self.ensure_global_admin(actor)
        group = await self._get_group_for_admin(group_id)
        return self._build_admin_group_detail(group)

    async def get_projects(
        self,
        actor: User,
        q: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[AdminProjectRead]:
        await self.ensure_global_admin(actor)

        stmt = select(Project).options(
            selectinload(Project.groups),
            selectinload(Project.tasks),
        ).order_by(Project.id)

        if q:
            pattern = f"%{q.strip()}%"
            stmt = stmt.where(or_(Project.title.ilike(pattern), Project.description.ilike(pattern)))

        if status:
            stmt = stmt.where(Project.status == status)

        result = await self.session.execute(stmt)
        projects = result.scalars().all()
        return [self._build_admin_project(project) for project in projects]

    async def get_project_detail(self, actor: User, project_id: int) -> AdminProjectDetailRead:
        """Read-only просмотр проекта через административный контур."""
        await self.ensure_global_admin(actor)
        project = await self._get_project_for_admin(project_id)
        return self._build_admin_project_detail(project)

    async def get_tasks(
        self,
        actor: User,
        q: Optional[str] = None,
        status: Optional[TaskStatus] = None,
        priority: Optional[TaskPriority] = None,
        overdue: Optional[bool] = None,
    ) -> list[AdminTaskRead]:
        await self.ensure_global_admin(actor)
        now = datetime.now(timezone.utc)

        stmt = select(Task).options(
            selectinload(Task.project),
            selectinload(Task.group),
            selectinload(Task.assignees),
        ).order_by(Task.id)

        if q:
            pattern = f"%{q.strip()}%"
            stmt = stmt.where(or_(Task.title.ilike(pattern), Task.description.ilike(pattern)))

        if status:
            stmt = stmt.where(Task.status == status)

        if priority:
            stmt = stmt.where(Task.priority == priority)

        if overdue is True:
            stmt = stmt.where(
                Task.deadline.is_not(None),
                Task.deadline < now,
                Task.status != TaskStatus.DONE,
                Task.status != TaskStatus.CANCELLED,
            )
        elif overdue is False:
            stmt = stmt.where(
                or_(
                    Task.deadline.is_(None),
                    Task.deadline >= now,
                    Task.status == TaskStatus.DONE,
                    Task.status == TaskStatus.CANCELLED,
                )
            )

        result = await self.session.execute(stmt)
        tasks = result.scalars().all()
        return [self._build_admin_task(task, now) for task in tasks]

    async def get_task_detail(self, actor: User, task_id: int) -> AdminTaskDetailRead:
        """Read-only просмотр задачи через административный контур."""
        await self.ensure_global_admin(actor)
        task = await self._get_task_for_admin(task_id)
        return AdminTaskDetailRead(**self._build_admin_task(task).model_dump())

    async def get_task_history(self, actor: User, task_id: int) -> list[AdminTaskHistoryRead]:
        """Read-only просмотр истории задачи через административный контур."""
        await self.ensure_global_admin(actor)
        await self._get_task_for_admin(task_id)

        stmt = (
            select(TaskHistory)
            .options(selectinload(TaskHistory.user))
            .where(TaskHistory.task_id == task_id)
            .order_by(TaskHistory.created_at.desc(), TaskHistory.id.desc())
        )
        result = await self.session.execute(stmt)
        entries = result.scalars().all()
        return [self._build_task_history(entry) for entry in entries]

    async def emergency_delete_group(self, actor: User, group_id: int) -> None:
        await self.ensure_global_admin(actor)

        group = await self._get_group_for_admin(group_id)
        details = {
            "name": group.name,
            "description": group.description,
            "users_count": len(group.group_members),
            "projects_count": len(group.projects),
            "tasks_count": len(group.tasks),
        }

        await self.log_action(
            actor=actor,
            action="GROUP_EMERGENCY_DELETED",
            target_type="group",
            target_id=group.id,
            details=details,
        )

        if not self.service_factory:
            raise AdminActionError("ServiceFactory недоступна для аварийного удаления группы")

        group_service = self.service_factory.get("group")
        await group_service.delete_group_auto(group_id)

    async def emergency_delete_project(self, actor: User, project_id: int) -> None:
        await self.ensure_global_admin(actor)

        project = await self._get_project_for_admin(project_id)
        details = {
            "title": project.title,
            "status": project.status,
            "groups": [{"id": group.id, "name": group.name} for group in project.groups],
            "tasks_count": len(project.tasks),
        }

        await self.log_action(
            actor=actor,
            action="PROJECT_EMERGENCY_DELETED",
            target_type="project",
            target_id=project.id,
            details=details,
        )

        if not self.service_factory:
            raise AdminActionError("ServiceFactory недоступна для аварийного удаления проекта")

        project_service = self.service_factory.get("project")
        await project_service.delete_project_auto(project_id)

    async def emergency_delete_task(self, actor: User, task_id: int) -> None:
        await self.ensure_global_admin(actor)

        task = await self._get_task_for_admin(task_id)
        details = {
            "title": task.title,
            "status": task.status.value,
            "priority": task.priority.value,
            "project_id": task.project_id,
            "group_id": task.group_id,
            "assignee_ids": [user.id for user in task.assignees],
        }

        await self.log_action(
            actor=actor,
            action="TASK_EMERGENCY_DELETED",
            target_type="task",
            target_id=task.id,
            details=details,
        )

        try:
            room_stmt = select(ConferenceRoom.id).where(ConferenceRoom.task_id == task_id)
            room_result = await self.session.execute(room_stmt)
            room_ids = [row[0] for row in room_result.all()]

            if room_ids:
                await self.session.execute(delete(ConferenceStats).where(ConferenceStats.room_id.in_(room_ids)))
                await self.session.execute(
                    delete(conference_invited_users).where(conference_invited_users.c.room_id.in_(room_ids))
                )
                await self.session.execute(
                    delete(ConferenceParticipant).where(ConferenceParticipant.room_id.in_(room_ids))
                )
                await self.session.execute(delete(ConferenceMessage).where(ConferenceMessage.room_id.in_(room_ids)))
                await self.session.execute(delete(ConferenceRoom).where(ConferenceRoom.id.in_(room_ids)))

            await self.session.execute(delete(TaskHistory).where(TaskHistory.task_id == task_id))
            await self.session.execute(
                delete(task_user_association).where(task_user_association.c.task_id == task_id)
            )
            await self.session.execute(delete(Task).where(Task.id == task_id))
            await self.session.commit()
        except Exception as exc:
            await self.session.rollback()
            self.logger.error(f"Emergency task delete failed: {exc}", exc_info=True)
            raise AdminActionError(f"Не удалось аварийно удалить задачу: {exc}") from exc


    async def get_conferences(
        self,
        actor: User,
        q: Optional[str] = None,
        room_type: Optional[str] = None,
        active: Optional[bool] = None,
    ) -> list[AdminConferenceRead]:
        """Просмотр всех созвонов через административный контур."""
        await self.ensure_global_admin(actor)

        stmt = select(ConferenceRoom).options(
            selectinload(ConferenceRoom.creator),
            selectinload(ConferenceRoom.project),
            selectinload(ConferenceRoom.group),
            selectinload(ConferenceRoom.task),
            selectinload(ConferenceRoom.participants).selectinload(ConferenceParticipant.user),
            selectinload(ConferenceRoom.invited_users),
            selectinload(ConferenceRoom.messages),
            selectinload(ConferenceRoom.stats),
        ).order_by(ConferenceRoom.created_at.desc(), ConferenceRoom.id.desc())

        if q:
            pattern = f"%{q.strip()}%"
            stmt = stmt.where(or_(ConferenceRoom.title.ilike(pattern), ConferenceRoom.room_name.ilike(pattern)))

        if room_type:
            parsed_room_type = self._parse_room_type(room_type)
            stmt = stmt.where(ConferenceRoom.room_type == parsed_room_type)

        if active is not None:
            stmt = stmt.where(ConferenceRoom.is_active.is_(active))

        result = await self.session.execute(stmt)
        rooms = result.scalars().unique().all()
        return [self._build_admin_conference(room) for room in rooms]

    async def get_conference_detail(self, actor: User, room_id: int) -> AdminConferenceDetailRead:
        """Read-only просмотр созвона через административный контур."""
        await self.ensure_global_admin(actor)
        room = await self._get_conference_for_admin(room_id)
        return self._build_admin_conference_detail(room)

    async def force_end_conference(self, actor: User, room_id: int) -> AdminConferenceDetailRead:
        """Принудительное завершение активного созвона глобальным администратором."""
        await self.ensure_global_admin(actor)
        room = await self._get_conference_for_admin(room_id)

        if not room.is_active:
            return self._build_admin_conference_detail(room)

        ended_at = datetime.now(timezone.utc)
        room.is_active = False
        room.ended_at = ended_at

        for participant in room.participants:
            if participant.left_at is None:
                participant.left_at = ended_at

        duration_seconds = None
        if room.started_at:
            duration_seconds = int((ended_at - room.started_at).total_seconds())

        stats = ConferenceStats(
            room_id=room.id,
            participant_count=len(room.participants or []),
            peak_participants=len(room.participants or []),
            duration_seconds=duration_seconds,
            messages_count=len(room.messages or []),
        )
        self.session.add(stats)

        await self.log_action(
            actor=actor,
            action="CONFERENCE_FORCE_ENDED",
            target_type="conference",
            target_id=room.id,
            details={
                "title": room.title,
                "room_name": room.room_name,
                "room_type": room.room_type.value if hasattr(room.room_type, "value") else str(room.room_type),
            },
        )

        await self.session.commit()

        try:
            asyncio.create_task(self._delete_livekit_room_async(room.room_name))
        except Exception as exc:
            self.logger.warning(f"LiveKit room delete scheduling failed for {room.room_name}: {exc}")

        return await self.get_conference_detail(actor, room_id)

    async def _delete_livekit_room_async(self, room_name: str) -> None:
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, livekit_token.delete_room, room_name)
        except Exception as exc:
            self.logger.warning(f"LiveKit room delete failed for {room_name}: {exc}")

    async def get_audit_logs(
        self,
        actor: User,
        limit: int = 100,
        offset: int = 0,
        action: Optional[str] = None,
        target_type: Optional[str] = None,
    ) -> list[AdminAuditLogRead]:
        await self.ensure_global_admin(actor)

        safe_limit = min(max(limit, 1), 500)
        safe_offset = max(offset, 0)

        stmt = select(AdminAuditLog).options(
            selectinload(AdminAuditLog.actor)
        ).order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())

        if action:
            stmt = stmt.where(AdminAuditLog.action == action)

        if target_type:
            stmt = stmt.where(AdminAuditLog.target_type == target_type)

        stmt = stmt.limit(safe_limit).offset(safe_offset)
        result = await self.session.execute(stmt)
        logs = result.scalars().all()
        return [self._build_audit_log(log) for log in logs]


    async def _get_conference_for_admin(self, room_id: int) -> ConferenceRoom:
        stmt = select(ConferenceRoom).options(
            selectinload(ConferenceRoom.creator),
            selectinload(ConferenceRoom.project),
            selectinload(ConferenceRoom.group),
            selectinload(ConferenceRoom.task),
            selectinload(ConferenceRoom.participants).selectinload(ConferenceParticipant.user),
            selectinload(ConferenceRoom.invited_users),
            selectinload(ConferenceRoom.messages).selectinload(ConferenceMessage.user),
            selectinload(ConferenceRoom.stats),
        ).where(ConferenceRoom.id == room_id)

        result = await self.session.execute(stmt)
        room = result.scalar_one_or_none()

        if not room:
            raise AdminObjectNotFoundError("Созвон не найден")

        return room

    def _parse_room_type(self, value: str) -> ConferenceRoomType:
        normalized = str(value).strip().lower()

        for room_type in ConferenceRoomType:
            if room_type.value == normalized or room_type.name.lower() == normalized:
                return room_type

        raise AdminActionError(f"Недопустимый тип созвона: {value}")

    async def _get_user_for_admin(self, user_id: int) -> User:
        stmt = select(User).options(
            selectinload(User.group_memberships),
            selectinload(User.assigned_tasks),
        ).where(User.id == user_id)
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            raise AdminObjectNotFoundError("Пользователь не найден")
        return user

    async def _get_group_for_admin(self, group_id: int) -> Group:
        stmt = select(Group).options(
            selectinload(Group.group_members).selectinload(GroupMember.user),
            selectinload(Group.projects),
            selectinload(Group.tasks),
        ).where(Group.id == group_id)
        result = await self.session.execute(stmt)
        group = result.scalar_one_or_none()
        if not group:
            raise AdminObjectNotFoundError("Группа не найдена")
        return group

    async def _get_project_for_admin(self, project_id: int) -> Project:
        stmt = select(Project).options(
            selectinload(Project.groups).selectinload(Group.group_members).selectinload(GroupMember.user),
            selectinload(Project.groups).selectinload(Group.projects),
            selectinload(Project.groups).selectinload(Group.tasks),
            selectinload(Project.tasks),
        ).where(Project.id == project_id)
        result = await self.session.execute(stmt)
        project = result.scalar_one_or_none()
        if not project:
            raise AdminObjectNotFoundError("Проект не найден")
        return project

    async def _get_task_for_admin(self, task_id: int) -> Task:
        stmt = select(Task).options(
            selectinload(Task.project),
            selectinload(Task.group),
            selectinload(Task.assignees),
        ).where(Task.id == task_id)
        result = await self.session.execute(stmt)
        task = result.scalar_one_or_none()
        if not task:
            raise AdminObjectNotFoundError("Задача не найдена")
        return task

    def _build_short_user(self, user: User) -> AdminShortUserRead:
        return AdminShortUserRead(
            id=user.id,
            login=user.login,
            email=user.email,
            name=user.name,
            system_role=user.system_role,
            is_blocked=user.is_blocked,
        )

    def _build_admin_user(self, user: User) -> AdminUserRead:
        return AdminUserRead(
            id=user.id,
            login=user.login,
            email=user.email,
            name=user.name,
            system_role=user.system_role,
            is_blocked=user.is_blocked,
            blocked_reason=user.blocked_reason,
            created_at=user.created_at,
            updated_at=user.updated_at,
            groups_count=len(user.group_memberships or []),
            assigned_tasks_count=len(user.assigned_tasks or []),
        )

    def _build_short_group(self, group: Group) -> AdminShortGroupRead:
        return AdminShortGroupRead(
            id=group.id,
            name=group.name,
            description=group.description,
        )

    def _build_admin_group(self, group: Group) -> AdminGroupRead:
        admins = [
            self._build_short_user(member.user)
            for member in group.group_members
            if member.role == UserRole.ADMIN and member.user is not None
        ]

        return AdminGroupRead(
            id=group.id,
            name=group.name,
            description=group.description,
            created_at=group.created_at,
            users_count=len(group.group_members or []),
            projects_count=len(group.projects or []),
            tasks_count=len(group.tasks or []),
            admins=admins,
        )

    def _build_admin_group_member(self, member: GroupMember) -> AdminGroupMemberRead:
        user = member.user
        return AdminGroupMemberRead(
            id=user.id,
            login=user.login,
            email=user.email,
            name=user.name,
            system_role=user.system_role,
            is_blocked=user.is_blocked,
            role=member.role.value if hasattr(member.role, "value") else str(member.role),
            joined_at=member.joined_at,
        )

    def _build_short_task(self, task: Task, now: Optional[datetime] = None) -> AdminShortTaskRead:
        now = now or datetime.now(timezone.utc)
        is_overdue = bool(
            task.deadline
            and task.deadline < now
            and task.status not in {TaskStatus.DONE, TaskStatus.CANCELLED}
        )

        return AdminShortTaskRead(
            id=task.id,
            title=task.title,
            status=task.status,
            priority=task.priority,
            deadline=task.deadline,
            project_id=task.project_id,
            group_id=task.group_id,
            is_overdue=is_overdue,
        )

    def _build_admin_group_detail(self, group: Group) -> AdminGroupDetailRead:
        now = datetime.now(timezone.utc)
        return AdminGroupDetailRead(
            id=group.id,
            name=group.name,
            description=group.description,
            created_at=group.created_at,
            users_count=len(group.group_members or []),
            projects_count=len(group.projects or []),
            tasks_count=len(group.tasks or []),
            users=[self._build_admin_group_member(member) for member in group.group_members if member.user],
            projects=[self._build_short_project(project) for project in group.projects],
            tasks=[self._build_short_task(task, now) for task in group.tasks],
        )

    def _build_short_project(self, project: Project) -> AdminShortProjectRead:
        return AdminShortProjectRead(
            id=project.id,
            title=project.title,
            status=project.status,
        )

    def _build_admin_project(self, project: Project) -> AdminProjectRead:
        return AdminProjectRead(
            id=project.id,
            title=project.title,
            description=project.description,
            status=project.status,
            start_date=project.start_date,
            end_date=project.end_date,
            groups=[self._build_short_group(group) for group in project.groups],
            tasks_count=len(project.tasks or []),
        )

    def _build_admin_project_detail(self, project: Project) -> AdminProjectDetailRead:
        now = datetime.now(timezone.utc)
        return AdminProjectDetailRead(
            id=project.id,
            title=project.title,
            description=project.description,
            status=project.status,
            start_date=project.start_date,
            end_date=project.end_date,
            groups=[self._build_admin_group(group) for group in project.groups],
            tasks=[self._build_short_task(task, now) for task in project.tasks],
        )

    def _build_admin_task(self, task: Task, now: Optional[datetime] = None) -> AdminTaskRead:
        now = now or datetime.now(timezone.utc)
        is_overdue = bool(
            task.deadline
            and task.deadline < now
            and task.status not in {TaskStatus.DONE, TaskStatus.CANCELLED}
        )

        return AdminTaskRead(
            id=task.id,
            title=task.title,
            description=task.description,
            status=task.status,
            priority=task.priority,
            position=task.position,
            created_at=task.created_at,
            start_date=task.start_date,
            deadline=task.deadline,
            project=self._build_short_project(task.project) if task.project else None,
            group=self._build_short_group(task.group) if task.group else None,
            assignees=[self._build_short_user(user) for user in task.assignees],
            tags=task.tags or [],
            is_overdue=is_overdue,
        )

    def _build_task_history(self, history: TaskHistory) -> AdminTaskHistoryRead:
        return AdminTaskHistoryRead(
            id=history.id,
            task_id=history.task_id,
            user=self._build_short_user(history.user) if history.user else None,
            user_id=history.user_id,
            action=history.action,
            old_value=history.old_value,
            new_value=history.new_value,
            details=history.details,
            created_at=history.created_at,
        )


    def _build_conference_relation(self, entity: Any, label_field: str = "title") -> Optional[AdminConferenceRelationRead]:
        if not entity:
            return None
        return AdminConferenceRelationRead(id=entity.id, title=getattr(entity, label_field))

    def _build_conference_group_relation(self, group: Optional[Group]) -> Optional[AdminConferenceGroupRelationRead]:
        if not group:
            return None
        return AdminConferenceGroupRelationRead(id=group.id, name=group.name)

    def _build_conference_stats(self, stats: ConferenceStats) -> AdminConferenceStatsRead:
        return AdminConferenceStatsRead(
            id=stats.id,
            room_id=stats.room_id,
            participant_count=stats.participant_count,
            peak_participants=stats.peak_participants,
            duration_seconds=stats.duration_seconds,
            messages_count=stats.messages_count,
            created_at=stats.created_at,
        )

    def _build_conference_participant(self, participant: ConferenceParticipant) -> AdminConferenceParticipantRead:
        return AdminConferenceParticipantRead(
            id=participant.id,
            user=self._build_short_user(participant.user) if participant.user else None,
            user_id=participant.user_id,
            joined_at=participant.joined_at,
            left_at=participant.left_at,
            is_speaking=participant.is_speaking,
            is_video_on=participant.is_video_on,
            is_audio_on=participant.is_audio_on,
            participant_sid=participant.participant_sid,
            is_active=participant.left_at is None,
        )

    def _build_conference_message(self, message: ConferenceMessage) -> AdminConferenceMessageRead:
        return AdminConferenceMessageRead(
            id=message.id,
            user=self._build_short_user(message.user) if message.user else None,
            user_id=message.user_id,
            message=message.message,
            created_at=message.created_at,
        )

    def _build_admin_conference(self, room: ConferenceRoom) -> AdminConferenceRead:
        participants = list(room.participants or [])
        messages = list(room.messages or [])
        stats = sorted(list(room.stats or []), key=lambda item: item.created_at, reverse=True)
        active_participants_count = sum(1 for participant in participants if participant.left_at is None)

        return AdminConferenceRead(
            id=room.id,
            room_name=room.room_name,
            title=room.title,
            room_type=room.room_type,
            is_active=room.is_active,
            max_participants=room.max_participants,
            created_at=room.created_at,
            started_at=room.started_at,
            ended_at=room.ended_at,
            creator=self._build_short_user(room.creator) if room.creator else None,
            created_by=room.created_by,
            project=self._build_conference_relation(room.project, "title"),
            group=self._build_conference_group_relation(room.group),
            task=self._build_conference_relation(room.task, "title"),
            participants_count=len(participants),
            active_participants_count=active_participants_count,
            invited_users_count=len(room.invited_users or []),
            messages_count=len(messages),
            latest_stats=self._build_conference_stats(stats[0]) if stats else None,
        )

    def _build_admin_conference_detail(self, room: ConferenceRoom) -> AdminConferenceDetailRead:
        base = self._build_admin_conference(room).model_dump()
        participants = sorted(list(room.participants or []), key=lambda item: item.joined_at, reverse=True)
        messages = sorted(list(room.messages or []), key=lambda item: item.created_at, reverse=True)
        stats = sorted(list(room.stats or []), key=lambda item: item.created_at, reverse=True)

        return AdminConferenceDetailRead(
            **base,
            participants=[self._build_conference_participant(participant) for participant in participants],
            invited_users=[self._build_short_user(user) for user in room.invited_users or []],
            messages=[self._build_conference_message(message) for message in messages],
            stats=[self._build_conference_stats(item) for item in stats],
        )

    def _build_audit_log(self, audit_log: AdminAuditLog) -> AdminAuditLogRead:
        return AdminAuditLogRead(
            id=audit_log.id,
            actor=self._build_short_user(audit_log.actor) if audit_log.actor else None,
            actor_id=audit_log.actor_id,
            action=audit_log.action,
            target_type=audit_log.target_type,
            target_id=audit_log.target_id,
            details=audit_log.details,
            created_at=audit_log.created_at,
        )