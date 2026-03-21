from typing import AsyncGenerator
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from core.database.session import db_session
from core.database.models import GroupMember, Project, UserRole
from core.services import ServiceFactory
from modules.groups.exceptions import InsufficientPermissionsError, UserNotInGroupError

async def get_service_factory(
    session: AsyncSession = Depends(db_session.session_getter)
) -> AsyncGenerator[ServiceFactory, None]:
    """
    Получение фабрики сервисов.
    Фабрика автоматически очищается после завершения запроса.
    """
    factory = ServiceFactory(session)
    
    # Регистрируем сервисы в фабрике
    from modules.groups.service import GroupService
    from modules.projects.service import ProjectService
    from modules.tasks.service import TaskService
    from modules.users.service import UserService
    
    factory.register('group', lambda s, f: GroupService(s, f))
    factory.register('project', lambda s, f: ProjectService(s, f))
    factory.register('task', lambda s, f: TaskService(s, f))
    factory.register('user', lambda s, f: UserService(s, f))
    
    try:
        yield factory
    finally:
        factory.clear()

# Получить роль пользователя в группе
async def get_user_group_role(session: AsyncSession, user_id: int, group_id: int) -> UserRole | None:
    stmt = select(GroupMember.role).where(
        GroupMember.user_id == user_id,
        GroupMember.group_id == group_id
    )
    result = await session.execute(stmt)
    group_member = result.scalar_one_or_none()
    return group_member

# Получить запись GroupMember для пользователя в группе
async def get_group_member(session: AsyncSession, user_id: int, group_id: int) -> GroupMember | None:
    stmt = select(GroupMember).where(
        GroupMember.user_id == user_id,
        GroupMember.group_id == group_id
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()

# Проверить, состоит ли пользователь в группе
async def check_user_in_group(session: AsyncSession, user_id: int, group_id: int) -> bool:
    group_member = await get_group_member(session, user_id, group_id)
    return group_member is not None

# Проверить, состоит ли пользователь в одной из групп проекта
async def check_user_in_project(session: AsyncSession, user_id: int, project_id: int) -> bool:
    stmt = select(Project).options(selectinload(Project.groups)).where(Project.id == project_id)
    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    
    if not project:
        return False
    
    for group in project.groups:
        if await check_user_in_group(session, user_id, group.id):
            return True
    
    return False

# Убедиться, что пользователь является администратором группы
async def ensure_user_is_admin(session: AsyncSession, user_id: int, group_id: int):
    group_member = await get_group_member(session, user_id, group_id)
    
    if not group_member:
        raise UserNotInGroupError(user_id=user_id, group_id=group_id)
    
    if group_member.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise InsufficientPermissionsError("Требуются права администратора")

# Убедиться, что пользователь является супер-администратором группы
async def ensure_user_is_super_admin(session: AsyncSession, user_id: int, group_id: int):
    group_member = await get_group_member(session, user_id, group_id)
    
    if not group_member:
        raise UserNotInGroupError(user_id=user_id, group_id=group_id)
    
    if group_member.role != UserRole.SUPER_ADMIN:
        raise InsufficientPermissionsError("Требуются права супер-администратора")

# Убедиться, что пользователь является супер-администратором в любой группе
async def ensure_user_is_super_admin_global(session: AsyncSession, user_id: int):
    stmt = select(GroupMember).where(
        GroupMember.user_id == user_id,
        GroupMember.role == UserRole.SUPER_ADMIN
    )
    result = await session.execute(stmt)
    super_admin_membership = result.scalar_one_or_none()
    
    if not super_admin_membership:
        raise InsufficientPermissionsError("Требуются права супер-администратора")

# Проверить, состоят ли два пользователя в одной группе
async def check_users_in_same_group(session: AsyncSession, user1_id: int, user2_id: int) -> bool:
    stmt = select(GroupMember).where(
        GroupMember.user_id == user1_id
    )
    result = await session.execute(stmt)
    user1_groups = {gm.group_id for gm in result.scalars().all()}
    
    stmt = select(GroupMember).where(
        GroupMember.user_id == user2_id,
        GroupMember.group_id.in_(user1_groups)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none() is not None

# Получить все группы, в которых состоит пользователь
async def get_user_groups(session: AsyncSession, user_id: int) -> list[GroupMember]:
    stmt = select(GroupMember).where(
        GroupMember.user_id == user_id
    )
    result = await session.execute(stmt)
    return result.scalars().all()

# Получить всех участников группы
async def get_group_members(session: AsyncSession, group_id: int) -> list[GroupMember]:
    stmt = select(GroupMember).where(
        GroupMember.group_id == group_id
    )
    result = await session.execute(stmt)
    return result.scalars().all()