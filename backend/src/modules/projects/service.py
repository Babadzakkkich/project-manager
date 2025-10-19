from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from core.utils.dependencies import ensure_user_is_admin, ensure_user_is_super_admin_global
from core.database.models import Project, Group, User, GroupMember, Task, project_group_association
from .schemas import AddGroupsToProject, ProjectCreate, ProjectReadWithRelations, ProjectUpdate, ProjectRead, RemoveGroupsFromProject
from .exceptions import (
    ProjectNotFoundError,
    ProjectCreationError,
    ProjectUpdateError,
    ProjectDeleteError,
    GroupsNotFoundError,
    GroupsNotInProjectError,
    InsufficientProjectPermissionsError
)

async def get_all_projects(session: AsyncSession, current_user_id: int) -> list[ProjectRead]:
    """Получить все проекты (только для супер-админа)"""
    await ensure_user_is_super_admin_global(session, current_user_id)
    stmt = select(Project).order_by(Project.id)
    result = await session.scalars(stmt)
    return result.all()

async def get_user_projects(session: AsyncSession, user_id: int) -> list[ProjectReadWithRelations]:
    """Получить проекты пользователя"""
    stmt = (
        select(Project)
        .join(Project.groups)
        .join(Group.group_members)
        .where(GroupMember.user_id == user_id)
        .options(
            selectinload(Project.groups).selectinload(Group.group_members).selectinload(GroupMember.user),
            selectinload(Project.tasks)
        )
        .order_by(Project.id)
    )

    result = await session.execute(stmt)
    projects = result.scalars().unique().all()
    
    # Преобразуем проекты в схему с правильными данными
    projects_with_relations = []
    for project in projects:
        # Преобразуем группы проекта
        groups_with_users = []
        for group in project.groups:
            # Преобразуем group_members в users с ролями
            users_with_roles = []
            for group_member in group.group_members:
                user_data = {
                    "id": group_member.user.id,
                    "login": group_member.user.login,
                    "email": group_member.user.email,
                    "name": group_member.user.name,
                    "created_at": group_member.user.created_at,
                    "role": group_member.role.value  # Преобразуем enum в строку
                }
                users_with_roles.append(user_data)
            
            group_data = {
                "id": group.id,
                "name": group.name,
                "description": group.description,
                "created_at": group.created_at,
                "users": users_with_roles
            }
            groups_with_users.append(group_data)
        
        # Преобразуем задачи проекта
        tasks_data = []
        for task in project.tasks:
            task_data = {
                "id": task.id,
                "title": task.title,
                "description": task.description,
                "status": task.status,
                "start_date": task.start_date,
                "deadline": task.deadline,
                "project_id": task.project_id
            }
            tasks_data.append(task_data)
        
        # Создаем объект проекта с преобразованными данными
        project_data = {
            "id": project.id,
            "title": project.title,
            "description": project.description,
            "start_date": project.start_date,
            "end_date": project.end_date,
            "status": project.status,
            "groups": groups_with_users,
            "tasks": tasks_data  # Используем преобразованные задачи
        }
        
        projects_with_relations.append(ProjectReadWithRelations(**project_data))
    
    return projects_with_relations

async def get_project_by_id(session: AsyncSession, project_id: int) -> ProjectReadWithRelations:
    """Получить проект по ID"""
    stmt = select(Project).options(
        selectinload(Project.groups).selectinload(Group.group_members).selectinload(GroupMember.user),
        selectinload(Project.tasks)
    ).where(Project.id == project_id)

    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    
    if not project:
        raise ProjectNotFoundError(project_id)
    
    # Преобразуем группы проекта
    groups_with_users = []
    for group in project.groups:
        # Преобразуем group_members в users с ролями
        users_with_roles = []
        for group_member in group.group_members:
            user_data = {
                "id": group_member.user.id,
                "login": group_member.user.login,
                "email": group_member.user.email,
                "name": group_member.user.name,
                "created_at": group_member.user.created_at,
                "role": group_member.role.value  # Преобразуем enum в строку
            }
            users_with_roles.append(user_data)
        
        group_data = {
            "id": group.id,
            "name": group.name,
            "description": group.description,
            "created_at": group.created_at,
            "users": users_with_roles
        }
        groups_with_users.append(group_data)
    
    # Преобразуем задачи проекта
    tasks_data = []
    for task in project.tasks:
        task_data = {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "status": task.status,
            "start_date": task.start_date,
            "deadline": task.deadline,
            "project_id": task.project_id
        }
        tasks_data.append(task_data)
    
    # Создаем объект проекта с преобразованными данными
    project_data = {
        "id": project.id,
        "title": project.title,
        "description": project.description,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "status": project.status,
        "groups": groups_with_users,
        "tasks": tasks_data  # Используем преобразованные задачи
    }
    
    return ProjectReadWithRelations(**project_data)

