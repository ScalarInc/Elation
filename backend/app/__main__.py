"""`uv run python -m app` starts the API on API_PORT (auto-reload in development)."""

import uvicorn

from app.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run("app.main:app", host="127.0.0.1", port=settings.api_port, reload=settings.is_development)
