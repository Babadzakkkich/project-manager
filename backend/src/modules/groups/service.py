from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from core.database.models import Group, Project, Task, User, group_user_association
from core.security.dependencies import ensure_user_is_admin, get_user_group_role
from .schemas import AddUsersToGroup, GetUserRoleResponse, RemoveUsersFromGroup, GroupCreate, GroupRead, GroupReadWithRelations, GroupUpdate

async def get_all_groups(session: AsyncSession) -> list[GroupRead]:
    stmt = select(Group).order_by(Group.id)
    result = await session.scalars(stmt)
    return result.all()

async def get_group_by_id(session: AsyncSession, group_id: int) -> GroupReadWithRelations | None:
    stmt = select(Group).options(
        selectinload(Group.users),
        selectinload(Group.projects),
        selectinload(Group.tasks)
    ).where(Group.id == group_id)

    result = await session.execute(stmt)
    return result.scalar_one_or_none()

async def get_role_for_user_in_group(
    session: AsyncSession,
    current_user_id: int,
    group_id: int
) -> GetUserRoleResponse:
    role = await get_user_group_role(session, current_user_id, group_id)
    if role is None:
        raise HTTPException(status_code=403, detail="Пользователь не состоит в группе")
    
    return GetUserRoleResponse(role=role)

async def create_group(
    session: AsyncSession,
    group_create: GroupCreate,
    current_user: User
) -> GroupReadWithRelations:
    new_group = Group(**group_create.model_dump())
    session.add(new_group)
    
    await session.flush()
    
    await session.execute(
        group_user_association.insert().values(
            group_id=new_group.id,
            user_id=current_user.id,
            role="admin"
        )
    )

    await session.commit()
    await session.refresh(new_group)

    stmt = select(Group).options(
        selectinload(Group.users),
        selectinload(Group.projects),
        selectinload(Group.tasks)
    ).where(Group.id == new_group.id)

    result = await session.execute(stmt)
    return result.scalar_one()

async def add_users_to_group(
    session: AsyncSession,
    group_id: int,
    data: AddUsersToGroup,
    current_user: User
) -> GroupReadWithRelations:
    stmt = select(Group).options(
        selectinload(Group.users),
        selectinload(Group.projects).selectinload(Project.tasks).selectinload(Task.assignees),
        selectinload(Group.tasks)
    ).where(Group.id == group_id)

    result = await session.execute(stmt)
    group = result.scalar_one_or_none()

    if not group:
        raise ValueError("Группа не найдена")

    await ensure_user_is_admin(session, current_user.id, group.id)

    user_ids = [user_with_role.user_id for user_with_role in data.users]
    
    users_stmt = select(User).where(User.id.in_(user_ids))
    users_result = await session.execute(users_stmt)
    users = users_result.scalars().all()

    if len(users) != len(user_ids):
        found_ids = {u.id for u in users}
        missing_ids = set(user_ids) - found_ids
        raise ValueError(f"Пользователи {missing_ids} не найдены")

    for user_with_role in data.users:
        user_id = user_with_role.user_id
        role = user_with_role.role

        existing_entry = await session.execute(
            select(group_user_association.c.user_id)
            .where(
                group_user_association.c.user_id == user_id,
                group_user_association.c.group_id == group.id
            )
        )
        existing_user_id = existing_entry.scalar_one_or_none()

        if not existing_user_id:
            await session.execute(
                group_user_association.insert().values(
                    user_id=user_id,
                    group_id=group.id,
                    role=role
                )
            )
    await session.commit()
    await session.refresh(group)
    return group

async def change_user_role(
    session: AsyncSession,
    current_user_id: int,
    group_id: int,
    user_id: int,
    new_role: str
):
    await ensure_user_is_admin(session, current_user_id, group_id)

    stmt = (
        group_user_association.update()
        .where(
            group_user_association.c.user_id == user_id,
            group_user_association.c.group_id == group_id
        )
        .values(role=new_role)
    )
    result = await session.execute(stmt)
    await session.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Пользователь не найден в группе")
    
    return {"detail": "Роль успешно обновлена"}

async def update_group(
    session: AsyncSession,
    db_group: Group,
    group_update: GroupUpdate,
    current_user: User
) -> GroupRead:
    await ensure_user_is_admin(session, current_user.id, db_group.id)
    for key, value in group_update.model_dump(exclude_unset=True).items():
        setattr(db_group, key, value)

    await session.commit()
    await session.refresh(db_group)
    return db_group

async def remove_users_from_group(
    session: AsyncSession,
    group_id: int,
    data: RemoveUsersFromGroup,
    current_user: User
) -> GroupReadWithRelations:
    
    stmt = select(Group).options(
        selectinload(Group.users),
        selectinload(Group.projects).selectinload(Project.tasks).selectinload(Task.assignees),
        selectinload(Group.tasks)
    ).where(Group.id == group_id)

    result = await session.execute(stmt)
    group = result.scalar_one_or_none()

    if not group:
        raise ValueError("Группа не найдена")

    await ensure_user_is_admin(session, current_user.id, group.id)

    users_to_remove = [u for u in group.users if u.id in data.user_ids]
    if not users_to_remove:
        raise ValueError("Нет таких пользователей в группе")

    user_ids_to_remove = {u.id for u in users_to_remove}

    for project in group.projects:
        for task in list(project.tasks):
            new_assignees = [u for u in task.assignees if u.id not in user_ids_to_remove]

            if not new_assignees:
                await session.delete(task)
            else:
                task.assignees = new_assignees

    for user in users_to_remove:
        group.users.remove(user)

    await session.commit()
    await session.refresh(group)

    return group


async def delete_group(session: AsyncSession, group_id: int, current_user: User) -> bool:
    group = await get_group_by_id(session, group_id)
    if not group:
        return False
    
    await ensure_user_is_admin(session, current_user.id, group.id)

    for task in list(group.tasks):
        await session.delete(task)

    for project in list(group.projects):
        project.group_id = None

    await session.delete(group)
    await session.commit()
    return True