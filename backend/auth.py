import os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from models import User

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))
load_dotenv()

_configured_secret = os.getenv('SECRET_KEY')
if not _configured_secret or _configured_secret == 'mindcare_default_jwt_secret_key_change_me':
    import logging
    logging.getLogger('mindcare-auth').warning(
        "SECURITY NOTICE: Default or empty JWT SECRET_KEY is in use! Set a strong random SECRET_KEY in backend/.env before production deployment."
    )
SECRET_KEY = _configured_secret or 'mindcare_default_jwt_secret_key_change_me'
ALGORITHM = os.getenv('ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '1440'))

security_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({'exp': expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except (jwt.PyJWTError, Exception):
        return None


def get_current_user(
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Could not validate credentials or session expired. Please log in.',
        headers={'WWW-Authenticate': 'Bearer'},
    )
    if not auth_header or not auth_header.credentials:
        raise credentials_exception

    payload = decode_access_token(auth_header.credentials)
    if not payload:
        raise credentials_exception

    user_id = payload.get('sub')
    if user_id is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception

    if user.status and user.status.lower() == 'suspended':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Account suspended. Please contact support.'
        )

    return user


def get_current_admin_user(
    current_user: User = Depends(get_current_user)
) -> User:
    if current_user.role != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Access denied: Administrator privileges required.'
        )
    return current_user

