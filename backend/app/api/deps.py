from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_token
from app.models import User, UserRole

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_student(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in [UserRole.STUDENT, UserRole.FACULTY, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


def require_faculty(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in [UserRole.FACULTY, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Faculty access required")
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
