from __future__ import annotations

import argparse
import csv
import ipaddress
import json
import os
import random
import re
import socket
import sys
import time
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus, urlparse, urlunparse

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    def load_dotenv(*_args: Any, **_kwargs: Any) -> bool:
        return False

try:
    import requests
except ModuleNotFoundError as exc:
    requests = None
    REQUESTS_IMPORT_ERROR = exc
else:
    REQUESTS_IMPORT_ERROR = None

try:
    from playwright.sync_api import (
        Error as PlaywrightError,
        TimeoutError as PlaywrightTimeoutError,
        sync_playwright,
    )
except (ImportError, ModuleNotFoundError) as exc:
    sync_playwright = None
    PlaywrightError = Exception
    PlaywrightTimeoutError = Exception
    PLAYWRIGHT_IMPORT_ERROR = exc
else:
    PLAYWRIGHT_IMPORT_ERROR = None

try:
    from supabase import Client, create_client
except (ImportError, ModuleNotFoundError) as exc:
    Client = Any
    create_client = None
    SUPABASE_IMPORT_ERROR = exc
else:
    SUPABASE_IMPORT_ERROR = None

try:
    from tf_playwright_stealth import stealth_sync as apply_stealth_to_page
except (ImportError, ModuleNotFoundError):
    apply_stealth_to_page = None

try:
    from tqdm import tqdm
except ModuleNotFoundError as exc:
    tqdm = None
    TQDM_IMPORT_ERROR = exc
else:
    TQDM_IMPORT_ERROR = None


GOOGLE_MAPS_SEARCH_BASE_URL = "https://www.google.com/maps/search/"
REQUEST_TIMEOUT_SECONDS = 30
PLAYWRIGHT_TIMEOUT_MS = 30_000
MAPS_MAX_SCROLLS = 12
MAPS_MIN_SCROLL_DELAY_MS = 1200
MAPS_MAX_SCROLL_DELAY_MS = 2200
SUPABASE_URL_ENV_NAMES = ("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
REQUIRED_RUNTIME_ENV_VARS = ("SUPABASE_SERVICE_ROLE_KEY",)
SCRAPER_OWNED_FIELDS = {
    "name",
    "segment",
    "city",
    "address",
    "phone",
    "email",
    "site",
    "has_site",
    "score_mobile",
    "score_speed",
    "score_seo",
    "score_design",
    "problems",
}
USER_OWNED_FIELDS = {
    "pitch",
    "status",
    "contact_channel",
    "notes",
}
LEAD_UPSERT_FIELDS = SCRAPER_OWNED_FIELDS | USER_OWNED_FIELDS
SOCIAL_PLATFORM_DOMAINS = (
    "facebook.com",
    "instagram.com",
    "linktr.ee",
    "linktree.com",
    "wa.me",
    "whatsapp.com",
    "api.whatsapp.com",
)
ALLOWED_ANALYSIS_SCHEMES = {"http", "https"}
ALLOWED_ANALYSIS_PORTS = {None, 80, 443}
DISALLOWED_HOST_SUFFIXES = (
    ".arpa",
    ".home",
    ".internal",
    ".lan",
    ".local",
    ".localhost",
    ".localdomain",
)
BLOCKED_TITLE_MARKERS = (
    "just a moment",
    "attention required",
    "verify you are human",
    "checking your browser",
    "acesso negado",
    "captcha",
)
BLOCKED_BODY_MARKERS = (
    "cf-browser-verification",
    "turnstile",
    "attention required",
    "checking your browser",
    "verify you are human",
    "captcha",
    "acesso negado",
)
MAPS_CONSENT_BUTTON_LABELS = (
    "Aceitar tudo",
    "Accept all",
    "I agree",
    "Concordo",
)
DEFAULT_BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
)
GENERIC_FONT_MARKERS = {
    "arial",
    "helvetica",
    "times",
    "times new roman",
    "georgia",
    "verdana",
    "tahoma",
    "trebuchet ms",
    "courier",
    "courier new",
    "system-ui",
    "sans-serif",
    "serif",
    "monospace",
}
PHONE_PATTERN = re.compile(r"\+?\d[\d\s().-]{7,}")
EMAIL_PATTERN = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
WORD_PATTERN = re.compile(r"[0-9A-Za-zÀ-ÿ]{2,}")
CEP_PATTERN = re.compile(r"^\d{5}-?\d{3}$")
OUTPUT_DIR = Path(__file__).with_name("output")
LATEST_JSON_FILENAME = "latest_leads.json"
LATEST_CSV_FILENAME = "latest_leads.csv"


def resolve_cep_to_city(cep: str) -> str | None:
    """Resolve a Brazilian CEP to 'City - UF' via ViaCEP. Returns None on failure."""
    if requests is None:
        return None

    normalized = cep.replace("-", "").strip()
    if len(normalized) != 8 or not normalized.isdigit():
        return None

    try:
        response = requests.get(
            f"https://viacep.com.br/ws/{normalized}/json/",
            timeout=5,
            headers={"User-Agent": DEFAULT_BROWSER_USER_AGENT},
        )
        response.raise_for_status()
        data = response.json()
        if data.get("erro"):
            return None
        localidade = (data.get("localidade") or "").strip()
        uf = (data.get("uf") or "").strip()
        if localidade and uf:
            return f"{localidade} - {uf}"
        return localidade or None
    except Exception:
        return None


def normalize_city_arg(raw_city: str) -> str:
    """If raw_city looks like a CEP, resolve it to a city name. Otherwise return as-is."""
    stripped = raw_city.strip()
    if CEP_PATTERN.match(stripped):
        resolved = resolve_cep_to_city(stripped)
        if resolved:
            print(f"- CEP {stripped} resolvido para: {resolved}")
            return resolved
        print(
            f"[aviso] CEP {stripped} nao pode ser resolvido via ViaCEP. Usando o valor original.",
            file=sys.stderr,
        )
    return stripped


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="lead-hunter scraper")
    parser.add_argument(
        "--query",
        required=True,
        help="Business niche to search (e.g. dentista)",
    )
    parser.add_argument(
        "--city",
        required=True,
        help="City or area to search in (e.g. Campinas or 13010-000)",
    )
    parser.add_argument(
        "--max",
        type=int,
        default=20,
        dest="max_results",
        help="Maximum number of results to fetch (default: 20)",
    )
    parser.add_argument(
        "--no-persist",
        action="store_true",
        help="Run discovery without writing results to Supabase",
    )
    return parser


def load_environment() -> Path | None:
    local_env = Path(__file__).with_name(".env")
    project_env = Path(__file__).resolve().parents[1] / ".env.local"

    if local_env.exists():
        load_dotenv(local_env)
        return local_env

    if project_env.exists():
        load_dotenv(project_env)
        return project_env

    load_dotenv()
    return None


