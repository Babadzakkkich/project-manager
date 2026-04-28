import base64
import json
import time
import jwt
import secrets
from typing import Optional, Dict, Any
from core.config.settings import settings
from core.logger import logger
import httpx
import requests


class LiveKitTokenGenerator:
    """Генератор JWT токенов для LiveKit"""
    
    def __init__(self, api_key: str, api_secret: str):
        self.api_key = api_key
        self.api_secret = api_secret
    
    def generate_token(
        self, 
        room_name: str, 
        user_id: int, 
        user_name: str, 
        is_admin: bool = False
    ) -> str:
        now = int(time.time())
        exp = now + 6 * 3600

        video_grant: Dict[str, Any] = {
            "room": room_name,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
        }

        # Разрешаем публикацию камеры, микрофона и экрана
        if is_admin:
            video_grant["canPublishSources"] = ["camera", "microphone", "screen_share", "screen_share_audio"]
        else:
            video_grant["canPublishSources"] = ["camera", "microphone", "screen_share"]

        payload = {
            "exp": exp,
            "iat": now,
            "nbf": now,
            "sub": str(user_id),
            "iss": self.api_key,
            "name": user_name,
            "video": video_grant,
            "metadata": json.dumps({
                "user_id": user_id,
                "is_admin": is_admin
            })
        }
        
        token = jwt.encode(payload, self.api_secret, algorithm="HS256")
            
        # ----- ДИАГНОСТИКА -----
        # Разбираем токен и печатаем его содержимое
        header, body, signature = token.split('.')
        # Дополняем padding, если нужно
        body += '=' * (-len(body) % 4)
        decoded_body = base64.urlsafe_b64decode(body).decode('utf-8')
        logger.info(f"Generated JWT Payload: {decoded_body}")
        # -----------------------

        return token

    def create_room(self, room_name: str) -> bool:
        """
        Создает комнату в LiveKit через HTTP API.
        """
        url = f"{settings.livekit.api_url}/twirp/livekit.RoomService/CreateRoom"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "name": room_name,
            "emptyTimeout": 3600,  # 1 час
            "maxParticipants": 30,
        }
        
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=5)
            if response.status_code == 200:
                logger.info(f"LiveKit room '{room_name}' created successfully")
                return True
            else:
                logger.error(f"Failed to create LiveKit room: {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error creating LiveKit room: {e}")
            return False

    def delete_room(self, room_name: str) -> bool:
        """Удаляет комнату в LiveKit."""
        import requests
        
        url = f"{settings.livekit.api_url}/twirp/livekit.RoomService/DeleteRoom"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {"name": room_name}
        
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=5)
            if response.status_code == 200:
                logger.info(f"LiveKit room '{room_name}' deleted successfully")
                return True
            else:
                logger.error(f"Failed to delete LiveKit room: {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error deleting LiveKit room: {e}")
            return False


def generate_room_name(prefix: str = "room") -> str:
    """Генерирует уникальное имя комнаты."""
    return f"{prefix}_{secrets.token_urlsafe(8)}"


# Глобальный экземпляр
livekit_token = LiveKitTokenGenerator(
    api_key=settings.livekit.api_key,
    api_secret=settings.livekit.api_secret
)