async def create_project(
    session: AsyncSession,
    project_data: ProjectCreate,
    current_user: User
) -> ProjectReadWithRelations:
    """Создать новый проект"""
    try:
        stmt_groups = select(Group).where(Group.id.in_(project_data.group_ids))
        result_groups = await session.execute(stmt_groups)
        groups = result_groups.scalars().all()

        if len(groups) != len(project_data.group_ids):
            found_ids = {g.id for g in groups}
            missing_ids = set(project_data.group_ids) - found_ids
            raise GroupsNotFoundError(list(missing_ids))

        # Проверяем права администратора для всех групп
        for group in groups:
            await ensure_user_is_admin(session, current_user.id, group.id)

        new_project = Project(**project_data.model_dump(exclude={"group_ids"}))
        new_project.groups.extend(groups)

        session.add(new_project)
        await session.commit()
        
        # Перезагружаем проект с отношениями
        return await get_project_by_id(session, new_project.id)

    except (GroupsNotFoundError, InsufficientProjectPermissionsError):
        raise
    except Exception as e:
        await session.rollback()
        raise ProjectCreationError(f"Не удалось создать проект: {str(e)}")

async def add_groups_to_project(
    session: AsyncSession,
    project_id: int,
    data: AddGroupsToProject,
    current_user: User
) -> ProjectReadWithRelations:
    """Добавить группы в проект"""
    try:
        # Получаем проект с базовыми отношениями
        stmt = select(Project).options(selectinload(Project.groups)).where(Project.id == project_id)
        result = await session.execute(stmt)
        project = result.scalar_one_or_none()
        
        if not project:
            raise ProjectNotFoundError(project_id)

        groups_stmt = select(Group).where(Group.id.in_(data.group_ids))
        groups_result = await session.execute(groups_stmt)
        groups = groups_result.scalars().all()

        if len(groups) != len(data.group_ids):
            found_ids = {g.id for g in groups}
            missing_ids = set(data.group_ids) - found_ids
            raise GroupsNotFoundError(list(missing_ids))

        # Проверяем права администратора для всех добавляемых групп
        for group in groups:
            await ensure_user_is_admin(session, current_user.id, group.id)

        # Добавляем группы к проекту
        for group in groups:
            if group not in project.groups:
                project.groups.append(group)

        await session.commit()

        # Возвращаем обновленный проект с полными отношениями
        return await get_project_by_id(session, project_id)

    except (ProjectNotFoundError, GroupsNotFoundError, InsufficientProjectPermissionsError):
        raise
    except Exception as e:
        await session.rollback()
        raise ProjectUpdateError(f"Не удалось добавить группы в проект: {str(e)}")

async def update_project(
    session: AsyncSession,
    db_project: Project,
    project_update: ProjectUpdate,
    current_user: User
) -> ProjectReadWithRelations:
    """Обновить проект"""
    try:
        # Проверяем права администратора для всех групп проекта
        for group in db_project.groups:
            await ensure_user_is_admin(session, current_user.id, group.id)

        for key, value in project_update.model_dump(exclude_unset=True).items():
            setattr(db_project, key, value)

        await session.commit()

        # Возвращаем обновленный проект
        return await get_project_by_id(session, db_project.id)

    except InsufficientProjectPermissionsError:
        raise
    except Exception as e:
        await session.rollback()
        raise ProjectUpdateError(f"Не удалось обновить проект: {str(e)}")