def ensure_runtime_dependencies(*, require_supabase: bool = True) -> None:
    missing: list[str] = []

    if REQUESTS_IMPORT_ERROR is not None:
        missing.append("requests")

    if PLAYWRIGHT_IMPORT_ERROR is not None:
        missing.append("playwright")

    if require_supabase and SUPABASE_IMPORT_ERROR is not None:
        missing.append("supabase")

    if TQDM_IMPORT_ERROR is not None:
        missing.append("tqdm")

    if missing:
        joined = ", ".join(missing)
        raise RuntimeError(
            f"Missing Python dependencies: {joined}. "
            "Run `pip install -r scraper/requirements.txt` first."
        )


def get_env(name: str, *fallbacks: str) -> str | None:
    for candidate in (name, *fallbacks):
        value = os.getenv(candidate)
        if value:
            return value
    return None


def get_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default

    return value.strip().lower() not in {"0", "false", "no", "off"}


def validate_runtime_env(*, require_supabase: bool) -> list[str]:
    missing: list[str] = []

    if require_supabase:
        missing.extend(
            key for key in REQUIRED_RUNTIME_ENV_VARS if not os.getenv(key)
        )
        if not get_env(SUPABASE_URL_ENV_NAMES[0], *SUPABASE_URL_ENV_NAMES[1:]):
            missing.append("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL")

    return missing


def normalize_score(value: Any) -> int | None:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        numeric = float(value)
    else:
        return None

    if 0 <= numeric <= 1:
        numeric *= 100

    numeric = max(0, min(numeric, 100))
    return int(round(numeric))


def append_problem(problems: list[str], message: str) -> None:
    if message and message not in problems and len(problems) < 5:
        problems.append(message)


def sanitize_lead_for_storage(lead: dict[str, Any]) -> dict[str, Any]:
    return {key: lead.get(key) for key in LEAD_UPSERT_FIELDS if key in lead}


def merge_user_owned_fields(
    lead: dict[str, Any],
    existing_row: dict[str, Any] | None,
) -> dict[str, Any]:
    if not existing_row:
        return lead

    preserved_fields = {
        field: existing_row.get(field)
        for field in USER_OWNED_FIELDS
        if field in existing_row
    }
    return {**lead, **preserved_fields}


def format_score(score: int | None) -> str:
    return "--" if score is None else str(score)


def get_analysis_state(lead: dict[str, Any]) -> str:
    if not lead.get("has_site"):
        return "sem-site"

    if lead.get("_blocked_reason"):
        return "bloqueado"

    if lead.get("problems") == ["Empresa depende apenas de perfil social"]:
        return "social"

    scores = (
        lead.get("score_mobile"),
        lead.get("score_speed"),
        lead.get("score_seo"),
        lead.get("score_design"),
    )
    if any(score is None for score in scores):
        return "parcial"

    return "ok"


def build_lead_log_message(
    lead: dict[str, Any],
    save_status: str,
    index: int,
    total: int,
) -> str:
    score_block = "/".join(
        (
            format_score(lead.get("score_mobile")),
            format_score(lead.get("score_speed")),
            format_score(lead.get("score_seo")),
            format_score(lead.get("score_design")),
        )
    )
    site_label = "sim" if lead.get("has_site") else "nao"
    analysis_label = get_analysis_state(lead)

    return (
        f"[{index}/{total}] {lead['name']} - {save_status} "
        f"| site={site_label} | analise={analysis_label} | scores={score_block}"
    )


def validate_supabase_connection(client: Client) -> None:
    try:
        response = client.table("leads").select("id").limit(1).execute()
    except Exception as exc:
        raise RuntimeError(
            "Falha ao validar conexao com Supabase para a tabela `leads`. "
            "Confira SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e "
            "SUPABASE_SERVICE_ROLE_KEY."
        ) from exc

    if not hasattr(response, "data"):
        raise RuntimeError(
            "Supabase respondeu de forma inesperada ao validar a tabela `leads`."
        )


def create_supabase_client_from_env(*, required: bool) -> Client | None:
    if SUPABASE_IMPORT_ERROR is not None:
        if required:
            raise RuntimeError(
                "Dependencia `supabase` ausente. Rode `pip install -r scraper/requirements.txt`."
            ) from SUPABASE_IMPORT_ERROR
        return None

    supabase_url = get_env(SUPABASE_URL_ENV_NAMES[0], *SUPABASE_URL_ENV_NAMES[1:])
    supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_service_role_key:
        if required:
            raise RuntimeError(
                "SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e "
                "SUPABASE_SERVICE_ROLE_KEY sao obrigatorios."
            )
        return None

    client: Client = create_client(supabase_url, supabase_service_role_key)
    validate_supabase_connection(client)
    return client


def get_existing_lead_row(
    client: Client,
    lead: dict[str, Any],
) -> dict[str, Any] | None:
    response = (
        client.table("leads")
        .select("id,pitch,status,contact_channel,notes")
        .eq("name", lead["name"])
        .eq("city", lead["city"])
        .limit(1)
        .execute()
    )

    return response.data[0] if response.data else None


def print_run_summary(
    *,
    discovered_count: int,
    valid_count: int,
    new_count: int,
    updated_count: int,
    extraction_errors: int,
    analysis_errors: int,
    persistence_errors: int,
) -> None:
    total_errors = extraction_errors + analysis_errors + persistence_errors

    print("\nConcluido:")
    print(f"- Descobertos: {discovered_count}")
    print(f"- Leads validos: {valid_count}")
    print(f"- Novos: {new_count}")
    print(f"- Atualizados: {updated_count}")
    print(f"- Erros de extracao: {extraction_errors}")
    print(f"- Erros de analise: {analysis_errors}")
    print(f"- Erros de persistencia: {persistence_errors}")
    print(f"- Erros totais: {total_errors}")


def run_meaningfully_failed(
    *,
    discovered_count: int,
    success_count: int,
    extraction_errors: int,
    analysis_errors: int,
    persistence_errors: int,
) -> bool:
    total_errors = extraction_errors + analysis_errors + persistence_errors

    if discovered_count == 0:
        return False

    if success_count == 0 and total_errors > 0:
        return True

    return False


@lru_cache(maxsize=512)
def resolve_host_addresses(hostname: str) -> tuple[str, ...]:
    try:
        resolved = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return ()

    addresses: list[str] = []
    for item in resolved:
        address = item[4][0]
        if address not in addresses:
            addresses.append(address)

    return tuple(addresses)


def is_global_ip_address(value: str) -> bool:
    try:
        ip_address = ipaddress.ip_address(value)
    except ValueError:
        return False

    return ip_address.is_global


def has_disallowed_hostname_pattern(hostname: str) -> bool:
    normalized = hostname.strip(".").lower()

    if not normalized or normalized == "localhost":
        return True

    if "." not in normalized:
        return True

    return any(normalized.endswith(suffix) for suffix in DISALLOWED_HOST_SUFFIXES)


