from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from core.utils.dependencies import ensure_user_is_admin
from core.database.models import Project, Group, User, group_user_association
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

async def get_all_projects(session: AsyncSession) -> list[ProjectRead]:
    stmt = select(Project).order_by(Project.id)
    result = await session.scalars(stmt)
    return result.all()

async def get_user_projects(session: AsyncSession, user_id: int) -> list[ProjectReadWithRelations]:
    stmt = (
        select(Project)
        .join(Project.groups)
        .join(Group.users)
        .where(User.id == user_id)
        .options(
            selectinload(Project.groups).selectinload(Group.users),
            selectinload(Project.tasks)
        )
        .order_by(Project.id)
    )

    result = await session.execute(stmt)
    projects = result.scalars().unique().all()
    
    # Создаем сериализованные проекты с использованием общих схем
    serialized_projects = []
    for project in projects:
        serialized_groups = []
        
        for group in project.groups:
            # Загружаем роли пользователей
            roles_stmt = select(
                group_user_association.c.user_id, 
                group_user_association.c.role
            ).where(group_user_association.c.group_id == group.id)
            
            roles_result = await session.execute(roles_stmt)
            roles = {row[0]: row[1] for row in roles_result.all()}
            
            # Создаем сериализованных пользователей с использованием UserWithRole
            serialized_users = []
            for user in group.users:
                serialized_users.append({
                    'id': user.id,
                    'login': user.login,
                    'email': user.email,
                    'name': user.name,
                    'created_at': user.created_at,
                    'role': roles.get(user.id, 'member')
                })
            
            # Создаем сериализованную группу
            serialized_group = {
                'id': group.id,
                'name': group.name,
                'description': group.description,
                'created_at': group.created_at,
                'users': serialized_users
            }
            serialized_groups.append(serialized_group)
        
        # Создаем сериализованный проект
        serialized_project = {
            'id': project.id,
            'title': project.title,
            'description': project.description,
            'start_date': project.start_date,
            'end_date': project.end_date,
            'status': project.status,
            'groups': serialized_groups,
            'tasks': list(project.tasks) if project.tasks else []
        }
        serialized_projects.append(serialized_project)
    
    return serialized_projects

async def get_project_by_id(session: AsyncSession, project_id: int) -> ProjectReadWithRelations:
    stmt = select(Project).options(
        selectinload(Project.groups).selectinload(Group.users),
        selectinload(Project.tasks)
    ).where(Project.id == project_id)

    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    
    if not project:
        raise ProjectNotFoundError(project_id)
    
    # Сериализуем проект с использованием общих схем
    serialized_groups = []
    for group in project.groups:
        # Загружаем роли пользователей
        roles_stmt = select(
            group_user_association.c.user_id, 
            group_user_association.c.role
        ).where(group_user_association.c.group_id == group.id)
        
        roles_result = await session.execute(roles_stmt)
        roles = {row[0]: row[1] for row in roles_result.all()}
        
        # Создаем сериализованных пользователей
        serialized_users = []
        for user in group.users:
            serialized_users.append({
                'id': user.id,
                'login': user.login,
                'email': user.email,
                'name': user.name,
                'created_at': user.created_at,
                'role': roles.get(user.id, 'member')
            })
        
        # Создаем сериализованную группу
        serialized_group = {
            'id': group.id,
            'name': group.name,
            'description': group.description,
            'created_at': group.created_at,
            'users': serialized_users
        }
        serialized_groups.append(serialized_group)
    
    # Создаем сериализованный проект
    serialized_project = {
        'id': project.id,
        'title': project.title,
        'description': project.description,
        'start_date': project.start_date,
        'end_date': project.end_date,
        'status': project.status,
        'groups': serialized_groups,
        'tasks': list(project.tasks) if project.tasks else []
    }
    
    return serialized_project

# Остальные методы остаются без изменений...
async def create_project(
    session: AsyncSession,
    project_data: ProjectCreate,
    current_user: User
) -> ProjectReadWithRelations:
    try:
        stmt_groups = select(Group).where(Group.id.in_(project_data.group_ids))
        result_groups = await session.execute(stmt_groups)
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
        await session.refresh(new_project)

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
    try:
        project = await get_project_by_id(session, project_id)

        groups_stmt = select(Group).where(Group.id.in_(data.group_ids))
        groups_result = await session.execute(groups_stmt)
        groups = groups_result.scalars().all()

        if len(groups) != len(data.group_ids):
            found_ids = {g.id for g in groups}
            missing_ids = set(data.group_ids) - found_ids
            raise GroupsNotFoundError(list(missing_ids))

        for group in groups:
            await ensure_user_is_admin(session, current_user.id, group.id)

        # Добавляем группы к проекту
        for group in groups:
            if group not in project.groups:
                project.groups.append(group)

        await session.commit()

        # Возвращаем обновленный проект через get_project_by_id для корректной сериализации
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
    try:
        for group in db_project.groups:
            await ensure_user_is_admin(session, current_user.id, group.id)

        for key, value in project_update.model_dump(exclude_unset=True).items():
            setattr(db_project, key, value)

        await session.commit()

        # Возвращаем обновленный проект через get_project_by_id для корректной сериализации
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

        groups_to_remove = [g for g in project.groups if g.id in data.group_ids]
        if not groups_to_remove:
            raise GroupsNotInProjectError(data.group_ids)

        for group in groups_to_remove:
            await ensure_user_is_admin(session, current_user.id, group.id)

        removed_group_ids = {g.id for g in groups_to_remove}

        # Удаляем задачи, связанные с удаляемыми группами
        for task in list(project.tasks):
            if task.group_id in removed_group_ids:
                await session.delete(task)

        # Удаляем группы из проекта
        for group in groups_to_remove:
            project.groups.remove(group)

        await session.commit()

        # Возвращаем обновленный проект через get_project_by_id для корректной сериализации
        return await get_project_by_id(session, project_id)

    except (ProjectNotFoundError, GroupsNotInProjectError, InsufficientProjectPermissionsError):
        raise
    except Exception as e:
        await session.rollback()
        raise ProjectUpdateError(f"Не удалось удалить группы из проекта: {str(e)}")

async def delete_project(
    session: AsyncSession,
    project_id: int,
    current_user: User
) -> bool:
    try:
        stmt = select(Project).options(
            selectinload(Project.groups),
            selectinload(Project.tasks)
        ).where(Project.id == project_id)
        result = await session.execute(stmt)
        db_project = result.scalar_one_or_none()
        
        if not db_project:
            raise ProjectNotFoundError(project_id)

        for group in db_project.groups:
            await ensure_user_is_admin(session, current_user.id, group.id)

        # Удаляем все задачи проекта
        for task in list(db_project.tasks):
            await session.delete(task)

        # Очищаем связи с группами
        db_project.groups.clear()

        await session.delete(db_project)
        await session.commit()
        return True

    except (ProjectNotFoundError, InsufficientProjectPermissionsError):
        raise
    except Exception as e:
        await session.rollback()
        raise ProjectDeleteError(f"Не удалось удалить проект: {str(e)}")