async def remove_groups_from_project(
    session: AsyncSession,
    project_id: int,
    data: RemoveGroupsFromProject,
    current_user: User
) -> ProjectReadWithRelations:
    """Удалить группы из проекта"""
    try:
        # Получаем проект с отношениями
        stmt = select(Project).options(
            selectinload(Project.groups),
            selectinload(Project.tasks)
        ).where(Project.id == project_id)
        result = await session.execute(stmt)
        project = result.scalar_one_or_none()
        
        if not project:
            raise ProjectNotFoundError(project_id)

        # Получаем группы для удаления
        groups_to_remove = [group for group in project.groups if group.id in data.group_ids]
        
        if not groups_to_remove:
            raise GroupsNotInProjectError(data.group_ids)

        # Проверяем права администратора для всех удаляемых групп
        for group in groups_to_remove:
            await ensure_user_is_admin(session, current_user.id, group.id)

        removed_group_ids = {group.id for group in groups_to_remove}

        # Удаляем задачи, связанные с удаляемыми группами
        for task in list(project.tasks):
            if task.group_id in removed_group_ids:
                await session.delete(task)

        # Удаляем группы из проекта через связь many-to-many
        for group in groups_to_remove:
            project.groups.remove(group)

        await session.commit()

        # Возвращаем обновленный проект
        return await get_project_by_id(session, project_id)

    except (ProjectNotFoundError, GroupsNotInProjectError, InsufficientProjectPermissionsError):
        raise
    except Exception as e:
        await session.rollback()
        raise ProjectUpdateError(f"Не удалось удалить группы из проекта: {str(e)}")

async def delete_project_auto(
    session: AsyncSession,
    project_id: int
) -> bool:
    """Автоматическое удаление проекта без проверки прав (для внутреннего использования)"""
    try:
        # Проверяем существование проекта
        project_stmt = select(Project).where(Project.id == project_id)
        project_result = await session.execute(project_stmt)
        db_project = project_result.scalar_one_or_none()
        
        if not db_project:
            return True  # Проект уже удален

        # Удаляем все задачи проекта
        delete_tasks_stmt = delete(Task).where(Task.project_id == project_id)
        await session.execute(delete_tasks_stmt)

        # Удаляем сам проект
        delete_project_stmt = delete(Project).where(Project.id == project_id)
        await session.execute(delete_project_stmt)

        await session.commit()
        return True

    except Exception as e:
        await session.rollback()
        raise ProjectDeleteError(f"Не удалось автоматически удалить проект: {str(e)}")


async def delete_project(
    session: AsyncSession,
    project_id: int,
    current_user: User
) -> bool:
    """Удалить проект"""
    try:
        # Проверяем существование проекта
        project_stmt = select(Project).where(Project.id == project_id)
        project_result = await session.execute(project_stmt)
        db_project = project_result.scalar_one_or_none()
        
        if not db_project:
            raise ProjectNotFoundError(project_id)

        # Проверяем права администратора для всех групп проекта
        project_groups_stmt = select(project_group_association).where(
            project_group_association.c.project_id == project_id
        )
        project_groups_result = await session.execute(project_groups_stmt)
        project_group_ids = [row.group_id for row in project_groups_result]
        
        for group_id in project_group_ids:
            await ensure_user_is_admin(session, current_user.id, group_id)

        # Удаляем все задачи проекта
        delete_tasks_stmt = delete(Task).where(Task.project_id == project_id)
        await session.execute(delete_tasks_stmt)

        # Удаляем связи с группами
        delete_project_links_stmt = delete(project_group_association).where(
            project_group_association.c.project_id == project_id
        )
        await session.execute(delete_project_links_stmt)

        # Удаляем сам проект
        delete_project_stmt = delete(Project).where(Project.id == project_id)
        await session.execute(delete_project_stmt)

        await session.commit()
        return True

    except (ProjectNotFoundError, InsufficientProjectPermissionsError):
        raise
    except Exception as e:
        await session.rollback()
        raise ProjectDeleteError(f"Не удалось удалить проект: {str(e)}")