def normalize_public_website_url(raw_url: str) -> str:
    candidate = raw_url.strip()

    if not candidate:
        raise ValueError("URL vazia")

    if any(char in candidate for char in ("\r", "\n", "\t", "\\")):
        raise ValueError("URL contem caracteres suspeitos")

    if "://" not in candidate:
        candidate = f"https://{candidate}"

    parsed = urlparse(candidate)
    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").strip().lower()

    if scheme not in ALLOWED_ANALYSIS_SCHEMES:
        raise ValueError(f"esquema nao permitido: {scheme or 'vazio'}")

    if parsed.username or parsed.password:
        raise ValueError("URL com credenciais embutidas")

    if not hostname:
        raise ValueError("host ausente")

    if parsed.port not in ALLOWED_ANALYSIS_PORTS:
        raise ValueError(f"porta nao permitida: {parsed.port}")

    if has_disallowed_hostname_pattern(hostname):
        raise ValueError(f"host privado ou nao publico: {hostname}")

    if is_global_ip_address(hostname) is False:
        try:
            ipaddress.ip_address(hostname)
        except ValueError:
            resolved_addresses = resolve_host_addresses(hostname)
            if not resolved_addresses:
                raise ValueError(f"host nao resolvido com seguranca: {hostname}")

            if any(not is_global_ip_address(address) for address in resolved_addresses):
                raise ValueError(f"host resolve para IP nao publico: {hostname}")
        else:
            raise ValueError(f"IP nao publico ou reservado: {hostname}")

    safe_netloc = hostname if parsed.port is None else f"{hostname}:{parsed.port}"

    return urlunparse(
        (
            scheme,
            safe_netloc,
            parsed.path or "",
            "",
            "",
            "",
        )
    )


def is_social_platform_url(site_url: str) -> bool:
    host = urlparse(site_url).netloc.lower()
    return any(domain in host for domain in SOCIAL_PLATFORM_DOMAINS)


def detect_blocked_page(title: str | None, html: str | None, current_url: str) -> bool:
    normalized_title = (title or "").strip().lower()
    normalized_html = (html or "").lower()
    normalized_url = current_url.lower()

    if any(marker in normalized_title for marker in BLOCKED_TITLE_MARKERS):
        return True

    if any(marker in normalized_html for marker in BLOCKED_BODY_MARKERS):
        return True

    return any(marker in normalized_url for marker in ("captcha", "challenge", "login"))


def has_custom_font(font_families: list[str] | None) -> bool:
    if not font_families:
        return False

    for family in font_families:
        raw_parts = [part.strip(" '\"").lower() for part in family.split(",")]
        meaningful_parts = [part for part in raw_parts if part]
        if not meaningful_parts:
            continue

        first_font = meaningful_parts[0]
        if first_font not in GENERIC_FONT_MARKERS:
            return True

    return False


def build_no_site_analysis() -> dict[str, Any]:
    return {
        "score_mobile": 0,
        "score_speed": 0,
        "score_seo": 0,
        "score_design": 0,
        "problems": ["Empresa sem presença digital"],
    }


def build_social_presence_analysis() -> dict[str, Any]:
    return {
        "score_mobile": 0,
        "score_speed": 0,
        "score_seo": 0,
        "score_design": 0,
        "problems": ["Empresa depende apenas de perfil social"],
    }


def build_blocked_analysis(reason: str) -> dict[str, Any]:
    return {
        "score_mobile": None,
        "score_speed": None,
        "score_seo": None,
        "score_design": None,
        "problems": None,
        "_blocked_reason": reason,
    }


def build_maps_search_url(query: str, location: str) -> str:
    search_text = f"{query} em {location}".strip()
    return f"{GOOGLE_MAPS_SEARCH_BASE_URL}{quote_plus(search_text)}"


def clean_text(value: str | None) -> str | None:
    if not value:
        return None

    collapsed = re.sub(r"\s+", " ", value).strip()
    return collapsed or None


def strip_known_prefixes(value: str | None) -> str | None:
    cleaned = clean_text(value)
    if not cleaned:
        return None

    patterns = (
        r"^(telefone|phone|ligar|call)\s*:?\s*",
        r"^(endere[cç]o|address)\s*:?\s*",
        r"^(site|website)\s*:?\s*",
    )

    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"^[^\w\d]+", "", cleaned)
    return cleaned.strip() or None


def extract_phone_value(value: str | None) -> str | None:
    if not value:
        return None

    match = PHONE_PATTERN.search(value)
    if not match:
        return None

    return clean_text(match.group(0))


def parse_rating_value(value: str | None) -> float | None:
    if not value:
        return None

    match = re.search(r"(\d(?:[.,]\d)?)", value)
    if not match:
        return None

    try:
        return float(match.group(1).replace(",", "."))
    except ValueError:
        return None


def parse_review_count(value: str | None) -> int | None:
    if not value:
        return None

    match = re.search(r"(\d[\d.,]*)\s*(?:avalia|review)", value, flags=re.IGNORECASE)
    if not match:
        return None

    digits = re.sub(r"[^\d]", "", match.group(1))
    if not digits:
        return None

    try:
        return int(digits)
    except ValueError:
        return None


def weighted_average_scores(parts: list[tuple[int | None, int]]) -> int | None:
    available_weight = sum(weight for score, weight in parts if score is not None)
    if available_weight == 0:
        return None

    total = sum(score * weight for score, weight in parts if score is not None)
    return int(round(total / available_weight))


def score_response_time(response_time_ms: int | None) -> int | None:
    if response_time_ms is None:
        return None

    if response_time_ms <= 1200:
        return 100
    if response_time_ms <= 2000:
        return 85
    if response_time_ms <= 3000:
        return 65
    if response_time_ms <= 4500:
        return 45
    if response_time_ms <= 6500:
        return 25
    return 10


def extract_text_from_html(html_content: str) -> str:
    without_scripts = re.sub(
        r"<(script|style|noscript).*?>.*?</\1>",
        " ",
        html_content,
        flags=re.IGNORECASE | re.DOTALL,
    )
    without_tags = re.sub(r"<[^>]+>", " ", without_scripts)
    return re.sub(r"\s+", " ", without_tags).strip()


def build_site_recommendation(
    score_mobile: int | None,
    score_speed: int | None,
    score_seo: int | None,
    score_design: int | None,
) -> str:
    overall = weighted_average_scores(
        [
            (score_mobile, 25),
            (score_speed, 25),
            (score_seo, 25),
            (score_design, 25),
        ]
    )

    if overall is None:
        return "Analise parcial; o site precisa de revisao manual."
    if overall <= 40:
        return "Site fraco; lead quente para proposta imediata."
    if overall <= 70:
        return "Site mediano; vale abordar com proposta consultiva."
    return "Site solido; lead frio para servico basico de website."


def log_analysis_warning(lead_name: str, message: str) -> None:
    tqdm.write(f"[analysis] {lead_name} - {message}")


def random_scroll_delay(page: Any) -> None:
    page.wait_for_timeout(
        random.randint(MAPS_MIN_SCROLL_DELAY_MS, MAPS_MAX_SCROLL_DELAY_MS)
    )


def apply_stealth(page: Any) -> None:
    if apply_stealth_to_page is not None:
        apply_stealth_to_page(page)


def dismiss_google_consent(page: Any) -> None:
    for label in MAPS_CONSENT_BUTTON_LABELS:
        try:
            button = page.get_by_role("button", name=label).first
            button.click(timeout=2_000)
            page.wait_for_timeout(1_000)
            return
        except PlaywrightError:
            continue


