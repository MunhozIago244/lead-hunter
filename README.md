# lead-hunter

Semi-automated freelance client prospecting system.

Current status: the repo now includes the dashboard shell at `/`, protected lead and CRM routes, a live lead list backed by `GET /api/leads`, pitch generation through `POST /api/pitch`, CRM workspace pieces, and a Python scraper that now runs with a fully local discovery pipeline. Lead discovery no longer depends on paid Google Places or PageSpeed APIs: it uses Playwright to scrape public Google Maps results plus local site checks for speed, HTTPS, viewport/contact/content heuristics. The dashboard remains compatible because discovery still writes into the same `leads` table in Supabase.

## Prerequisites

- Node.js 20+
- Python 3.11+
- Supabase account (free tier)
- Anthropic account (for pitch generation)

## Dashboard Setup

1. Clone the repo
2. Install dependencies: `npm install`
3. Copy env template: `cp .env.example .env.local`
4. Fill in values in `.env.local`
5. Apply database migrations (see **Database** section below)
6. Start dev server: `npm run dev`
7. Run project typecheck: `npm run typecheck`

## Scraper Setup

1. Navigate to scraper dir: `cd scraper`
2. Create virtual env: `python -m venv venv`
3. Activate: `source venv/bin/activate` (Linux/Mac) or `venv\Scripts\activate` (Windows)
4. Install deps: `pip install -r requirements.txt`
5. Install Playwright browser: `playwright install chromium`
6. Copy env template: `cp ../.env.example .env`
7. Fill in values in `.env`

## Usage

```bash
# From scraper/ directory — discovery run with Supabase persistence
python scraper.py --query "dentista" --city "Campinas" --max 20

# Dry-run without writing to Supabase
python scraper.py --query "dentista" --city "Campinas" --max 20 --no-persist
```

## Local Scraper API

```bash
# From scraper/ directory
uvicorn main:app --reload --port 8000
```

Available endpoints:

- `POST /leads` — local Google Maps scraping + site analysis + optional Supabase persistence
- `POST /validate` — validates a single site URL with the same local heuristics
- `GET /export?format=json|csv` — returns the latest local snapshot from `scraper/output/`

Example request:

```bash
curl -X POST http://127.0.0.1:8000/leads ^
  -H "Content-Type: application/json" ^
  -d "{\"query\":\"dentista\",\"location\":\"Campinas\",\"limit\":20,\"persist\":true}"
```

The local discovery pipeline now executes end to end without paid Google APIs: Google Maps web scraping, extraction of public contact/site data, no-site fallback, local site fetch analysis, Playwright heuristics (WhatsApp/meta tags/block detection), ordered problem generation, optional protected Supabase upsert, and snapshot export in JSON/CSV. Live verification still depends on a real Supabase project, a working Playwright Chromium install, and an Anthropic API key if you want pitch generation.

## Database

Migration files live in `supabase/migrations/`. Apply them in filename order (they are timestamp-prefixed).

### Option A — Supabase CLI (recommended)

```bash
# Install CLI: https://supabase.com/docs/guides/cli
npm install -g supabase

# Link to your project (one-time, requires SUPABASE_PROJECT_REF)
supabase link --project-ref <your-project-ref>

# Push all pending migrations
supabase db push
```

### Option B — SQL Editor (manual)

Open the Supabase dashboard → SQL Editor and run each file in order:

1. `supabase/migrations/20260416000000_create_leads_table.sql`
2. `supabase/migrations/20260416210000_create_crm_foundation_tables.sql`
3. `supabase/migrations/20260417001000_harden_lead_read_access.sql`

### Adding a new migration

```bash
# Creates a timestamped file ready to edit
supabase migration new <description>
```

Never edit existing migration files after they have been applied to production.
