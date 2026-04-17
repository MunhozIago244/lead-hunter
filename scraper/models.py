from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class LeadFilters(BaseModel):
    sem_site: bool = False
    categorias: list[str] = Field(default_factory=list)
    min_reviews: int = 0


class LeadSearchRequest(BaseModel):
    query: str
    location: str
    radius_km: float | None = None
    filters: LeadFilters = Field(default_factory=LeadFilters)
    limit: int = Field(default=20, ge=1, le=100)
    persist: bool = True


class LeadSearchResponse(BaseModel):
    total: int
    leads: list[dict[str, Any]]
    persisted: bool
    snapshot_path: str
    summary: dict[str, int]


class ValidateRequest(BaseModel):
    url: str