def collect_result_links(page: Any, max_results: int) -> list[str]:
    links = page.evaluate(
        """
        () => {
          const candidates = Array.from(document.querySelectorAll('a[href]'));
          const collected = [];
          for (const node of candidates) {
            const href = node.href || "";
            if (!href) continue;
            if (
              href.includes('/maps/place/') ||
              href.includes('/maps?cid=') ||
              href.includes('/maps/place/?q=')
            ) {
              collected.push(href);
            }
          }
          return Array.from(new Set(collected));
        }
        """
    )

    if not isinstance(links, list):
        return []

    return [link for link in links if isinstance(link, str)][:max_results]


def scroll_results_feed(page: Any) -> None:
    page.evaluate(
        """
        () => {
          const feed = document.querySelector('[role="feed"]');
          if (feed) {
            feed.scrollBy(0, feed.scrollHeight);
            return;
          }

          const panel = document.querySelector('div[aria-label][tabindex="0"]');
          if (panel) {
            panel.scrollBy(0, panel.scrollHeight);
            return;
          }

          window.scrollBy(0, window.innerHeight * 2);
        }
        """
    )


def search_places(
    query: str,
    city: str,
    max_results: int,
) -> list[dict[str, Any]]:
    headless = get_bool_env("SCRAPER_HEADLESS", True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent=DEFAULT_BROWSER_USER_AGENT,
            locale="pt-BR",
            viewport={"width": 1365, "height": 900},
        )

        search_page = context.new_page()
        detail_page = context.new_page()
        search_page.set_default_timeout(PLAYWRIGHT_TIMEOUT_MS)
        detail_page.set_default_timeout(PLAYWRIGHT_TIMEOUT_MS)
        apply_stealth(search_page)
        apply_stealth(detail_page)

        try:
            search_page.goto(
                build_maps_search_url(query, city),
                wait_until="domcontentloaded",
            )
            dismiss_google_consent(search_page)
            random_scroll_delay(search_page)

            if "/maps/place/" in search_page.url:
                candidate_urls = [search_page.url]
            else:
                candidate_urls: list[str] = []
                stagnant_rounds = 0

                for _ in range(MAPS_MAX_SCROLLS):
                    discovered_links = collect_result_links(search_page, max_results * 3)
                    previous_count = len(candidate_urls)

                    for link in discovered_links:
                        if link not in candidate_urls:
                            candidate_urls.append(link)

                    if len(candidate_urls) >= max_results:
                        break

                    if len(candidate_urls) == previous_count:
                        stagnant_rounds += 1
                    else:
                        stagnant_rounds = 0

                    if stagnant_rounds >= 3:
                        break

                    scroll_results_feed(search_page)
                    random_scroll_delay(search_page)

            results: list[dict[str, Any]] = []
            seen_names: set[str] = set()

            for maps_url in candidate_urls[:max_results]:
                try:
                    detail_page.goto(maps_url, wait_until="domcontentloaded")
                    try:
                        detail_page.wait_for_load_state("networkidle", timeout=5_000)
                    except PlaywrightTimeoutError:
                        pass

                    payload = detail_page.evaluate(
                        """
                        () => {
                          const readText = (node) => {
                            if (!node) return null;
                            const text =
                              node.innerText ||
                              node.textContent ||
                              node.getAttribute?.("aria-label") ||
                              "";
                            const cleaned = text.replace(/\\s+/g, " ").trim();
                            return cleaned || null;
                          };

                          const selectText = (selectors) => {
                            for (const selector of selectors) {
                              const node = document.querySelector(selector);
                              const text = readText(node);
                              if (text) return text;
                            }
                            return null;
                          };

                          const dataItemNode = (matcher) => {
                            return Array.from(document.querySelectorAll("[data-item-id]")).find((node) => {
                              const value = (node.getAttribute("data-item-id") || "").toLowerCase();
                              if (typeof matcher === "string") {
                                return value === matcher;
                              }
                              return value.startsWith(matcher);
                            }) || null;
                          };

                          const websiteNode = Array.from(document.querySelectorAll("a[href]")).find((node) => {
                            const itemId = (node.getAttribute("data-item-id") || "").toLowerCase();
                            const href = node.href || "";
                            return (
                              itemId.includes("authority") ||
                              itemId === "authority" ||
                              (
                                /^https?:\\/\\//i.test(href) &&
                                !href.includes("google.com/maps") &&
                                !href.includes("googleusercontent.com")
                              )
                            );
                          }) || null;

                          const reviewNode = Array.from(document.querySelectorAll("button, span, div")).find((node) => {
                            const text = readText(node);
                            return !!text && /\\d[\\d.,]*\\s*(avalia|review)/i.test(text);
                          }) || null;

                          const ratingNode = Array.from(document.querySelectorAll("[aria-label], span, div")).find((node) => {
                            const text =
                              node.getAttribute?.("aria-label") ||
                              readText(node) ||
                              "";
                            return /\\d(?:[.,]\\d)\\s*(estrel|star)/i.test(text);
                          }) || null;

                          const categoryNode = Array.from(document.querySelectorAll("button, span, div")).find((node) => {
                            const text = readText(node);
                            const jsAction = (node.getAttribute?.("jsaction") || "").toLowerCase();
                            if (!text) return false;
                            return (
                              jsAction.includes("pane.rating.category") ||
                              jsAction.includes("category") ||
                              (
                                text.length < 80 &&
                                !/avalia/i.test(text) &&
                                !/endere|phone|site|website/i.test(text)
                              )
                            );
                          }) || null;

                          return {
                            name: selectText(["h1", "h1 span"]),
                            address: readText(dataItemNode("address")),
                            phone: readText(dataItemNode("phone:tel:")),
                            websiteText: readText(websiteNode),
                            websiteHref: websiteNode ? websiteNode.href || null : null,
                            category: readText(categoryNode),
                            ratingText: ratingNode ? (ratingNode.getAttribute?.("aria-label") || readText(ratingNode)) : null,
                            reviewText: readText(reviewNode),
                            mapsUrl: window.location.href,
                          };
                        }
                        """
                    )

                    if not isinstance(payload, dict):
                        continue

                    name = clean_text(payload.get("name"))
                    if not name or name in seen_names:
                        continue

                    seen_names.add(name)
                    results.append(
                        {
                            "displayName": {"text": name},
                            "formattedAddress": strip_known_prefixes(
                                payload.get("address")
                            )
                            or "",
                            "internationalPhoneNumber": extract_phone_value(
                                payload.get("phone")
                            )
                            or "",
                            "websiteUri": payload.get("websiteHref")
                            or payload.get("websiteText")
                            or "",
                            "_mapsCategory": strip_known_prefixes(
                                payload.get("category")
                            ),
                            "_mapsRating": parse_rating_value(
                                payload.get("ratingText")
                            ),
                            "_mapsReviewCount": parse_review_count(
                                payload.get("reviewText")
                            ),
                            "_mapsUrl": payload.get("mapsUrl") or maps_url,
                        }
                    )
                except PlaywrightError:
                    continue

            return results[:max_results]
        finally:
            context.close()
            browser.close()


