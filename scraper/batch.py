"""
Batch scraper — runs multiple query/city combinations sequentially.

Usage:
    python scraper/batch.py
    python scraper/batch.py --config scraper/batch_config.json
    python scraper/batch.py --config scraper/batch_config.json --delay 90
    python scraper/batch.py --no-persist  # discovery only, no Supabase writes
    python scraper/batch.py --only-cities Campinas Sumaré
    python scraper/batch.py --only-queries dentista salao
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# Allow running from any directory
sys.path.insert(0, str(Path(__file__).parent))

from scraper import (
    PLAYWRIGHT_IMPORT_ERROR,
    REQUESTS_IMPORT_ERROR,
    SUPABASE_IMPORT_ERROR,
    TQDM_IMPORT_ERROR,
    create_supabase_client_from_env,
    ensure_runtime_dependencies,
    load_environment,
    normalize_city_arg,
    print_run_summary,
    run_discovery_pipeline,
    validate_runtime_env,
)

DEFAULT_CONFIG = Path(__file__).with_name("batch_config.json")
DEFAULT_DELAY_SECONDS = 60


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="lead-hunter batch scraper")
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help=f"Path to batch config JSON (default: {DEFAULT_CONFIG})",
    )
    parser.add_argument(
        "--delay",
        type=int,
        default=DEFAULT_DELAY_SECONDS,
        metavar="SECONDS",
        help=f"Delay between jobs in seconds (default: {DEFAULT_DELAY_SECONDS})",
    )
    parser.add_argument(
        "--no-persist",
        action="store_true",
        help="Run without writing results to Supabase",
    )
    parser.add_argument(
        "--only-cities",
        nargs="+",
        metavar="CITY",
        help="Only run jobs for these cities (case-insensitive substring match)",
    )
    parser.add_argument(
        "--only-queries",
        nargs="+",
        metavar="QUERY",
        help="Only run jobs matching these query terms (case-insensitive substring match)",
    )
    parser.add_argument(
        "--start-from",
        type=int,
        default=1,
        metavar="N",
        help="Skip the first N-1 jobs and start from job N (useful for resuming)",
    )
    return parser


def load_config(config_path: Path) -> list[dict]:
    if not config_path.exists():
        print(f"Erro: config nao encontrado em {config_path}", file=sys.stderr)
        sys.exit(1)

    with config_path.open(encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list) or not data:
        print("Erro: config deve ser uma lista nao-vazia de jobs.", file=sys.stderr)
        sys.exit(1)

    for i, job in enumerate(data):
        if not isinstance(job, dict) or "query" not in job or "city" not in job:
            print(f"Erro: job #{i+1} precisa ter 'query' e 'city'.", file=sys.stderr)
            sys.exit(1)

    return data


def filter_jobs(
    jobs: list[dict],
    only_cities: list[str] | None,
    only_queries: list[str] | None,
) -> list[dict]:
    filtered = jobs

    if only_cities:
        normalized = [c.lower() for c in only_cities]
        filtered = [
            job for job in filtered
            if any(term in job["city"].lower() for term in normalized)
        ]

    if only_queries:
        normalized = [q.lower() for q in only_queries]
        filtered = [
            job for job in filtered
            if any(term in job["query"].lower() for term in normalized)
        ]

    return filtered


def format_duration(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h:
        return f"{h}h {m}m {s}s"
    if m:
        return f"{m}m {s}s"
    return f"{s}s"


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    persist = not args.no_persist
    ensure_runtime_dependencies(require_supabase=persist)
    load_environment()

    missing_env = validate_runtime_env(require_supabase=persist)
    if missing_env:
        print("Erro: variaveis de ambiente obrigatorias ausentes.", file=sys.stderr)
        for item in missing_env:
            print(f"  * {item}", file=sys.stderr)
        return 1

    jobs = load_config(args.config)
    jobs = filter_jobs(jobs, args.only_cities, args.only_queries)

    if not jobs:
        print("Nenhum job corresponde aos filtros informados.")
        return 0

    # Apply --start-from
    start_index = max(0, args.start_from - 1)
    if start_index >= len(jobs):
        print(f"--start-from {args.start_from} excede o total de {len(jobs)} jobs.")
        return 1

    jobs = jobs[start_index:]
    total_jobs = len(jobs)
    skipped = args.start_from - 1

    client = None
    if persist:
        try:
            client = create_supabase_client_from_env(required=True)
        except Exception as exc:
            print(f"Erro ao conectar ao Supabase: {exc}", file=sys.stderr)
            return 1

    print("=" * 60)
    print("LEAD HUNTER — BATCH SCRAPER")
    print("=" * 60)
    print(f"Jobs no config : {total_jobs + skipped}")
    print(f"Jobs a executar: {total_jobs}" + (f" (pulando os primeiros {skipped})" if skipped else ""))
    print(f"Delay entre jobs: {args.delay}s")
    print(f"Persistir: {'sim' if persist else 'nao'}")
    print("=" * 60)

    totals = {
        "discovered": 0,
        "valid": 0,
        "new": 0,
        "updated": 0,
        "extraction_errors": 0,
        "analysis_errors": 0,
        "persistence_errors": 0,
        "job_errors": 0,
    }

    batch_start = time.perf_counter()

    for job_index, job in enumerate(jobs, start=1):
        raw_city = job["city"]
        query = job["query"].strip()
        max_results = int(job.get("max", 20))
        city = normalize_city_arg(raw_city)

        print(f"\n[{job_index + skipped}/{total_jobs + skipped}] {query} em {city} (max {max_results})")
        job_start = time.perf_counter()

        try:
            result = run_discovery_pipeline(
                query=query,
                city=city,
                max_results=max_results,
                persist=persist,
                client=client,
                show_progress=True,
            )

            elapsed = time.perf_counter() - job_start
            totals["discovered"] += result["discovered_count"]
            totals["valid"] += result["valid_count"]
            totals["new"] += result["new_count"]
            totals["updated"] += result["updated_count"]
            totals["extraction_errors"] += result["extraction_errors"]
            totals["analysis_errors"] += result["analysis_errors"]
            totals["persistence_errors"] += result["persistence_errors"]

            print(
                f"  → descobertos={result['discovered_count']} "
                f"validos={result['valid_count']} "
                f"novos={result['new_count']} "
                f"atualizados={result['updated_count']} "
                f"tempo={format_duration(elapsed)}"
            )

        except Exception as exc:
            totals["job_errors"] += 1
            print(f"  [ERRO] job falhou: {exc}", file=sys.stderr)

        if job_index < total_jobs:
            remaining_jobs = total_jobs - job_index
            elapsed_total = time.perf_counter() - batch_start
            eta_seconds = (elapsed_total / job_index) * remaining_jobs
            print(f"  Aguardando {args.delay}s antes do proximo job... (ETA: {format_duration(eta_seconds)})")
            time.sleep(args.delay)

    total_elapsed = time.perf_counter() - batch_start

    print("\n" + "=" * 60)
    print("RESUMO FINAL DO BATCH")
    print("=" * 60)
    print_run_summary(
        discovered_count=totals["discovered"],
        valid_count=totals["valid"],
        new_count=totals["new"],
        updated_count=totals["updated"],
        extraction_errors=totals["extraction_errors"],
        analysis_errors=totals["analysis_errors"],
        persistence_errors=totals["persistence_errors"],
    )
    print(f"- Jobs com erro: {totals['job_errors']}")
    print(f"- Tempo total: {format_duration(total_elapsed)}")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
