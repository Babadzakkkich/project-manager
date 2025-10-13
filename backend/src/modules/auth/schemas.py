from __future__ import annotations
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class TokenPayload(BaseModel):
    sub: int = Field(...)
    login: str = Field(...)
    type: str = Field(...)
    iat: Optional[int] = Field(None)
    exp: Optional[int] = Field(None)

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenRefresh(BaseModel):
    refresh_token: str

class TokenData(BaseModel):
    user_id: Optional[int] = None
    login: Optional[str] = None
    
class RefreshTokenCreate(BaseModel):
    token_hash: str
    user_id: int
    expires_at: datetime

class RefreshTokenMarkUsed(BaseModel):
    token_hash: str
    
class UserLogin(BaseModel):
    login: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)