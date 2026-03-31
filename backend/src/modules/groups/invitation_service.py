import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database.models import GroupInvitation, User, GroupMember, UserRole, Group
from core.logger import logger
from .exceptions import (
    GroupNotFoundError,
    UserAlreadyInGroupError,
    InvalidInvitationError,
    InvitationExpiredError,
    InvitationAlreadyProcessedError,
    UsersNotFoundError
)

if TYPE_CHECKING:
    from modules.notifications.service import NotificationTriggerService


class GroupInvitationService:
    """Сервис для управления приглашениями в группы"""
    
    def __init__(
        self,
        session: AsyncSession,
        notification_trigger: Optional['NotificationTriggerService'] = None
    ):
        self.session = session
        self.notification_trigger = notification_trigger
        self.logger = logger
    
    def _generate_token(self) -> str:
        """Генерация уникального токена для приглашения"""
        return secrets.token_urlsafe(48)
    
    async def create_invitation(
        self,
        group_id: int,
        invited_email: str,
        invited_by_id: int,
        role: UserRole = UserRole.MEMBER,
        expires_days: int = 7
    ) -> GroupInvitation:
        """
        Создание приглашения в группу
        """
        self.logger.info(f"Creating invitation for {invited_email} to group {group_id}")
        
        # Проверяем существование группы
        group_stmt = select(Group).where(Group.id == group_id)
        group_result = await self.session.execute(group_stmt)
        group = group_result.scalar_one_or_none()
        
        if not group:
            raise GroupNotFoundError(group_id=group_id)
        
        # Проверяем, существует ли уже пользователь с таким email
        user_stmt = select(User).where(User.email == invited_email)
        user_result = await self.session.execute(user_stmt)
        existing_user = user_result.scalar_one_or_none()
        
        if existing_user:
            # Проверяем, не состоит ли уже пользователь в группе
            member_stmt = select(GroupMember).where(
                and_(
                    GroupMember.user_id == existing_user.id,
                    GroupMember.group_id == group_id
                )
            )
            member_result = await self.session.execute(member_stmt)
            if member_result.scalar_one_or_none():
                raise UserAlreadyInGroupError(invited_email, group_id)
        
        # Проверяем, нет ли уже активного приглашения
        existing_invitation_stmt = select(GroupInvitation).where(
            and_(
                GroupInvitation.group_id == group_id,
                GroupInvitation.invited_email == invited_email,
                GroupInvitation.status == "pending",
                GroupInvitation.expires_at > datetime.now(timezone.utc)
            )
        )
        existing_result = await self.session.execute(existing_invitation_stmt)
        existing_invitation = existing_result.scalar_one_or_none()
        
        if existing_invitation:
            # Обновляем существующее приглашение
            existing_invitation.role = role
            existing_invitation.expires_at = datetime.now(timezone.utc) + timedelta(days=expires_days)
            existing_invitation.updated_at = datetime.now(timezone.utc)
            await self.session.commit()
            self.logger.info(f"Updated existing invitation for {invited_email}")
            return existing_invitation
        
        # Создаем новое приглашение
        invitation = GroupInvitation(
            group_id=group_id,
            invited_email=invited_email,
            invited_by_id=invited_by_id,
            role=role,
            token=self._generate_token(),
            expires_at=datetime.now(timezone.utc) + timedelta(days=expires_days),
            status="pending"
        )
        
        self.session.add(invitation)
        await self.session.commit()
        await self.session.refresh(invitation)
        
        self.logger.info(f"Invitation created for {invited_email} with token {invitation.token}")
        return invitation
    
    async def get_invitation_by_token(self, token: str) -> Optional[GroupInvitation]:
        """Получение приглашения по токену"""
        stmt = select(GroupInvitation).where(GroupInvitation.token == token)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
    
    async def accept_invitation(self, token: str, user_id: int) -> dict:
        """
        Принятие приглашения авторизованным пользователем
        """
        invitation = await self.get_invitation_by_token(token)
        
        if not invitation:
            raise InvalidInvitationError("Приглашение не найдено")
        
        # Проверяем срок действия
        if invitation.expires_at < datetime.now(timezone.utc):
            invitation.status = "expired"
            await self.session.commit()
            raise InvitationExpiredError("Срок действия приглашения истек")
        
        # Проверяем статус
        if invitation.status != "pending":
            raise InvitationAlreadyProcessedError(
                f"Приглашение уже {invitation.status}"
            )
        
        # Получаем пользователя
        user_stmt = select(User).where(User.id == user_id)
        user_result = await self.session.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        
        if not user:
            raise UsersNotFoundError(user_id=user_id)
        
        # Проверяем, что email совпадает
        if user.email != invitation.invited_email:
            # Можно разрешить принять приглашение даже если email не совпадает
            # но для безопасности лучше проверить
            self.logger.warning(
                f"User {user.email} trying to accept invitation for {invitation.invited_email}"
            )
            # Пока отклоняем
            raise InvalidInvitationError("Это приглашение предназначено для другого email адреса")
        
        # Проверяем, не состоит ли уже пользователь в группе
        member_stmt = select(GroupMember).where(
            and_(
                GroupMember.user_id == user_id,
                GroupMember.group_id == invitation.group_id
            )
        )
        member_result = await self.session.execute(member_stmt)
        existing_member = member_result.scalar_one_or_none()
        
        if existing_member:
            invitation.status = "already_member"
            await self.session.commit()
            return {
                "action": "already_member",
                "message": "Вы уже состоите в этой группе",
                "group": invitation.group
            }
        
        # Создаем членство в группе
        group_member = GroupMember(
            user_id=user_id,
            group_id=invitation.group_id,
            role=invitation.role
        )
        self.session.add(group_member)
        
        # Получаем группу
        group_stmt = select(Group).where(Group.id == invitation.group_id)
        group_result = await self.session.execute(group_stmt)
        group = group_result.scalar_one()
        
        # Обновляем статус приглашения
        invitation.status = "accepted"
        await self.session.commit()
        
        # Отправляем уведомление пригласившему
        if self.notification_trigger:
            invited_by_stmt = select(User).where(User.id == invitation.invited_by_id)
            invited_by_result = await self.session.execute(invited_by_stmt)
            invited_by = invited_by_result.scalar_one()
            
            await self.notification_trigger.on_user_accepted_invitation(
                group=group,
                new_user=user,
                invited_by=invited_by
            )
        
        self.logger.info(f"User {user_id} accepted invitation to group {invitation.group_id}")
        
        return {
            "action": "accepted",
            "message": "Вы успешно присоединились к группе",
            "group": group,
            "user_id": user_id
        }
    
    async def decline_invitation(self, token: str, user_id: Optional[int] = None) -> dict:
        """
        Отклонение приглашения
        """
        invitation = await self.get_invitation_by_token(token)
        
        if not invitation:
            raise InvalidInvitationError("Приглашение не найдено")
        
        if invitation.status != "pending":
            raise InvitationAlreadyProcessedError(
                f"Приглашение уже {invitation.status}"
            )
        
        invitation.status = "declined"
        await self.session.commit()
        
        # Отправляем уведомление пригласившему
        if self.notification_trigger:
            invited_by_stmt = select(User).where(User.id == invitation.invited_by_id)
            invited_by_result = await self.session.execute(invited_by_stmt)
            invited_by = invited_by_result.scalar_one()
            
            group_stmt = select(Group).where(Group.id == invitation.group_id)
            group_result = await self.session.execute(group_stmt)
            group = group_result.scalar_one()
            
            await self.notification_trigger.on_user_declined_invitation(
                group=group,
                invited_email=invitation.invited_email,
                invited_by=invited_by
            )
        
        self.logger.info(f"Invitation {token} declined")
        
        return {
            "action": "declined",
            "message": "Приглашение отклонено"
        }
    
    async def get_pending_invitations_for_email(self, email: str) -> list[GroupInvitation]:
        """Получение ожидающих приглашений для email"""
        stmt = select(GroupInvitation).options(
            selectinload(GroupInvitation.group),
            selectinload(GroupInvitation.invited_by)
        ).where(
            and_(
                GroupInvitation.invited_email == email,
                GroupInvitation.status == "pending",
                GroupInvitation.expires_at > datetime.now(timezone.utc)
            )
        ).order_by(GroupInvitation.created_at.desc())
        
        result = await self.session.execute(stmt)
        return result.scalars().all()
    
    async def cleanup_expired_invitations(self) -> int:
        """Очистка просроченных приглашений"""
        stmt = select(GroupInvitation).where(
            and_(
                GroupInvitation.status == "pending",
                GroupInvitation.expires_at < datetime.now(timezone.utc)
            )
        )
        result = await self.session.execute(stmt)
        expired = result.scalars().all()
        
        for invitation in expired:
            invitation.status = "expired"
        
        await self.session.commit()
        self.logger.info(f"Cleaned up {len(expired)} expired invitations")
        return len(expired)