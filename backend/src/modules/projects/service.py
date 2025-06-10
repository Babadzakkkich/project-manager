from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database.models import Project
from .schemas import ProjectCreate, ProjectUpdate, ProjectRead


async def get_all_projects(session: AsyncSession) -> list[ProjectRead]:
    stmt = select(Project).order_by(Project.id)
    result = await session.scalars(stmt)
    return result.all()


async def get_project_by_id(session: AsyncSession, project_id: int) -> ProjectRead | None:
    stmt = select(Project).where(Project.id == project_id)
    result = await session.scalar(stmt)
    return result


async def create_project(session: AsyncSession, project_create: ProjectCreate) -> ProjectRead:
    new_project = Project(**project_create.model_dump())
    session.add(new_project)
    await session.commit()
    await session.refresh(new_project)
    return new_project


async def update_project(
    session: AsyncSession,
    db_project: Project,
    project_update: ProjectUpdate
) -> ProjectRead:
    for key, value in project_update.model_dump(exclude_unset=True).items():
        setattr(db_project, key, value)

    await session.commit()
    await session.refresh(db_project)
    return db_project


async def delete_project(session: AsyncSession, project_id: int) -> bool:
    db_project = await get_project_by_id(session, project_id)
    if not db_project:
        return False

    await session.delete(db_project)
    await session.commit()
    return True