def extract_lead(place: dict[str, Any], segment: str, city: str) -> dict[str, Any]:
    name = place.get("displayName", {}).get("text", "").strip()
    if not name:
        raise ValueError("Place response missing displayName.text")

    address = place.get("formattedAddress", "").strip()
    phone = place.get("internationalPhoneNumber", "").strip() or None
    raw_site = place.get("websiteUri", "").strip() or None
    site = None
    site_rejected_reason = None

    if not phone and raw_site:
        phone = extract_phone_value(raw_site) or None

    if raw_site:
        try:
            site = normalize_public_website_url(raw_site)
        except ValueError as exc:
            site_rejected_reason = str(exc)

    has_site = site is not None
    category = clean_text(place.get("_mapsCategory"))
    if category and re.search(r"estrel|rating|review|avalia", category, re.IGNORECASE):
        category = None

    return {
        "name": name,
        "segment": segment,
        "city": city,
        "address": address or None,
        "phone": phone,
        "email": None,
        "site": site,
        "has_site": has_site,
        "_site_rejected_reason": site_rejected_reason,
        "_maps_category": category,
        "_maps_rating": place.get("_mapsRating"),
        "_maps_review_count": place.get("_mapsReviewCount"),
        "_maps_url": place.get("_mapsUrl"),
    }


