from __future__ import annotations

import json

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, Response

from models import LeadSearchRequest, LeadSearchResponse, ValidateRequest
from scraper import (
    LATEST_CSV_FILENAME,
    OUTPUT_DIR,
    create_supabase_client_from_env,
    ensure_runtime_dependencies,
    exportable_lead_record,
    load_environment,
    load_latest_snapshot,
    run_discovery_pipeline,
    validate_site_url,
)

app = FastAPI(
    title="Lead Hunter Local Scraper API",
    version="1.0.0",
    description=(
        "API local gratuita para descoberta de leads via scraping do Google Maps, "
        "analise local de site e persistencia opcional no Supabase."
    ),
)


@app.on_event("startup")
def on_startup() -> None:
    load_environment()
    ensure_runtime_dependencies(require_supabase=False)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/leads", response_model=LeadSearchResponse)
def create_leads(payload: LeadSearchRequest) -> LeadSearchResponse:
    query = payload.query.strip()
    location = payload.location.strip()

    if not query:
        raise HTTPException(status_code=400, detail="`query` nao pode ser vazio.")

    if not location:
        raise HTTPException(status_code=400, detail="`location` nao pode ser vazio.")

    client = None
    if payload.persist:
        try:
            client = create_supabase_client_from_env(required=True)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        result = run_discovery_pipeline(
            query=query,
            city=location,
            max_results=payload.limit,
            persist=payload.persist,
            client=client,
            filters=payload.filters.model_dump(),
            show_progress=False,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return LeadSearchResponse(
        total=len(result["leads"]),
        leads=[exportable_lead_record(lead) for lead in result["leads"]],
        persisted=payload.persist,
        snapshot_path=str(result["snapshot_path"]),
        summary={
            "discovered_count": result["discovered_count"],
            "valid_count": result["valid_count"],
            "new_count": result["new_count"],
            "updated_count": result["updated_count"],
            "extraction_errors": result["extraction_errors"],
            "analysis_errors": result["analysis_errors"],
            "persistence_errors": result["persistence_errors"],
        },
    )


@app.post("/validate")
def validate(payload: ValidateRequest) -> dict[str, object]:
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="`url` nao pode ser vazio.")

    try:
        return validate_site_url(url)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/export")
def export_data(format: str = Query(default="json", pattern="^(json|csv)$")) -> Response:
    if format == "csv":
        csv_path = OUTPUT_DIR / LATEST_CSV_FILENAME
        if not csv_path.exists():
            raise HTTPException(status_code=404, detail="Nenhum CSV exportado ainda.")

        return FileResponse(
            path=csv_path,
            media_type="text/csv",
            filename=csv_path.name,
        )

    try:
        payload = load_latest_snapshot()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return JSONResponse(content=json.loads(json.dumps(payload, ensure_ascii=False)))
