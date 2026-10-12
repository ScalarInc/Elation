"""Database engine and per-request session."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


@lru_cache
def get_engine() -> Engine:
    # Created lazily so importing the app never opens a connection.
    return create_engine(get_settings().database_url, pool_pre_ping=True, pool_size=5, max_overflow=5)


@lru_cache
def _session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed."""
    session = new_session()
    try:
        yield session
    finally:
        session.close()


def new_session() -> Session:
    """Session for scripts outside a request. Use as `with new_session() as db:`."""
    return _session_factory()()


def check_database() -> bool:
    """True when a trivial query succeeds. Used by the health endpoint."""
    try:
        with get_engine().connect() as connection:
            connection.execute(text("select 1"))
        return True
    except Exception:
        return False