def analyze_site_locally(site_url: str) -> dict[str, Any]:
    try:
        safe_site_url = normalize_public_website_url(site_url)
    except ValueError as exc:
        return {
            "score_speed": None,
            "_seo_base_score": None,
            "_site_fetch_error": str(exc),
            "_response_time_ms": None,
            "_has_contact_info": None,
            "_word_count": None,
            "_final_url": None,
            "_is_https": None,
        }

    headers = {
        "User-Agent": DEFAULT_BROWSER_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    started = time.perf_counter()
    try:
        response = requests.get(
            safe_site_url,
            headers=headers,
            timeout=(5, 12),
            allow_redirects=True,
        )
        elapsed_ms = int(round((time.perf_counter() - started) * 1000))
        response.raise_for_status()
    except requests.RequestException as exc:
        return {
            "score_speed": None,
            "_seo_base_score": None,
            "_site_fetch_error": str(exc),
            "_response_time_ms": None,
            "_has_contact_info": None,
            "_word_count": None,
            "_final_url": None,
            "_is_https": None,
        }

    final_url = response.url or safe_site_url
    try:
        safe_final_url = normalize_public_website_url(final_url)
    except ValueError as exc:
        return {
            "score_speed": None,
            "_seo_base_score": None,
            "_site_fetch_error": str(exc),
            "_response_time_ms": elapsed_ms,
            "_has_contact_info": None,
            "_word_count": None,
            "_final_url": None,
            "_is_https": None,
        }

    html_content = response.text or ""
    visible_text = extract_text_from_html(html_content)
    has_contact_info = bool(
        PHONE_PATTERN.search(html_content)
        or EMAIL_PATTERN.search(html_content)
        or "whatsapp" in html_content.lower()
    )
    word_count = len(WORD_PATTERN.findall(visible_text))
    score_speed = score_response_time(elapsed_ms)
    is_https = safe_final_url.lower().startswith("https://")

    seo_base = weighted_average_scores(
        [
            (100 if is_https else 25, 25),
            (100 if has_contact_info else 30, 30),
            (
                100
                if word_count >= 250
                else 70
                if word_count >= 120
                else 40
                if word_count >= 60
                else 15,
                25,
            ),
            (score_speed, 20),
        ]
    )

    return {
        "score_speed": score_speed,
        "_seo_base_score": seo_base,
        "_site_fetch_error": None,
        "_response_time_ms": elapsed_ms,
        "_has_contact_info": has_contact_info,
        "_word_count": word_count,
        "_final_url": safe_final_url,
        "_is_https": is_https,
    }


def analyze_with_playwright(site_url: str) -> dict[str, Any]:
    try:
        safe_site_url = normalize_public_website_url(site_url)
    except ValueError as exc:
        return {
            "is_social_platform": False,
            "has_whatsapp_cta": None,
            "has_title": None,
            "has_description": None,
            "has_og_tags": None,
            "has_viewport_meta": None,
            "has_favicon": None,
            "is_https": None,
            "has_custom_font": None,
            "image_count": None,
            "images_without_alt": None,
            "copyright_year": None,
            "_playwright_error": str(exc),
            "_site_blocked": False,
        }

    if is_social_platform_url(safe_site_url):
        return {
            "is_social_platform": True,
            "has_whatsapp_cta": None,
            "has_title": None,
            "has_description": None,
            "has_og_tags": None,
            "has_viewport_meta": None,
            "has_favicon": None,
            "is_https": safe_site_url.lower().startswith("https://"),
            "has_custom_font": None,
            "image_count": None,
            "images_without_alt": None,
            "copyright_year": None,
            "_playwright_error": None,
            "_site_blocked": False,
        }

    browser = None
    context = None

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            context = browser.new_context(
                user_agent=DEFAULT_BROWSER_USER_AGENT,
                locale="pt-BR",
                viewport={"width": 1365, "height": 900},
                ignore_https_errors=True,
            )
            page = context.new_page()
            page.set_default_timeout(PLAYWRIGHT_TIMEOUT_MS)
            apply_stealth(page)

            page.goto(safe_site_url, wait_until="domcontentloaded")
            try:
                page.wait_for_load_state("networkidle", timeout=8_000)
            except PlaywrightTimeoutError:
                pass

            title = (page.title() or "").strip() or None
            html_preview = page.content()[:10_000]
            final_url = page.url
            if detect_blocked_page(title, html_preview, final_url):
                return {
                    "is_social_platform": False,
                    "has_whatsapp_cta": None,
                    "has_title": None,
                    "has_description": None,
                    "has_og_tags": None,
                    "has_viewport_meta": None,
                    "has_favicon": None,
                    "is_https": final_url.lower().startswith("https://"),
                    "has_custom_font": None,
                    "image_count": None,
                    "images_without_alt": None,
                    "copyright_year": None,
                    "_playwright_error": None,
                    "_site_blocked": True,
                    "_blocked_reason": f"site bloqueou a navegacao automatizada ({final_url})",
                }

            signals = page.evaluate(
                """
                () => {
                  const getMeta = (selector, attr = "content") => {
                    const node = document.querySelector(selector);
                    if (!node) return null;
                    const value = (node.getAttribute(attr) || "").trim();
                    return value || null;
                  };

                  const nodes = Array.from(
                    document.querySelectorAll("a, button, iframe, [class], [id], [data-whatsapp]")
                  );
                  const hasWhatsAppCta = nodes.some((node) => {
                    const text = (node.innerText || node.textContent || "").toLowerCase();
                    const href = (node.getAttribute("href") || "").toLowerCase();
                    const src = (node.getAttribute("src") || "").toLowerCase();
                    const className = (node.getAttribute("class") || "").toLowerCase();
                    const id = (node.getAttribute("id") || "").toLowerCase();

                    return (
                      href.includes("wa.me") ||
                      href.includes("whatsapp") ||
                      src.includes("whatsapp") ||
                      className.includes("whatsapp") ||
                      id.includes("whatsapp") ||
                      text.includes("whatsapp") ||
                      text.includes("fale conosco")
                    );
                  });

                  const title = (document.title || "").trim() || null;
                  const description = getMeta('meta[name="description"]');
                  const ogTitle = getMeta('meta[property="og:title"]');
                  const ogImage = getMeta('meta[property="og:image"]');
                  const viewport = getMeta('meta[name="viewport"]');
                  const favicon = !!document.querySelector(
                    'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
                  );

                  const images = Array.from(document.images || []);
                  const imagesWithoutAlt = images.filter((image) => {
                    const alt = (image.getAttribute("alt") || "").trim();
                    return !alt;
                  }).length;

                  const fontCandidates = Array.from(
                    document.querySelectorAll("body, h1, h2, h3, p, button")
                  ).slice(0, 12);
                  const fontFamilies = fontCandidates
                    .map((element) => window.getComputedStyle(element).fontFamily)
                    .filter(Boolean);

                  const footerText = document.querySelector("footer")?.innerText || "";
                  const bodyText = document.body?.innerText || "";
                  const years = Array.from(
                    new Set(
                      [...(footerText + "\\n" + bodyText).matchAll(/(20\\d{2})/g)]
                        .map((match) => Number(match[1]))
                        .filter((year) => year >= 2000 && year <= new Date().getFullYear() + 1)
                    )
                  );

                  return {
                    title,
                    description,
                    ogTitle,
                    ogImage,
                    hasWhatsAppCta,
                    hasViewportMeta: !!viewport,
                    hasFavicon: favicon,
                    imageCount: images.length,
                    imagesWithoutAlt,
                    fontFamilies,
                    copyrightYear: years.length ? Math.min(...years) : null
                  };
                }
                """
            )

            return {
                "is_social_platform": False,
                "has_whatsapp_cta": bool(signals.get("hasWhatsAppCta")),
                "has_title": bool(signals.get("title")),
                "has_description": bool(signals.get("description")),
                "has_og_tags": bool(
                    signals.get("ogTitle") and signals.get("ogImage")
                ),
                "has_viewport_meta": bool(signals.get("hasViewportMeta")),
                "has_favicon": bool(signals.get("hasFavicon")),
                "is_https": final_url.lower().startswith("https://"),
                "has_custom_font": has_custom_font(signals.get("fontFamilies")),
                "image_count": signals.get("imageCount"),
                "images_without_alt": signals.get("imagesWithoutAlt"),
                "copyright_year": signals.get("copyrightYear"),
                "_playwright_error": None,
                "_site_blocked": False,
            }
    except PlaywrightError as exc:
        return {
            "is_social_platform": False,
            "has_whatsapp_cta": None,
            "has_title": None,
            "has_description": None,
            "has_og_tags": None,
            "has_viewport_meta": None,
            "has_favicon": None,
            "is_https": safe_site_url.lower().startswith("https://"),
            "has_custom_font": None,
            "image_count": None,
            "images_without_alt": None,
            "copyright_year": None,
            "_playwright_error": str(exc),
            "_site_blocked": False,
        }
    finally:
        if context is not None:
            try:
                context.close()
            except PlaywrightError:
                pass
        if browser is not None:
            try:
                browser.close()
            except PlaywrightError:
                pass


def compute_mobile_score(
    site_analysis: dict[str, Any],
    playwright_analysis: dict[str, Any],
) -> int | None:
    return weighted_average_scores(
        [
            (site_analysis.get("score_speed"), 45),
            (
                100
                if playwright_analysis.get("has_viewport_meta") is True
                else 15
                if playwright_analysis.get("has_viewport_meta") is False
                else None,
                40,
            ),
            (
                100
                if playwright_analysis.get("is_https") is True
                else 25
                if playwright_analysis.get("is_https") is False
                else None,
                15,
            ),
        ]
    )


def compute_seo_score(
    site_analysis: dict[str, Any],
    playwright_analysis: dict[str, Any],
) -> int | None:
    base_score = site_analysis.get("_seo_base_score")
    metadata_parts = [
        (
            100
            if playwright_analysis.get("has_title") is True
            else 10
            if playwright_analysis.get("has_title") is False
            else None,
            35,
        ),
        (
            100
            if playwright_analysis.get("has_description") is True
            else 10
            if playwright_analysis.get("has_description") is False
            else None,
            35,
        ),
        (
            100
            if playwright_analysis.get("has_og_tags") is True
            else 20
            if playwright_analysis.get("has_og_tags") is False
            else None,
            30,
        ),
    ]

    metadata_score = weighted_average_scores(metadata_parts)
    return weighted_average_scores(
        [
            (base_score, 55),
            (metadata_score, 45),
        ]
    )


def compute_design_score(
    playwright_analysis: dict[str, Any],
) -> int | None:
    browser_signal_count = sum(
        value is not None
        for value in (
            playwright_analysis.get("has_viewport_meta"),
            playwright_analysis.get("has_whatsapp_cta"),
            playwright_analysis.get("has_favicon"),
            playwright_analysis.get("has_custom_font"),
            playwright_analysis.get("image_count"),
            playwright_analysis.get("images_without_alt"),
            playwright_analysis.get("copyright_year"),
        )
    )
    if browser_signal_count < 2:
        return None

    signals = [
        (playwright_analysis.get("is_https"), 15),
        (playwright_analysis.get("has_viewport_meta"), 20),
        (playwright_analysis.get("has_whatsapp_cta"), 15),
        (playwright_analysis.get("has_favicon"), 10),
        (playwright_analysis.get("has_custom_font"), 15),
    ]

    image_count = playwright_analysis.get("image_count")
    if image_count is not None:
        signals.append((image_count >= 3, 15))

    images_without_alt = playwright_analysis.get("images_without_alt")
    if image_count and images_without_alt is not None:
        alt_ratio = max(image_count - images_without_alt, 0) / max(image_count, 1)
        signals.append((alt_ratio >= 0.5, 10))

    current_year = time.localtime().tm_year
    copyright_year = playwright_analysis.get("copyright_year")
    if copyright_year is not None:
        signals.append((copyright_year >= current_year - 2, 15))

    available_weight = sum(weight for value, weight in signals if value is not None)
    if available_weight == 0:
        return None

    achieved_weight = sum(weight for value, weight in signals if value is True)
    return int(round(achieved_weight / available_weight * 100))


def build_problems(
    lead: dict[str, Any],
    site_analysis: dict[str, Any],
    playwright_analysis: dict[str, Any],
    score_mobile: int | None,
    score_seo: int | None,
    score_design: int | None,
) -> list[str] | None:
    problems: list[str] = []

    if not lead["has_site"]:
        append_problem(problems, "Empresa sem presença digital")
        return problems

    if playwright_analysis.get("is_social_platform"):
        append_problem(problems, "Empresa depende apenas de perfil social")
        return problems

    score_speed = site_analysis.get("score_speed")

    if score_mobile is not None and score_mobile < 50:
        append_problem(
            problems,
            f"Site com experiencia mobile fraca ({score_mobile}/100 na analise local)",
        )

    if score_speed is not None and score_speed < 50:
        append_problem(
            problems,
            f"Site lento para abrir ({score_speed}/100 em velocidade local)",
        )

    if playwright_analysis.get("is_https") is False:
        append_problem(problems, "Site sem HTTPS, o que reduz confianca")

    if playwright_analysis.get("has_viewport_meta") is False:
        append_problem(problems, "Site sem sinais claros de responsividade mobile")

    if playwright_analysis.get("has_title") is False or playwright_analysis.get(
        "has_description"
    ) is False:
        append_problem(problems, "Metadados basicos de SEO incompletos")

    if playwright_analysis.get("has_og_tags") is False:
        append_problem(
            problems,
            "Compartilhamento social sem Open Graph configurado",
        )

    if site_analysis.get("_has_contact_info") is False:
        append_problem(problems, "Site nao destaca telefone, email ou WhatsApp")

    if playwright_analysis.get("has_whatsapp_cta") is False:
        append_problem(problems, "Site nao destaca atendimento via WhatsApp")

    word_count = site_analysis.get("_word_count")
    if word_count is not None and word_count < 120:
        append_problem(problems, "Site com pouco conteudo para ranqueamento local")

    copyright_year = playwright_analysis.get("copyright_year")
    if (
        copyright_year is not None
        and copyright_year <= time.localtime().tm_year - 2
        and len(problems) < 5
    ):
        append_problem(
            problems,
            f"Site aparenta desatualizado (referencias antigas de {copyright_year})",
        )

    image_count = playwright_analysis.get("image_count")
    images_without_alt = playwright_analysis.get("images_without_alt")
    if (
        image_count is not None
        and image_count >= 3
        and images_without_alt is not None
        and images_without_alt / max(image_count, 1) >= 0.6
    ):
        append_problem(
            problems,
            "Imagens sem texto alternativo prejudicam SEO e acessibilidade",
        )

    if score_seo is not None and score_seo < 50:
        append_problem(problems, "SEO tecnico fraco para busca local")

    if score_design is not None and score_design < 45:
        append_problem(
            problems,
            "Identidade visual e estrutura passam aspecto pouco profissional",
        )

    if site_analysis.get("_site_fetch_error"):
        append_problem(problems, "Site nao respondeu de forma confiavel")

    return problems or None


def enrich_lead(lead: dict[str, Any]) -> dict[str, Any]:
    if not lead["has_site"]:
        if lead.get("_site_rejected_reason"):
            log_analysis_warning(
                lead["name"],
                f"site ignorado por seguranca: {lead['_site_rejected_reason']}",
            )
        return {**lead, **build_no_site_analysis()}

    if is_social_platform_url(lead["site"]):
        return {**lead, **build_social_presence_analysis()}

    site_analysis = analyze_site_locally(lead["site"])
    if site_analysis.get("_site_fetch_error"):
        log_analysis_warning(
            lead["name"],
            f"analise local indisponivel: {site_analysis['_site_fetch_error']}",
        )

    playwright_analysis = analyze_with_playwright(lead["site"])
    if playwright_analysis.get("_playwright_error"):
        log_analysis_warning(
            lead["name"],
            f"Playwright indisponivel: {playwright_analysis['_playwright_error']}",
        )

    if playwright_analysis.get("_site_blocked"):
        log_analysis_warning(
            lead["name"],
            playwright_analysis.get("_blocked_reason", "site bloqueou a analise"),
        )
        return {
            **lead,
            **build_blocked_analysis(
                playwright_analysis.get(
                    "_blocked_reason",
                    "site bloqueou a analise automatizada",
                )
            ),
        }

    score_mobile = compute_mobile_score(site_analysis, playwright_analysis)
    score_seo = compute_seo_score(site_analysis, playwright_analysis)
    score_design = compute_design_score(playwright_analysis)
    problems = build_problems(
        lead,
        site_analysis,
        playwright_analysis,
        score_mobile,
        score_seo,
        score_design,
    )

    return {
        **lead,
        "score_mobile": score_mobile,
        "score_speed": site_analysis.get("score_speed"),
        "score_seo": score_seo,
        "score_design": score_design,
        "problems": problems,
    }


def lead_matches_filters(lead: dict[str, Any], filters: dict[str, Any] | None) -> bool:
    if not filters:
        return True

    if filters.get("sem_site") and lead.get("has_site"):
        return False

    categories = filters.get("categorias") or []
    if categories:
        lead_category = (lead.get("_maps_category") or "").lower()
        normalized_categories = [str(item).strip().lower() for item in categories if item]
        if not lead_category or not any(
            category in lead_category for category in normalized_categories
        ):
            return False

    min_reviews = filters.get("min_reviews")
    if isinstance(min_reviews, int) and min_reviews > 0:
        review_count = lead.get("_maps_review_count")
        if review_count is None or review_count < min_reviews:
            return False

    return True


def save_lead(client: Client, lead: dict[str, Any], index: int, total: int) -> str:
    existing_row = get_existing_lead_row(client, lead)
    is_update = existing_row is not None
    payload = sanitize_lead_for_storage(
        merge_user_owned_fields(lead, existing_row)
    )

    client.table("leads").upsert(
        payload,
        on_conflict="name,city",
    ).execute()

    status = "atualizado" if is_update else "salvo"
    tqdm.write(build_lead_log_message(lead, status, index, total))
    return status


def exportable_lead_record(lead: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": lead.get("name"),
        "segment": lead.get("segment"),
        "city": lead.get("city"),
        "address": lead.get("address"),
        "phone": lead.get("phone"),
        "email": lead.get("email"),
        "site": lead.get("site"),
        "has_site": lead.get("has_site"),
        "score_mobile": lead.get("score_mobile"),
        "score_speed": lead.get("score_speed"),
        "score_seo": lead.get("score_seo"),
        "score_design": lead.get("score_design"),
        "problems": lead.get("problems"),
        "maps_url": lead.get("_maps_url"),
        "category": lead.get("_maps_category"),
        "rating": lead.get("_maps_rating"),
        "total_reviews": lead.get("_maps_review_count"),
        "status_site": get_analysis_state(lead),
    }


def save_output_snapshot(leads: list[dict[str, Any]]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    archive_json = OUTPUT_DIR / f"leads_{timestamp}.json"
    latest_json = OUTPUT_DIR / LATEST_JSON_FILENAME
    latest_csv = OUTPUT_DIR / LATEST_CSV_FILENAME

    payload = [exportable_lead_record(lead) for lead in leads]
    json_content = json.dumps(payload, ensure_ascii=False, indent=2)
    archive_json.write_text(json_content, encoding="utf-8")
    latest_json.write_text(json_content, encoding="utf-8")

    with latest_csv.open("w", encoding="utf-8", newline="") as csv_file:
        if payload:
            writer = csv.DictWriter(csv_file, fieldnames=list(payload[0].keys()))
            writer.writeheader()
            writer.writerows(payload)
        else:
            csv_file.write("")

    return latest_json


def run_discovery_pipeline(
    *,
    query: str,
    city: str,
    max_results: int,
    persist: bool,
    client: Client | None,
    filters: dict[str, Any] | None = None,
    show_progress: bool = True,
) -> dict[str, Any]:
    places = search_places(query, city, max_results)
    if not places:
        return {
            "leads": [],
            "discovered_count": 0,
            "valid_count": 0,
            "new_count": 0,
            "updated_count": 0,
            "extraction_errors": 0,
            "analysis_errors": 0,
            "persistence_errors": 0,
            "snapshot_path": save_output_snapshot([]),
        }

    segment = query.strip().title()
    extracted_leads: list[dict[str, Any]] = []
    extraction_errors = 0

    for place in places:
        try:
            lead = extract_lead(place, segment, city)
        except ValueError as exc:
            extraction_errors += 1
            print(f"[extract] pulando place invalido: {exc}", file=sys.stderr)
            continue

        if lead_matches_filters(lead, filters):
            extracted_leads.append(lead)

    enriched_leads: list[dict[str, Any]] = []
    analysis_errors = 0

    progress_bar = tqdm(
        total=len(extracted_leads),
        desc="Processando",
        unit="lead",
        disable=not show_progress,
    )
    try:
        for lead in extracted_leads:
            try:
                enriched_leads.append(enrich_lead(lead))
            except Exception as exc:
                analysis_errors += 1
                tqdm.write(
                    f"[analysis] {lead.get('name', '?')} - erro de analise: {exc}"
                )
            finally:
                progress_bar.update(1)
    finally:
        progress_bar.close()

    new_count = 0
    updated_count = 0
    persistence_errors = 0

    if persist:
        if client is None:
            raise RuntimeError("Persistencia solicitada sem cliente Supabase.")

        total = len(enriched_leads)
        for index, lead in enumerate(enriched_leads, start=1):
            try:
                status = save_lead(client, lead, index, total)
                if status == "salvo":
                    new_count += 1
                else:
                    updated_count += 1
            except Exception as exc:
                persistence_errors += 1
                tqdm.write(
                    f"[{index}/{total}] {lead.get('name', '?')} - erro de persistencia: {exc}"
                )

    snapshot_path = save_output_snapshot(enriched_leads)
    return {
        "leads": enriched_leads,
        "discovered_count": len(places),
        "valid_count": len(enriched_leads),
        "new_count": new_count,
        "updated_count": updated_count,
        "extraction_errors": extraction_errors,
        "analysis_errors": analysis_errors,
        "persistence_errors": persistence_errors,
        "snapshot_path": snapshot_path,
    }


def validate_site_url(site_url: str) -> dict[str, Any]:
    site_analysis = analyze_site_locally(site_url)
    playwright_analysis = analyze_with_playwright(site_url)

    score_mobile = compute_mobile_score(site_analysis, playwright_analysis)
    score_seo = compute_seo_score(site_analysis, playwright_analysis)
    score_design = compute_design_score(playwright_analysis)
    score_quality = weighted_average_scores(
        [
            (score_mobile, 30),
            (site_analysis.get("score_speed"), 30),
            (score_seo, 20),
            (score_design, 20),
        ]
    )

    recommendation = build_site_recommendation(
        score_mobile,
        site_analysis.get("score_speed"),
        score_seo,
        score_design,
    )

    return {
        "url": site_url,
        "online": site_analysis.get("_site_fetch_error") is None,
        "tem_ssl": site_analysis.get("_is_https"),
        "mobile_friendly": playwright_analysis.get("has_viewport_meta"),
        "tempo_resposta_ms": site_analysis.get("_response_time_ms"),
        "score_qualidade": score_quality,
        "score_mobile": score_mobile,
        "score_speed": site_analysis.get("score_speed"),
        "score_seo": score_seo,
        "score_design": score_design,
        "recomendacao": recommendation,
        "problemas": build_problems(
            {
                "has_site": True,
                "site": site_url,
            },
            site_analysis,
            playwright_analysis,
            score_mobile,
            score_seo,
            score_design,
        ),
        "erro": site_analysis.get("_site_fetch_error")
        or playwright_analysis.get("_playwright_error"),
    }


def load_latest_snapshot() -> list[dict[str, Any]]:
    latest_json = OUTPUT_DIR / LATEST_JSON_FILENAME
    if not latest_json.exists():
        raise FileNotFoundError("Nenhum snapshot local disponivel em scraper/output.")

    return json.loads(latest_json.read_text(encoding="utf-8"))


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    persist = not args.no_persist
    ensure_runtime_dependencies(require_supabase=persist)
    env_path = load_environment()

    if args.max_results <= 0:
        parser.error("--max must be greater than 0")

    query = args.query.strip()

    if not query:
        parser.error("--query must not be empty")

    if not args.city.strip():
        parser.error("--city must not be empty")

    city = normalize_city_arg(args.city)

    missing_env = validate_runtime_env(require_supabase=persist)
    if missing_env:
        print("Erro: variaveis de ambiente obrigatorias ausentes.", file=sys.stderr)
        for item in missing_env:
            print(f"  * {item}", file=sys.stderr)
        return 1

    print("Lead Hunter Scraper")
    print(f"- Query: {query}")
    print(f"- Segment: {query.title()}")
    print(f"- City: {city}")
    print(f"- Max results: {args.max_results}")
    print(f"- Persist: {'sim' if persist else 'nao'}")
    print(f"- Environment source: {env_path if env_path else 'system/default'}")

    client: Client | None = None
    if persist:
        try:
            client = create_supabase_client_from_env(required=True)
        except Exception as exc:
            print(f"Erro ao validar Supabase: {exc}", file=sys.stderr)
            return 1

        print("- Supabase: validado")

    try:
        result = run_discovery_pipeline(
            query=query,
            city=city,
            max_results=args.max_results,
            persist=persist,
            client=client,
            show_progress=True,
        )
    except Exception as exc:
        print(f"Erro ao executar discovery local: {exc}", file=sys.stderr)
        return 1

    if result["discovered_count"] == 0:
        print("Nenhum negocio encontrado para a consulta informada.")

    print(f"- Snapshot local: {result['snapshot_path']}")
    print_run_summary(
        discovered_count=result["discovered_count"],
        valid_count=result["valid_count"],
        new_count=result["new_count"],
        updated_count=result["updated_count"],
        extraction_errors=result["extraction_errors"],
        analysis_errors=result["analysis_errors"],
        persistence_errors=result["persistence_errors"],
    )

    success_count = result["new_count"] + result["updated_count"]
    return (
        1
        if run_meaningfully_failed(
            discovered_count=result["discovered_count"],
            success_count=success_count,
            extraction_errors=result["extraction_errors"],
            analysis_errors=result["analysis_errors"],
            persistence_errors=result["persistence_errors"],
        )
        else 0
    )


if __name__ == "__main__":
    sys.exit(main())
