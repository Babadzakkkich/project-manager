from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from core.utils.dependencies import ensure_user_is_admin, ensure_user_is_super_admin_global
from core.database.models import Project, Group, User, GroupMember, Task, project_group_association
from .schemas import (
    AddGroupsToProject,
    ProjectCreate,
    ProjectReadWithRelations,
    ProjectUpdate,
    ProjectRead,
    RemoveGroupsFromProject,
)
from .exceptions import (
    ProjectNotFoundError,
    ProjectCreationError,
    ProjectUpdateError,
    ProjectDeleteError,
    GroupsNotFoundError,
    GroupsNotInProjectError,
    InsufficientProjectPermissionsError,
)

# Получить все проекты (только для супер-админа)
async def get_all_projects(session: AsyncSession, current_user_id: int) -> list[ProjectRead]:
    await ensure_user_is_super_admin_global(session, current_user_id)
    stmt = select(Project).order_by(Project.id)
    result = await session.scalars(stmt)
    return result.all()

# Получить проекты пользователя
async def get_user_projects(session: AsyncSession, user_id: int) -> list[ProjectReadWithRelations]:
    stmt = (
        select(Project)
        .join(Project.groups)
        .join(Group.group_members)
        .where(GroupMember.user_id == user_id)
        .options(
            selectinload(Project.groups)
            .selectinload(Group.group_members)
            .selectinload(GroupMember.user),
            selectinload(Project.tasks)
        )
        .order_by(Project.id)
    )

    result = await session.execute(stmt)
    projects = result.scalars().unique().all()

    projects_with_relations = []
    for project in projects:
        project_data = {
            "id": project.id,
            "title": project.title,
            "description": project.description,
            "start_date": project.start_date,
            "end_date": project.end_date,
            "status": project.status,
            "groups": [],
            "tasks": [],
        }

        for group in project.groups:
            group_data = {
                "id": group.id,
                "name": group.name,
                "description": group.description,
                "created_at": group.created_at,
                "users": [],
            }

            for gm in group.group_members:
                user_data = {
                    "id": gm.user.id,
                    "login": gm.user.login,
                    "email": gm.user.email,
                    "name": gm.user.name,
                    "created_at": gm.user.created_at,
                    "role": gm.role.value,
                }
                group_data["users"].append(user_data)

            project_data["groups"].append(group_data)

        for task in project.tasks:
            task_data = {
                "id": task.id,
                "title": task.title,
                "description": task.description,
                "status": task.status,
                "priority": task.priority,
                "position": task.position,
                "start_date": task.start_date,
                "deadline": task.deadline,
                "project_id": task.project_id,
                "tags": task.tags if task.tags else [],
            }
            project_data["tasks"].append(task_data)

        projects_with_relations.append(ProjectReadWithRelations(**project_data))

    return projects_with_relations

# Получить проект по ID
async def get_project_by_id(session: AsyncSession, project_id: int) -> ProjectReadWithRelations:
    stmt = (
        select(Project)
        .options(
            selectinload(Project.groups)
            .selectinload(Group.group_members)
            .selectinload(GroupMember.user),
            selectinload(Project.tasks),
        )
        .where(Project.id == project_id)
    )
    result = await session.execute(stmt)
    project = result.scalar_one_or_none()

    if not project:
        raise ProjectNotFoundError(project_id)

    groups_data = []
    for group in project.groups:
        users_data = [
            {
                "id": gm.user.id,
                "login": gm.user.login,
                "email": gm.user.email,
                "name": gm.user.name,
                "created_at": gm.user.created_at,
                "role": gm.role.value,
            }
            for gm in group.group_members
        ]

        groups_data.append(
            {
                "id": group.id,
                "name": group.name,
                "description": group.description,
                "created_at": group.created_at,
                "users": users_data,
            }
        )

    tasks_data = [
        {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "status": task.status,
            "priority": task.priority,
            "position": task.position,
            "start_date": task.start_date,
            "deadline": task.deadline,
            "project_id": task.project_id,
            "tags": task.tags if task.tags else [],
        }
        for task in project.tasks
    ]

    project_data = {
        "id": project.id,
        "title": project.title,
        "description": project.description,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "status": project.status,
        "groups": groups_data,
        "tasks": tasks_data,
    }

    return ProjectReadWithRelations(**project_data)

# Создать проект
async def create_project(
    session: AsyncSession,
    project_data: ProjectCreate,
    current_user: User,
) -> ProjectReadWithRelations:
    try:
        groups_stmt = select(Group).where(Group.id.in_(project_data.group_ids))
        result_groups = await session.execute(groups_stmt)
        groups = result_groups.scalars().all()

        if len(groups) != len(project_data.group_ids):
            found_ids = {g.id for g in groups}
            missing_ids = set(project_data.group_ids) - found_ids
            raise GroupsNotFoundError(list(missing_ids))

        for group in groups:
            await ensure_user_is_admin(session, current_user.id, group.id)

        new_project = Project(**project_data.model_dump(exclude={"group_ids"}))
        new_project.groups.extend(groups)
        session.add(new_project)
        await session.commit()

        return await get_project_by_id(session, new_project.id)

    except Exception as e:
        await session.rollback()
        raise ProjectCreationError(f"Не удалось создать проект: {str(e)}")

# Обновить проект
async def update_project(
    session: AsyncSession,
    db_project: Project,
    project_update: ProjectUpdate,
    current_user: User,
) -> ProjectReadWithRelations:
    try:
        for group in db_project.groups:
            await ensure_user_is_admin(session, current_user.id, group.id)

        for key, value in project_update.model_dump(exclude_unset=True).items():
            setattr(db_project, key, value)

        await session.commit()
        await session.refresh(db_project)

        return await get_project_by_id(session, db_project.id)

    except Exception as e:
        await session.rollback()
        raise ProjectUpdateError(f"Не удалось обновить проект: {str(e)}")

