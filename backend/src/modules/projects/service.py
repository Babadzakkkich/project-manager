from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from core.security.dependencies import ensure_user_is_admin
from core.database.models import Project, Group, Task, User
from .schemas import AddGroupsToProject, ProjectCreate, ProjectReadWithRelations, ProjectUpdate, ProjectRead, RemoveGroupsFromProject

async def get_all_projects(session: AsyncSession) -> list[ProjectRead]:
    stmt = select(Project).order_by(Project.id)
    result = await session.scalars(stmt)
    return result.all()

async def get_project_by_id(session: AsyncSession, project_id: int) -> ProjectReadWithRelations | None:
    stmt = select(Project).options(
        selectinload(Project.groups),
        selectinload(Project.tasks)
    ).where(Project.id == project_id)

    result = await session.execute(stmt)
    return result.scalar_one_or_none()

async def create_project(
    session: AsyncSession,
    project_data: ProjectCreate,
    current_user: User
) -> ProjectReadWithRelations:
    # Получаем  по ID
    stmt_groups = select(Group).where(Group.id.in_(project_data.group_ids))
    result_groups = await session.execute(stmt_groups)
    groups = result_groups.scalars().all()

    if len(groups) != len(project_data.group_ids):
        found_ids = {g.id for g in groups}
        missing_ids = set(project_data.group_ids) - found_ids
        raise ValueError(f"Группы с ID {missing_ids} не найдены")

    # Проверяем права пользователя во всех группах
    for group in groups:
        await ensure_user_is_admin(session, current_user.id, group.id)

    # Создаём проект
    new_project = Project(**project_data.model_dump(exclude={"group_ids"}))
    new_project.groups.extend(groups)

    session.add(new_project)
    await session.commit()
    await session.refresh(new_project)

    # Возвращаем проект с отношениями
    stmt = select(Project).options(
        selectinload(Project.groups),
        selectinload(Project.tasks)
    ).where(Project.id == new_project.id)

    result = await session.execute(stmt)
    return result.scalar_one()

async def add_groups_to_project(
    session: AsyncSession,
    project_id: int,
    data: AddGroupsToProject,
    current_user: User
) -> ProjectReadWithRelations:
    # Получаем проект
    stmt = select(Project).options(
        selectinload(Project.groups),
        selectinload(Project.tasks).selectinload(Task.assignees)
    ).where(Project.id == project_id)

    result = await session.execute(stmt)
    project = result.scalar_one_or_none()

    if not project:
        raise ValueError("Проект не найден")

    # Получаем группы
    groups_stmt = select(Group).where(Group.id.in_(data.group_ids))
    groups_result = await session.execute(groups_stmt)
    groups = groups_result.scalars().all()

    if len(groups) != len(data.group_ids):
        found_ids = {g.id for g in groups}
        missing_ids = set(data.group_ids) - found_ids
        raise ValueError(f"Группы {missing_ids} не найдены")

    # Проверяем, является ли пользователь админом во всех добавляемых группах
    for group in groups:
        await ensure_user_is_admin(session, current_user.id, group.id)

    # Добавляем группы
    for group in groups:
        if group not in project.groups:
            project.groups.append(group)

    await session.commit()
    await session.refresh(project)

    return project

async def update_project(
    session: AsyncSession,
    db_project: Project,
    project_update: ProjectUpdate,
    current_user: User
) -> ProjectRead:
    # Проверяем, является ли пользователь админом во всех группах проекта
    for group in db_project.groups:
        await ensure_user_is_admin(session, current_user.id, group.id)

    # Проставляем новые значения
    for key, value in project_update.model_dump(exclude_unset=True).items():
        setattr(db_project, key, value)

    await session.commit()
    await session.refresh(db_project)
    return db_project

async def remove_groups_from_project(
    session: AsyncSession,
    project_id: int,
    data: RemoveGroupsFromProject,
    current_user: User
) -> ProjectReadWithRelations:
    # Загружаем проект
    stmt = select(Project).options(
        selectinload(Project.groups),
        selectinload(Project.tasks).selectinload(Task.group),
    ).where(Project.id == project_id)

    result = await session.execute(stmt)
    project = result.scalar_one_or_none()

    if not project:
        raise ValueError("Проект не найден")

    # Ищем группы для удаления
    groups_to_remove = [g for g in project.groups if g.id in data.group_ids]
    if not groups_to_remove:
        raise ValueError("Нет таких групп в проекте")

    # Проверяем, что пользователь — админ в каждой удаляемой группе
    for group in groups_to_remove:
        await ensure_user_is_admin(session, current_user.id, group.id)

    removed_group_ids = {g.id for g in groups_to_remove}

    # Удаляем задачи, относящиеся к этим группам
    for task in list(project.tasks):
        if task.group_id in removed_group_ids:
            await session.delete(task)

    # Удаляем группы
    for group in groups_to_remove:
        project.groups.remove(group)

    await session.commit()
    await session.refresh(project)

    return project

async def delete_project(
    session: AsyncSession,
    project_id: int,
    current_user: User
) -> bool:
    db_project = await get_project_by_id(session, project_id)
    if not db_project:
        return False

    # Проверяем, является ли пользователь админом во всех группах проекта
    for group in db_project.groups:
        await ensure_user_is_admin(session, current_user.id, group.id)

    # Удаляем все задачи
    for task in list(db_project.tasks):
        await session.delete(task)

    # Очищаем связи
    db_project.groups.clear()

    # Удаляем сам проект
    await session.delete(db_project)
    await session.commit()
    return True