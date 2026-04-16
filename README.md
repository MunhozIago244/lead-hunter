# lead-hunter

Semi-automated freelance client prospecting system.

## Prerequisites

- Node.js 20+
- Python 3.11+
- Supabase account (free tier)
- Google Cloud account (Places API + PageSpeed Insights API keys)

## Dashboard Setup

1. Clone the repo
2. Install dependencies: `npm install`
3. Copy env template: `cp .env.example .env.local`
4. Fill in values in `.env.local`
5. Run migrations in Supabase SQL Editor (see `supabase/migrations/`)
6. Start dev server: `npm run dev`

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
# From scraper/ directory
python scraper.py --query "dentista" --city "Campinas" --max 20
```