# Добавить группы в проект
async def add_groups_to_project(
    session: AsyncSession,
    project_id: int,
    data: AddGroupsToProject,
    current_user: User,
) -> ProjectReadWithRelations:
    try:
        stmt = select(Project).options(selectinload(Project.groups)).where(Project.id == project_id)
        result = await session.execute(stmt)
        project = result.scalar_one_or_none()

        if not project:
            raise ProjectNotFoundError(project_id)

        groups_stmt = select(Group).where(Group.id.in_(data.group_ids))
        result_groups = await session.execute(groups_stmt)
        groups = result_groups.scalars().all()

        if len(groups) != len(data.group_ids):
            found_ids = {g.id for g in groups}
            missing_ids = set(data.group_ids) - found_ids
            raise GroupsNotFoundError(list(missing_ids))

        for group in groups:
            await ensure_user_is_admin(session, current_user.id, group.id)
            if group not in project.groups:
                project.groups.append(group)

        await session.commit()
        return await get_project_by_id(session, project_id)

    except Exception as e:
        await session.rollback()
        raise ProjectUpdateError(f"Не удалось добавить группы в проект: {str(e)}")

# Удалить группы из проекта
async def remove_groups_from_project(
    session: AsyncSession,
    project_id: int,
    data: RemoveGroupsFromProject,
    current_user: User,
) -> ProjectReadWithRelations:
    try:
        stmt = select(Project).options(
            selectinload(Project.groups),
            selectinload(Project.tasks),
        ).where(Project.id == project_id)

        result = await session.execute(stmt)
        project = result.scalar_one_or_none()

        if not project:
            raise ProjectNotFoundError(project_id)

        groups_to_remove = [g for g in project.groups if g.id in data.group_ids]
        if not groups_to_remove:
            raise GroupsNotInProjectError(data.group_ids)

        for group in groups_to_remove:
            await ensure_user_is_admin(session, current_user.id, group.id)
            project.groups.remove(group)

        await session.commit()
        return await get_project_by_id(session, project_id)

    except Exception as e:
        await session.rollback()
        raise ProjectUpdateError(f"Не удалось удалить группы из проекта: {str(e)}")

# Автоматическое удаление проекта
async def delete_project_auto(
    session: AsyncSession,
    project_id: int
) -> bool:
    try:
        project_stmt = select(Project).where(Project.id == project_id)
        project_result = await session.execute(project_stmt)
        db_project = project_result.scalar_one_or_none()
        
        if not db_project:
            return True

        tasks_stmt = select(Task.id).where(Task.project_id == project_id)
        tasks_result = await session.execute(tasks_stmt)
        task_ids = [row[0] for row in tasks_result]

        if task_ids:
            from core.database.models import TaskHistory
            delete_history_stmt = delete(TaskHistory).where(
                TaskHistory.task_id.in_(task_ids)
            )
            await session.execute(delete_history_stmt)

        if task_ids:
            from core.database.models import task_user_association
            delete_user_associations_stmt = delete(task_user_association).where(
                task_user_association.c.task_id.in_(task_ids)
            )
            await session.execute(delete_user_associations_stmt)

        delete_tasks_stmt = delete(Task).where(Task.project_id == project_id)
        await session.execute(delete_tasks_stmt)

        delete_project_links_stmt = delete(project_group_association).where(
            project_group_association.c.project_id == project_id
        )
        await session.execute(delete_project_links_stmt)

        delete_project_stmt = delete(Project).where(Project.id == project_id)
        await session.execute(delete_project_stmt)

        await session.commit()
        return True

    except Exception as e:
        await session.rollback()
        raise ProjectDeleteError(f"Не удалось автоматически удалить проект: {str(e)}")

# Удалить проект
async def delete_project(
    session: AsyncSession,
    project_id: int,
    current_user: User
) -> bool:
    try:
        project_stmt = select(Project).where(Project.id == project_id)
        project_result = await session.execute(project_stmt)
        db_project = project_result.scalar_one_or_none()
        
        if not db_project:
            raise ProjectNotFoundError(project_id)

        project_groups_stmt = select(project_group_association).where(
            project_group_association.c.project_id == project_id
        )
        project_groups_result = await session.execute(project_groups_stmt)
        project_group_ids = [row.group_id for row in project_groups_result]
        
        for group_id in project_group_ids:
            await ensure_user_is_admin(session, current_user.id, group_id)

        tasks_stmt = select(Task.id).where(Task.project_id == project_id)
        tasks_result = await session.execute(tasks_stmt)
        task_ids = [row[0] for row in tasks_result]

        if task_ids:
            from core.database.models import TaskHistory
            delete_history_stmt = delete(TaskHistory).where(
                TaskHistory.task_id.in_(task_ids)
            )
            await session.execute(delete_history_stmt)

        if task_ids:
            from core.database.models import task_user_association
            delete_user_associations_stmt = delete(task_user_association).where(
                task_user_association.c.task_id.in_(task_ids)
            )
            await session.execute(delete_user_associations_stmt)

        delete_tasks_stmt = delete(Task).where(Task.project_id == project_id)
        await session.execute(delete_tasks_stmt)

        delete_project_links_stmt = delete(project_group_association).where(
            project_group_association.c.project_id == project_id
        )
        await session.execute(delete_project_links_stmt)

        delete_project_stmt = delete(Project).where(Project.id == project_id)
        await session.execute(delete_project_stmt)

        await session.commit()
        return True

    except (ProjectNotFoundError, InsufficientProjectPermissionsError):
        raise
    except Exception as e:
        await session.rollback()
        raise ProjectDeleteError(f"Не удалось удалить проект: {str(e)}")