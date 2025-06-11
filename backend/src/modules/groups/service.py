from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from core.database.models import Group, Project, Task, User
from .schemas import AddUsersToGroup, RemoveUsersFromGroup, GroupCreate, GroupRead, GroupReadWithRelations, GroupUpdate

async def get_all_groups(session: AsyncSession) -> list[GroupRead]:
    stmt = select(Group).order_by(Group.id)
    result = await session.scalars(stmt)
    return result.all()


async def get_group_by_id(session: AsyncSession, group_id: int) -> GroupRead | None:
    stmt = select(Group).options(
        selectinload(Group.users),
        selectinload(Group.projects)
    ).where(Group.id == group_id)

    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create_group(session: AsyncSession, group_create: GroupCreate) -> GroupReadWithRelations:
    # Создаем группу без пользователей
    new_group = Group(**group_create.model_dump(exclude={"user_ids"}))
    session.add(new_group)

    # Загружаем пользователей
    stmt_users = select(User).where(User.id.in_(group_create.user_ids))
    result_users = await session.execute(stmt_users)
    users = result_users.scalars().all()

    if not users:
        raise ValueError("Назначенные пользователи не найдены")

    new_group.users.extend(users)

    await session.commit()
    await session.refresh(new_group)

    # Явно загружаем связи
    stmt = select(Group).options(
        selectinload(Group.users),
        selectinload(Group.projects)
    ).where(Group.id == new_group.id)

    result = await session.execute(stmt)
    return result.scalar_one()

async def add_users_to_group(
    session: AsyncSession, 
    group_id: int, 
    data: AddUsersToGroup
) -> GroupReadWithRelations:
    stmt = select(Group).options(
        selectinload(Group.users),
        selectinload(Group.projects).selectinload(Project.tasks).selectinload(Task.assignees)
    ).where(Group.id == group_id)

    result = await session.execute(stmt)
    group = result.scalar_one_or_none()

    if not group:
        raise ValueError("Группа не найдена")

    # Проверяем, что пользователи существуют
    users_stmt = select(User).where(User.id.in_(data.user_ids))
    users_result = await session.execute(users_stmt)
    users = users_result.scalars().all()

    if len(users) != len(data.user_ids):
        found_ids = {u.id for u in users}
        missing_ids = set(data.user_ids) - found_ids
        raise ValueError(f"Пользователи {missing_ids} не найдены")

    # Добавляем пользователей
    for user in users:
        if user not in group.users:
            group.users.append(user)

    await session.commit()
    await session.refresh(group)

    return group

async def update_group(
    session: AsyncSession,
    db_group: Group,
    group_update: GroupUpdate
) -> GroupRead:
    for key, value in group_update.model_dump(exclude_unset=True).items():
        setattr(db_group, key, value)

    await session.commit()
    await session.refresh(db_group)
    return db_group


async def remove_users_from_group(session: AsyncSession, group_id: int, data: RemoveUsersFromGroup) -> GroupReadWithRelations:
    # Получаем группу со связями
    stmt = select(Group).options(
        selectinload(Group.users),
        selectinload(Group.projects)
        .selectinload(Project.tasks)
        .selectinload(Task.assignees)
    ).where(Group.id == group_id)

    result = await session.execute(stmt)
    group = result.scalar_one_or_none()

    if not group:
        raise ValueError("Группа не найдена")

    # Получаем пользователей для удаления
    users_to_remove = [u for u in group.users if u.id in data.user_ids]
    if not users_to_remove:
        raise ValueError("Нет таких пользователей в группе")

    user_ids_to_remove = {u.id for u in users_to_remove}

    # Для каждого проекта группы — находим задачи, где эти пользователи назначены
    for project in group.projects:
        stmt_tasks = (
            select(Task)
            .join(Task.assignees)
            .where(
                Task.project_id == project.id,
                User.id.in_(user_ids_to_remove)
            )
        )

        result_tasks = await session.execute(stmt_tasks)
        tasks_with_users = result_tasks.scalars().all()

        # Убираем пользователей из assignees
        for task in tasks_with_users:
            assignees_before = list(task.assignees)

            task.assignees = [u for u in task.assignees if u.id not in user_ids_to_remove]

            if len(assignees_before) != len(task.assignees):
                # Если после удаления нет assignees — удаляем задачу
                if len(task.assignees) == 0:
                    await session.delete(task)
                else:
                    # Сохраняем обновлённый список assignees
                    task.assignees = task.assignees  # Это может быть не нужно, т.к. это ORM-объекты

    # Теперь удаляем пользователей из самой группы
    for user in users_to_remove:
        group.users.remove(user)

    await session.commit()
    await session.refresh(group)

    return group


async def delete_group(session: AsyncSession, group_id: int) -> bool:
    group = await get_group_by_id(session, group_id)
    if not group:
        return False

    # Сначала очищаем связь с проектами
    for project in list(group.projects):
        project.group_id = None

    # Теперь можно удалить саму группу
    await session.delete(group)
    await session.commit()
    return True