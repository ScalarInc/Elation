# syntax=docker/dockerfile:1.7
# Elation X backend — FastAPI + uv, built for Railway.
# Railway injects $PORT; the start command binds uvicorn to 0.0.0.0:$PORT.
# Migrations run as the pre-deploy step via railway.json, not on container start.

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

# Install uv (pinned via copy from the official image to avoid curl)
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

WORKDIR /app

# Install dependencies first for better layer caching.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Copy the app + migrations.
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

# Final install (installs the local project itself if pyproject declares one).
RUN uv sync --frozen --no-dev

ENV PATH="/opt/venv/bin:${PATH}"

# Railway sets $PORT at runtime; default to 8787 for local docker run.
ENV PORT=8787
EXPOSE 8787

# Start the FastAPI app directly — bypass app/__main__.py which hardcodes 127.0.0.1.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
