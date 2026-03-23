from typing import Optional

from fastapi import APIRouter, Depends, status, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.dependencies import check_user_in_group, get_service_factory, ensure_user_is_admin, ensure_user_is_super_admin_global
from core.database.models import User
from core.services import ServiceFactory
from modules.auth.dependencies import get_current_user, get_optional_current_user
from core.database.session import db_session
from core.logger import logger
from .service import GroupService
from .invitation_service import GroupInvitationService
from .schemas import (
    GroupCreate, GroupRead, GroupUpdate, GroupReadWithRelations,
    RemoveUsersFromGroup, InviteUserToGroup, PendingInvitation,
    AcceptInvitationResponse, DeclineInvitationResponse
)
from .exceptions import (
    GroupNotFoundError,
    GroupAlreadyExistsError,
    GroupCreationError,
    GroupUpdateError,
    GroupDeleteError,
    InvalidRoleError,
    UserNotInGroupError,
    UserAlreadyInGroupError,
    UserNotFoundInGroupError,
    InsufficientPermissionsError,
    InvalidInvitationError,
    InvitationExpiredError,
    InvitationAlreadyProcessedError
)

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/", response_model=list[GroupReadWithRelations])
async def get_all_groups(
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получить все группы (только для супер-админа)"""
    logger.info(f"GET /groups requested by user {current_user.id}")
    group_service = service_factory.get('group')
    return await group_service.get_all_groups(current_user.id)


@router.get("/my", response_model=list[GroupReadWithRelations])
async def get_groups(
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получить группы текущего пользователя"""
    logger.info(f"GET /groups/my requested by user {current_user.id}")
    group_service = service_factory.get('group')
    return await group_service.get_user_groups(current_user.id)


@router.get("/{group_id}", response_model=GroupReadWithRelations)
async def get_group(
    group_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    """Получить информацию о группе (только для участников группы)"""
    logger.info(f"GET /groups/{group_id} requested by user {current_user.id}")
    
    if not await check_user_in_group(session, current_user.id, group_id):
        logger.warning(f"User {current_user.id} tried to access group {group_id} without membership")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Пользователь с ID {current_user.id} не состоит в группе {group_id}"
        )
    
    try:
        group_service = service_factory.get('group')
        group = await group_service.get_group_by_id(group_id)
        return group
    except GroupNotFoundError as e:
        logger.error(f"Group {group_id} not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )


@router.get("/{group_id}/my_role", response_model=dict)
async def get_my_role_in_group(
    group_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Получить свою роль в группе"""
    logger.info(f"GET /groups/{group_id}/my_role requested by user {current_user.id}")
    group_service = service_factory.get('group')
    
    try:
        role = await group_service.get_role_for_user_in_group(current_user.id, group_id)
        return {"role": role.role.value if hasattr(role, 'role') else role}
    except UserNotInGroupError as e:
        logger.warning(f"User {current_user.id} not in group {group_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )


@router.post("/", response_model=GroupReadWithRelations, status_code=status.HTTP_201_CREATED)
async def create_new_group(
    group_data: GroupCreate, 
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Создать новую группу"""
    logger.info(f"POST /groups - creating new group '{group_data.name}' by user {current_user.id}")
    group_service = service_factory.get('group')
    
    try:
        return await group_service.create_group(group_data, current_user)
    except GroupAlreadyExistsError as e:
        logger.error(f"Error creating group: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except GroupCreationError as e:
        logger.error(f"Error creating group: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )


@router.post("/{group_id}/invite", response_model=dict)
async def invite_user_to_group(
    group_id: int,
    invite_data: InviteUserToGroup,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    """
    Отправить приглашение пользователю в группу по email.
    Пользователь получит уведомление с кнопками "Принять" и "Отклонить".
    """
    logger.info(f"POST /groups/{group_id}/invite by user {current_user.id} for {invite_data.email}")
    
    try:
        # Проверяем права администратора
        await ensure_user_is_admin(session, current_user.id, group_id)
        
        # Получаем группу для уведомления
        group_service = service_factory.get('group')
        group = await group_service.get_group_by_id(group_id)
        
        # Создаем приглашение
        invitation_service = GroupInvitationService(
            session,
            notification_trigger=service_factory.get('notification_trigger')
        )
        
        invitation = await invitation_service.create_invitation(
            group_id=group_id,
            invited_email=invite_data.email,
            invited_by_id=current_user.id,
            role=invite_data.role
        )
        
        # Отправляем уведомление
        notification_trigger = service_factory.get('notification_trigger')
        await notification_trigger.on_invitation_sent(
            group=group,
            invited_email=invite_data.email,
            invited_by=current_user,
            role=invite_data.role.value,
            invitation_token=invitation.token
        )
        
        logger.info(f"Invitation sent to {invite_data.email} for group {group_id}")
        
        return {
            "message": f"Приглашение отправлено на {invite_data.email}",
            "invitation_id": invitation.id
        }
        
    except GroupNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except InsufficientPermissionsError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except UserAlreadyInGroupError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except Exception as e:
        logger.error(f"Error inviting user: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось отправить приглашение: {str(e)}"
        )


@router.get("/invitations/pending", response_model=list[PendingInvitation])
async def get_pending_invitations(
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user)
):
    """
    Получить ожидающие приглашения для текущего пользователя
    """
    logger.info(f"GET /groups/invitations/pending by user {current_user.id}")
    
    invitation_service = GroupInvitationService(session)
    invitations = await invitation_service.get_pending_invitations_for_email(current_user.email)
    
    return [
        {
            "id": inv.id,
            "token": inv.token,
            "group_id": inv.group.id,
            "group_name": inv.group.name,
            "invited_by": inv.invited_by.login,
            "role": inv.role.value,
            "expires_at": inv.expires_at,
            "created_at": inv.created_at
        }
        for inv in invitations
    ]


@router.post("/invitations/{token}/accept", response_model=AcceptInvitationResponse)
async def accept_invitation(
    token: str,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: User = Depends(get_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory)
):
    """
    Принять приглашение в группу
    """
    logger.info(f"POST /groups/invitations/{token}/accept by user {current_user.id}")
    
    invitation_service = GroupInvitationService(
        session,
        notification_trigger=service_factory.get('notification_trigger')
    )
    
    try:
        result = await invitation_service.accept_invitation(token, current_user.id)
        
        return AcceptInvitationResponse(
            success=True,
            message=result.get("message", "Вы присоединились к группе"),
            group_id=result.get("group").id if result.get("group") else None,
            group_name=result.get("group").name if result.get("group") else None
        )
        
    except (InvalidInvitationError, InvitationExpiredError, InvitationAlreadyProcessedError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except Exception as e:
        logger.error(f"Error accepting invitation: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось принять приглашение: {str(e)}"
        )


@router.post("/invitations/{token}/decline", response_model=DeclineInvitationResponse)
async def decline_invitation(
    token: str,
    session: AsyncSession = Depends(db_session.session_getter),
    current_user: Optional[User] = Depends(get_optional_current_user),
    service_factory: ServiceFactory = Depends(get_service_factory)
):
    """
    Отклонить приглашение в группу
    """
    user_id = current_user.id if current_user else None
    logger.info(f"POST /groups/invitations/{token}/decline by user {user_id}")
    
    invitation_service = GroupInvitationService(
        session,
        notification_trigger=service_factory.get('notification_trigger')
    )
    
    try:
        result = await invitation_service.decline_invitation(token, user_id)
        
        return DeclineInvitationResponse(
            success=True,
            message=result.get("message", "Приглашение отклонено")
        )
        
    except (InvalidInvitationError, InvitationExpiredError, InvitationAlreadyProcessedError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except Exception as e:
        logger.error(f"Error declining invitation: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось отклонить приглашение: {str(e)}"
        )


@router.put("/{group_id}", response_model=GroupReadWithRelations)
async def update_group_by_id(
    group_id: int,
    group_data: GroupUpdate,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    """Обновить информацию о группе (только для администраторов группы)"""
    logger.info(f"PUT /groups/{group_id} by user {current_user.id}")
    group_service = service_factory.get('group')
    
    try:
        db_group = await group_service.get_group_by_id(group_id)
        return await group_service.update_group(db_group, group_data, current_user)
    except GroupNotFoundError as e:
        logger.error(f"Error updating group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except GroupAlreadyExistsError as e:
        logger.error(f"Error updating group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except InsufficientPermissionsError as e:
        logger.error(f"Error updating group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except GroupUpdateError as e:
        logger.error(f"Error updating group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )


@router.put("/{group_id}/change_role", status_code=status.HTTP_200_OK)
async def change_user_role_in_group(
    group_id: int,
    request: dict,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session.session_getter)
):
    """Изменить роль пользователя в группе (только для администраторов группы)"""
    logger.info(f"PUT /groups/{group_id}/change_role by user {current_user.id}")
    
    user_email = request.get("user_email")
    new_role = request.get("role")
    
    if not user_email or not new_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не указан email пользователя или новая роль"
        )
    
    # Преобразуем строку в enum
    from core.database.models import UserRole
    try:
        role_enum = UserRole(new_role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Недопустимая роль: {new_role}. Допустимые роли: admin, member, super_admin"
        )
    
    group_service = service_factory.get('group')
    
    try:
        await group_service.change_user_role(
            current_user_id=current_user.id,
            group_id=group_id,
            user_email=user_email,
            new_role=role_enum
        )
        return {"detail": "Роль успешно изменена"}
    except InsufficientPermissionsError as e:
        logger.error(f"Error changing role in group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except InvalidRoleError as e:
        logger.error(f"Error changing role in group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )
    except UserNotFoundInGroupError as e:
        logger.error(f"Error changing role in group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except GroupUpdateError as e:
        logger.error(f"Error changing role in group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )


@router.delete("/{group_id}/remove_users", response_model=GroupReadWithRelations)
async def remove_users_from_group(
    group_id: int,
    data: RemoveUsersFromGroup,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Удалить пользователей из группы (только для администраторов группы)"""
    logger.info(f"DELETE /groups/{group_id}/remove_users by user {current_user.id}")
    group_service = service_factory.get('group')
    
    try:
        updated_group = await group_service.remove_users_from_group(group_id, data, current_user)
        return updated_group
    except GroupNotFoundError as e:
        logger.error(f"Error removing users from group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except InsufficientPermissionsError as e:
        logger.error(f"Error removing users from group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except UserNotFoundInGroupError as e:
        logger.error(f"Error removing users from group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except (GroupUpdateError, GroupDeleteError) as e:
        logger.error(f"Error removing users from group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )


@router.delete("/{group_id}", status_code=status.HTTP_200_OK)
async def delete_group_by_id(
    group_id: int,
    service_factory: ServiceFactory = Depends(get_service_factory),
    current_user: User = Depends(get_current_user)
):
    """Удалить группу (только для администраторов группы)"""
    logger.info(f"DELETE /groups/{group_id} by user {current_user.id}")
    group_service = service_factory.get('group')
    
    try:
        deleted = await group_service.delete_group(group_id, current_user)
        if not deleted:
            logger.warning(f"Group {group_id} not found for deletion")
            raise GroupNotFoundError(group_id=group_id)
        logger.info(f"Group {group_id} deleted successfully")
        return {"detail": "Группа успешно удалена"}
    except GroupNotFoundError as e:
        logger.error(f"Error deleting group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.detail
        )
    except InsufficientPermissionsError as e:
        logger.error(f"Error deleting group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail
        )
    except GroupDeleteError as e:
        logger.error(f"Error deleting group {group_id}: {e.detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.detail
        )