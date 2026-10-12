import os

# Dummy values so tests never depend on (or touch) the real project. Environment
# variables take precedence over the root .env in pydantic-settings.
os.environ.update(
    {
        "NODE_ENV": "test",
        "SUPABASE_URL": "https://test-project.supabase.co",
        "SUPABASE_SECRET_KEY": "sb_secret_test",
        "DATABASE_URL": "postgresql://postgres:test@127.0.0.1:1/test",
        "FRONTEND_URL": "http://localhost:5173",
    }
)
