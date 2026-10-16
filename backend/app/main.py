"""FastAPI application: CORS, error handlers and routers. Run with `uv run python -m app`."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.errors import register_error_handlers
from app.routers import (
    admin_clients,
    auth,
    budget,
    events,
    health,
    inspirations,
    inventory,
    me,
    messages,
    moodboards,
    oversight,
)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Elation X API",
        version="0.1.0",
        # Interactive docs only in development.
        docs_url="/docs" if settings.is_development else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.is_development else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url.rstrip("/")],
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_error_handlers(app)
    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(me.router, prefix="/api")
    app.include_router(admin_clients.router, prefix="/api")
    app.include_router(inventory.client_router, prefix="/api")
    app.include_router(inventory.admin_router, prefix="/api")
    app.include_router(events.router, prefix="/api")
    app.include_router(budget.router, prefix="/api")
    app.include_router(moodboards.router, prefix="/api")
    app.include_router(inspirations.client_router, prefix="/api")
    app.include_router(inspirations.admin_router, prefix="/api")
    app.include_router(messages.router, prefix="/api")
    app.include_router(oversight.router, prefix="/api")
    return app


app = create_app()
