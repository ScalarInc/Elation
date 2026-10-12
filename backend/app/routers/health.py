from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.db import check_database
from app.schemas.base import CamelModel

router = APIRouter(tags=["health"])


class HealthResponse(CamelModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "unavailable"]


@router.get("/health", response_model=HealthResponse)
def health(database_ok: Annotated[bool, Depends(check_database)]) -> JSONResponse:
    body = HealthResponse(status="ok" if database_ok else "degraded", database="ok" if database_ok else "unavailable")
    return JSONResponse(status_code=200 if database_ok else 503, content=body.model_dump(by_alias=True))
