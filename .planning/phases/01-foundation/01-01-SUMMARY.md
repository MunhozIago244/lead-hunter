---
phase: 01-foundation
plan: 01
subsystem: scaffold
tags: [nextjs, typescript, tailwind, supabase, scaffold]
dependency_graph:
  requires: []
  provides: [next-app, supabase-client-helpers, scraper-skeleton]
  affects: [all-subsequent-plans]
tech_stack:
  added: [next@15.3, react@19, typescript@5, tailwindcss@4, "@supabase/supabase-js@2", "@supabase/ssr@0.10"]
  patterns: [app-router, createBrowserClient, createServerClient, tailwind-v4-css-import]
key_files:
  created:
    - package.json
    - tsconfig.json
    - next.config.ts
    - app/globals.css
    - app/layout.tsx
    - app/page.tsx
    - .gitignore
    - .env.example
    - lib/supabase/client.ts
    - lib/supabase/server.ts
    - scraper/requirements.txt
    - README.md
  modified: []
decisions:
  - "Used @supabase/ssr with createBrowserClient/createServerClient — replaces deprecated auth-helpers"
  - "Tailwind v4 via @import 'tailwindcss' in CSS — no tailwind.config.js required"
  - "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY env var name (not deprecated ANON_KEY)"
  - "tsconfig paths alias fixed to ./* (root) since app/ is at project root, not in src/"
metrics:
  duration: 20
  completed_date: "2026-04-16"
---

# Phase 01 Plan 01: Project Scaffold Summary

**One-liner:** Next.js 15.3 App Router scaffold with TypeScript strict, Tailwind v4 CSS import, @supabase/ssr client helpers, and Python scraper skeleton.

## What Was Built

### Task 1: Next.js 15.3 scaffold with TypeScript strict and Tailwind v4

- Scaffolded via `create-next-app@15.3.0` into a temp dir then moved to project root (existing .claude/ and .planning/ directories prevented direct scaffolding)
- `tsconfig.json` has `"strict": true`, `"noEmit": true`, paths alias `@/*` pointing to root (`./`)
- `app/globals.css` uses Tailwind v4 `@import "tailwindcss"` — no `@tailwind base` directives, no `tailwind.config.js`
- `@supabase/supabase-js` and `@supabase/ssr` installed via npm
- `npx tsc --noEmit` exits 0

### Task 2: Supabase client helpers, env template, scraper skeleton, README

- `lib/supabase/client.ts` — browser-side singleton using `createBrowserClient` from `@supabase/ssr`
- `lib/supabase/server.ts` — async server helper using `createServerClient` with `await cookies()` pattern
- `.env.example` — documents all required keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAPS_API_KEY`, `PAGESPEED_API_KEY`
- `scraper/requirements.txt` — pinned Python deps: supabase==2.28.3, playwright==1.49.0, tf-playwright-stealth==2.0.2, requests==2.31.0, tqdm==4.66.0, python-dotenv==1.0.0, anthropic==0.96.0
- `README.md` — step-by-step setup for both dashboard and scraper

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Scaffold in temp dir due to conflicting files**
- **Found during:** Task 1
- **Issue:** `create-next-app` refused to scaffold into directory containing `.claude/` and `.planning/` folders
- **Fix:** Scaffolded into `tmpscaffold/` subdirectory, then moved all files to project root; cleaned up temp dir
- **Files modified:** All scaffold files moved to root
- **Commit:** be364b6

**2. [Rule 1 - Bug] tsconfig paths alias pointed to ./src/ instead of ./**
- **Found during:** Task 1
- **Issue:** create-next-app detected `--src-dir no` but still created `src/app/`; after manual move of app/ to root, paths alias `./src/*` would be wrong
- **Fix:** Updated tsconfig.json paths to `"@/*": ["./*"]`
- **Files modified:** tsconfig.json
- **Commit:** be364b6

**3. [Rule 2 - Missing] .gitignore excluded .env.example**
- **Found during:** Task 2
- **Issue:** Default .gitignore pattern `.env*` blocked committing `.env.example`
- **Fix:** Added `!.env.example` negation to .gitignore
- **Files modified:** .gitignore
- **Commit:** 2f4073e

## Verification Results

- `npx tsc --noEmit` — exits 0 (no TypeScript errors)
- `grep '"strict"' tsconfig.json` — returns `"strict": true`
- `grep "@supabase/ssr" package.json` — match found (^0.10.2)
- `cat app/globals.css` — contains `@import "tailwindcss"`, no `@tailwind` directives
- `ls tailwind.config.js` — NOT FOUND (correct for v4)
- `grep "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" .env.example` — match found
- `grep "NEXT_PUBLIC_SUPABASE_ANON_KEY" .env.example` — no match (deprecated name absent)
- `cat scraper/requirements.txt` — supabase==2.28.3 and tf-playwright-stealth==2.0.2 present

## Known Stubs

None — this plan creates scaffold files only, no data-rendering components.
