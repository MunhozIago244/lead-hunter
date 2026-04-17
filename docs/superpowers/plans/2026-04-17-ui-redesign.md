# UI Redesign — Warm Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the lead dashboard and CRM kanban with the "Warm Studio" visual identity — richer cards, slide-over detail panel, pill-bar filters, and drag-and-drop stage management with inline confirmation.

**Architecture:** Five independent tasks executed in order: (1) CSS tokens foundation, (2) lead card + pill-bar filters, (3) slide-over detail panel, (4) install dnd-kit + CRM card redesign, (5) drag-and-drop kanban with inline confirmation. Each task produces a working, committable state.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4, @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities

---

## Task 1: CSS Design Tokens

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Update design tokens in globals.css**

Replace the entire `:root` and dark-mode blocks with:

```css
:root {
  --background: #f3efe2;
  --foreground: #1d231f;
  --surface: rgba(255, 252, 248, 0.92);
  --surface-strong: #fffdf6;
  --border: rgba(29, 35, 31, 0.14);
  --muted: #5c645d;
  --accent: #0a6b52;
  --accent-strong: #085c45;
  --warning: #b86c21;
  --card-gradient: linear-gradient(135deg, #fffdf6 0%, #f7f4e8 100%);
  --glow-accent: rgba(10, 107, 82, 0.12);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #101512;
    --foreground: #f4efe3;
    --surface: rgba(22, 30, 26, 0.82);
    --surface-strong: rgba(22, 30, 26, 0.96);
    --border: rgba(244, 239, 227, 0.12);
    --muted: #b1bbaf;
    --accent: #42b894;
    --accent-strong: #6bd4af;
    --warning: #efad5b;
    --card-gradient: linear-gradient(135deg, rgba(22, 30, 26, 0.96) 0%, rgba(16, 22, 18, 0.98) 100%);
    --glow-accent: rgba(66, 184, 148, 0.14);
  }
}
```

- [ ] **Step 2: Add card-gradient and glow-accent to @theme inline block**

In the `@theme inline { }` block, add after `--color-warning`:

```css
  --color-card-gradient: var(--card-gradient);
  --color-glow-accent: var(--glow-accent);
```

- [ ] **Step 3: Style the custom scrollbar globally**

After the `::selection` block, add:

```css
::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 9999px;
}
```

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(ui): update design tokens — Warm Studio palette + scrollbar"
```

---

## Task 2: Lead Cards + Pill-Bar Filters

**Files:**
- Modify: `components/dashboard/lead-list-dashboard.tsx`

- [ ] **Step 1: Replace quick-filter cards with pill-bar**

Find the `<div className="grid gap-3 lg:grid-cols-4">` block that renders the 4 quick filter buttons and replace it entirely with:

```tsx
<div className="flex flex-wrap gap-2">
  {QUICK_FILTERS.map((filter) => {
    const isActive = quickFilter === filter.id
    return (
      <button
        key={filter.id}
        type="button"
        onClick={() => setQuickFilter(filter.id)}
        title={filter.description}
        className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition-all ${
          isActive
            ? 'border-transparent bg-accent text-white shadow-[0_4px_12px_rgba(10,107,82,0.22)]'
            : 'border-border bg-surface-strong text-muted hover:border-accent/40 hover:text-foreground'
        }`}
      >
        {filter.label}
      </button>
    )
  })}
</div>
```

- [ ] **Step 2: Collapse status/segment/city filters behind a toggle**

Add state variable after the existing state declarations:

```tsx
const [showFilters, setShowFilters] = useState(false)
```

Find the `<div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">` block that renders the 4 filter inputs and replace it with:

```tsx
<div className="flex flex-col gap-3">
  <div className="flex items-center gap-3">
    <label className="flex flex-1 items-center gap-3 rounded-full border border-border bg-surface-strong px-4 py-2">
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Buscar</span>
      <input
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        placeholder="Nome da empresa..."
        className="flex-1 border-none bg-transparent text-sm outline-none placeholder:text-muted"
      />
    </label>
    <button
      type="button"
      onClick={() => setShowFilters((v) => !v)}
      className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-all ${
        showFilters
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-border bg-surface-strong text-muted hover:border-accent/40 hover:text-foreground'
      }`}
    >
      Filtros {showFilters ? '▴' : '▾'}
    </button>
  </div>

  {showFilters && (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-2 rounded-[1.35rem] border border-border bg-surface-strong px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Status</span>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="bg-transparent text-sm outline-none"
        >
          <option value="all">Todos</option>
          {LEAD_STATUS_VALUES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 rounded-[1.35rem] border border-border bg-surface-strong px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Segmento</span>
        <select
          value={segmentFilter}
          onChange={(event) => setSegmentFilter(event.target.value)}
          className="bg-transparent text-sm outline-none"
        >
          <option value="all">Todos</option>
          {segmentOptions.map((segment) => (
            <option key={segment} value={segment}>{segment}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 rounded-[1.35rem] border border-border bg-surface-strong px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Cidade</span>
        <select
          value={cityFilter}
          onChange={(event) => setCityFilter(event.target.value)}
          className="bg-transparent text-sm outline-none"
        >
          <option value="all">Todas</option>
          {cityOptions.map((city) => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
      </label>
    </div>
  )}
</div>
```

- [ ] **Step 3: Add score bar helper function**

After the `scoreTone()` function, add:

```tsx
function scoreBarColor(lead: Lead) {
  const avg = getLeadAverageScore(lead)
  if (avg === null) return 'bg-border'
  if (avg < 40) return 'bg-warning'
  if (avg < 70) return 'bg-[#d4860f]'
  return 'bg-accent'
}
```

- [ ] **Step 4: Redesign the lead cards**

Find the `<div className="grid gap-3">` block that maps `visibleLeads` and replace the inner card JSX (the `<div key={lead.id} ...>` and all its children) with:

```tsx
<div
  key={lead.id}
  className={`group relative overflow-hidden rounded-[1.45rem] border transition-all duration-200 ${
    isSelected
      ? 'border-accent ring-2 ring-accent shadow-[0_0_0_4px_var(--glow-accent),0_8px_24px_rgba(17,24,18,0.10)]'
      : selectedIds.has(lead.id)
        ? 'border-accent/50 bg-accent/5 shadow-[0_2px_8px_rgba(17,24,18,0.06),0_0_0_1px_rgba(17,24,18,0.04)]'
        : 'border-border shadow-[0_2px_8px_rgba(17,24,18,0.06),0_0_0_1px_rgba(17,24,18,0.04)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(17,24,18,0.10)]'
  }`}
  style={{ background: isSelected ? undefined : 'var(--card-gradient)' }}
>
  {isSelected && <div className="absolute inset-0 bg-foreground" />}

  <div className="relative">
    <input
      type="checkbox"
      aria-label={`Selecionar ${lead.name}`}
      checked={selectedIds.has(lead.id)}
      onChange={() => {}}
      onClick={(e) => toggleLeadSelection(lead.id, e)}
      className="absolute left-4 top-4 z-10 h-4 w-4 cursor-pointer accent-accent"
    />

    <button
      type="button"
      onClick={() => setSelectedLeadId(lead.id)}
      className="block w-full px-5 pb-4 pt-4 text-left pl-10"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <LeadStatusBadge status={lead.status} />
          </div>
          <h3 className={`text-xl font-semibold tracking-[-0.03em] ${isSelected ? 'text-background' : 'text-foreground'}`}>
            {lead.name}
          </h3>
          <p className={`text-sm leading-6 ${isSelected ? 'text-background/70' : 'text-muted'}`}>
            {buildLeadMeta(lead)}
          </p>
          <div className={`flex flex-wrap items-center gap-4 text-sm ${isSelected ? 'text-background/80' : 'text-muted'}`}>
            {lead.phone && (
              <span>📞 {lead.phone}</span>
            )}
            {lead.site && (
              <span className="truncate max-w-[180px]">🌐 {lead.site.replace(/^https?:\/\//, '')}</span>
            )}
            {!lead.has_site && (
              <span className={`text-xs font-semibold uppercase tracking-[0.14em] ${isSelected ? 'text-background/60' : 'text-warning'}`}>
                sem site
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className={`text-4xl font-bold leading-none tracking-[-0.04em] ${
            isSelected
              ? 'text-background'
              : scoreTone(lead)
          }`}>
            {formatAverageScore(lead)}
          </p>
          <div className="mt-2 h-1 w-16 overflow-hidden rounded-full bg-border/50">
            <div
              className={`h-full rounded-full transition-all ${isSelected ? 'bg-background/50' : scoreBarColor(lead)}`}
              style={{ width: `${getLeadAverageScore(lead) ?? 0}%` }}
            />
          </div>
        </div>
      </div>
    </button>
  </div>
</div>
```

- [ ] **Step 5: Remove the aside panel (right column) from the grid**

The current layout is:
```tsx
<section className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
  <article ...>...</article>
  <aside ...>
    <LeadDetailPanel lead={selectedLead} onLeadUpdated={handleLeadUpdated} />
  </aside>
</section>
```

Replace with:
```tsx
<section>
  <article className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
    {/* ...all existing article content unchanged... */}
  </article>
</section>
```

Remove the `<aside>` entirely — the detail panel will be rendered as a slide-over in Task 3.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/lead-list-dashboard.tsx
git commit -m "feat(ui): redesign lead cards + pill-bar filters"
```

---

## Task 3: Slide-Over Detail Panel

**Files:**
- Modify: `components/dashboard/lead-list-dashboard.tsx`
- Modify: `components/dashboard/lead-detail-panel.tsx`

- [ ] **Step 1: Add Escape key handler and slide-over JSX to lead-list-dashboard.tsx**

Add `useEffect` import is already present. Add this effect after the existing filter effects:

```tsx
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') setSelectedLeadId(null)
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

- [ ] **Step 2: Add slide-over portal JSX at the bottom of the return, just before the sticky bulk-update bar**

After `</section>` and before the `{selectedIds.size > 0 && (` block:

```tsx
{/* Slide-over detail panel */}
{selectedLead && (
  <>
    {/* Backdrop */}
    <div
      className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm"
      onClick={() => setSelectedLeadId(null)}
    />
    {/* Panel */}
    <div
      className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col bg-surface-strong shadow-[-24px_0_48px_rgba(17,24,18,0.14)] animate-slide-in-right"
    >
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-xl font-semibold tracking-[-0.03em]">
            {selectedLead.name}
          </p>
          <p className="text-sm text-muted">
            {selectedLead.segment ?? 'segmento não informado'} · {selectedLead.city}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <LeadStatusBadge status={selectedLead.status} />
          <button
            type="button"
            onClick={() => setSelectedLeadId(null)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-strong text-muted transition hover:border-accent/40 hover:text-foreground"
          >
            ✕
          </button>
        </div>
      </div>
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <LeadDetailPanel
          lead={selectedLead}
          onLeadUpdated={handleLeadUpdated}
        />
      </div>
    </div>
  </>
)}
```

- [ ] **Step 3: Add slide-in animation to globals.css**

In `app/globals.css`, after the `::selection` block, add:

```css
@keyframes slide-in-right {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

.animate-slide-in-right {
  animation: slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}
```

- [ ] **Step 4: Strip width/positioning from lead-detail-panel.tsx**

The `LeadDetailPanel` component currently renders a `<div className="space-y-6">` as root — this is already correct for use inside the slide-over. No structural change needed. Only update the empty state to match the new context:

Find:
```tsx
<div className="flex h-full min-h-[320px] items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-surface-strong px-6 text-center">
```

Replace with:
```tsx
<div className="flex h-full min-h-[320px] items-center justify-center px-6 text-center">
```

- [ ] **Step 5: Verify slide-over works**

Start dev server: `npm run dev`

- Click a lead card → slide-over animates in from right
- Click backdrop → closes
- Press Escape → closes
- Click ✕ button → closes
- Bulk selection bar still appears when checkboxes clicked
- CSV export button still works

- [ ] **Step 6: Commit**

```bash
git add app/globals.css components/dashboard/lead-list-dashboard.tsx components/dashboard/lead-detail-panel.tsx
git commit -m "feat(ui): slide-over detail panel with backdrop + Escape close"
```

---

## Task 4: Install dnd-kit + CRM Card Redesign

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `components/crm/crm-workspace.tsx`

- [ ] **Step 1: Install dnd-kit packages**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: packages added to `node_modules` and `package.json`.

- [ ] **Step 2: Identify the CRM account card in crm-workspace.tsx**

Open `components/crm/crm-workspace.tsx`. Find the function or JSX block that renders individual account cards in the kanban columns. It renders company name, stage badge, reply badge, and follow-up date. This is what will be redesigned.

- [ ] **Step 3: Add stage color helper**

Near the top of `crm-workspace.tsx`, after the imports, add:

```tsx
function stageHeaderColor(stage: string): string {
  if (stage === 'new' || stage === 'researching') return '#94a3b8'
  if (stage === 'proposal_ready' || stage === 'contacted') return '#f59e0b'
  if (stage === 'awaiting_reply' || stage === 'replied') return 'var(--accent)'
  if (stage === 'meeting_scheduled') return '#8b5cf6'
  if (stage === 'won') return 'var(--accent-strong)'
  if (stage === 'lost') return 'var(--warning)'
  return 'var(--border)'
}

function stageColumnBg(stage: string): string {
  if (stage === 'won') return 'bg-accent/5'
  if (stage === 'lost') return 'bg-warning/5'
  return ''
}
```

- [ ] **Step 4: Add score bar color helper**

```tsx
function accountScoreColor(score: number | null): string {
  if (score === null) return 'bg-border'
  if (score < 40) return 'bg-warning'
  if (score < 70) return 'bg-[#d4860f]'
  return 'bg-accent'
}
```

- [ ] **Step 5: Update each kanban column header to use stageHeaderColor**

Find where column headers are rendered (they show stage label + card count). Each column header container — add a `border-t-[3px]` with inline style:

```tsx
<div
  className={`flex shrink-0 flex-col rounded-[1.75rem] border border-border bg-surface p-4 ${stageColumnBg(stage)}`}
  style={{ borderTopColor: stageHeaderColor(stage), borderTopWidth: '3px' }}
>
```

- [ ] **Step 6: Redesign the account card JSX**

Find the existing account card rendering inside the column map. Replace the card body with this new structure (preserve any existing `onClick` handlers for opening the detail panel):

```tsx
<div
  className="group cursor-pointer rounded-[1.35rem] border border-border bg-surface-strong shadow-[0_2px_8px_rgba(17,24,18,0.06),0_0_0_1px_rgba(17,24,18,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(17,24,18,0.10)] overflow-hidden"
  onClick={() => { /* existing click handler */ }}
>
  {/* Grip handle — visible on hover */}
  <div className="flex items-start gap-2 px-4 pt-4 pb-2">
    <span className="mt-0.5 select-none text-base text-muted opacity-0 transition-opacity group-hover:opacity-100 cursor-grab">
      ⠿
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold tracking-[-0.02em]">
        {account.company_name}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted">
        {account.segment ?? ''}{account.city ? ` · ${account.city}` : ''}
      </p>
    </div>
  </div>

  {/* Badges */}
  <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
    <CrmStageBadge stage={account.stage} />
    {account.reply_status && <CrmReplyBadge status={account.reply_status} />}
    {/* Follow-up badge */}
    {account.follow_up_date && (() => {
      const followUp = new Date(account.follow_up_date)
      const now = Date.now()
      const diff = followUp.getTime() - now
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      if (diff < 0) return (
        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning">
          📅 vencido
        </span>
      )
      if (diff <= sevenDays) return (
        <span className="rounded-full bg-[#f59e0b]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#92650a] dark:text-[#f59e0b]">
          📅 {Math.ceil(diff / 86400000)}d
        </span>
      )
      return null
    })()}
  </div>

  {/* Score bar */}
  {account.lead && (
    <div className="px-4 pb-4">
      <div className="flex items-center gap-2">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border/50">
          <div
            className={`h-full rounded-full ${accountScoreColor(
              account.lead.score_mobile !== null || account.lead.score_speed !== null
                ? Math.round(
                    [account.lead.score_mobile, account.lead.score_speed, account.lead.score_seo, account.lead.score_design]
                      .filter((s): s is number => s !== null)
                      .reduce((a, b) => a + b, 0) /
                    [account.lead.score_mobile, account.lead.score_speed, account.lead.score_seo, account.lead.score_design]
                      .filter((s): s is number => s !== null).length
                  )
                : null
            )}`}
            style={{
              width: `${
                [account.lead.score_mobile, account.lead.score_speed, account.lead.score_seo, account.lead.score_design]
                  .filter((s): s is number => s !== null)
                  .length > 0
                  ? Math.round(
                      [account.lead.score_mobile, account.lead.score_speed, account.lead.score_seo, account.lead.score_design]
                        .filter((s): s is number => s !== null)
                        .reduce((a, b) => a + b, 0) /
                      [account.lead.score_mobile, account.lead.score_speed, account.lead.score_seo, account.lead.score_design]
                        .filter((s): s is number => s !== null).length
                    )
                  : 0
              }%`,
            }}
          />
        </div>
        <span className="text-[10px] font-semibold text-muted">
          {[account.lead.score_mobile, account.lead.score_speed, account.lead.score_seo, account.lead.score_design]
            .filter((s): s is number => s !== null)
            .length > 0
            ? Math.round(
                [account.lead.score_mobile, account.lead.score_speed, account.lead.score_seo, account.lead.score_design]
                  .filter((s): s is number => s !== null)
                  .reduce((a, b) => a + b, 0) /
                [account.lead.score_mobile, account.lead.score_speed, account.lead.score_seo, account.lead.score_design]
                  .filter((s): s is number => s !== null).length
              )
            : '--'}
        </span>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 7: Update kanban scroll container**

Find the kanban columns wrapper (the scrollable horizontal container). Update its className:

```tsx
<div className="flex gap-4 overflow-x-auto pb-4 [scroll-snap-type:x_mandatory] [scrollbar-width:thin]">
```

Each column wrapper:
```tsx
<div className="w-[280px] shrink-0 [scroll-snap-align:start]">
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json components/crm/crm-workspace.tsx
git commit -m "feat(ui): CRM card redesign + column headers + dnd-kit install"
```

---

## Task 5: Drag-and-Drop Kanban with Inline Confirmation

**Files:**
- Modify: `components/crm/crm-workspace.tsx`

- [ ] **Step 1: Add dnd-kit imports at top of crm-workspace.tsx**

```tsx
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
```

- [ ] **Step 2: Add drag state to the CrmWorkspace component**

Inside the `CrmWorkspace` function, add these state variables after the existing ones:

```tsx
const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
const [pendingMove, setPendingMove] = useState<{
  accountId: string
  fromStage: string
  toStage: string
} | null>(null)
const [confirmTimerRef, setConfirmTimerRef] = useState<ReturnType<typeof setTimeout> | null>(null)
```

- [ ] **Step 3: Add dnd sensors**

Inside the `CrmWorkspace` function, after the state declarations:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
)
```

- [ ] **Step 4: Add drag event handlers**

```tsx
function handleDragStart(event: DragStartEvent) {
  setActiveAccountId(String(event.active.id))
}

function handleDragEnd(event: DragEndEvent) {
  setActiveAccountId(null)
  const { active, over } = event
  if (!over) return

  const accountId = String(active.id)
  const toStage = String(over.id)

  // Find the account's current stage
  const account = accounts.find((a) => a.id === accountId)
  if (!account || account.stage === toStage) return

  // Optimistically move in UI
  setAccounts((prev) =>
    prev.map((a) => a.id === accountId ? { ...a, stage: toStage as CrmAccount['stage'] } : a)
  )

  // Set pending confirmation
  const timer = setTimeout(() => {
    // Auto-cancel — revert
    setAccounts((prev) =>
      prev.map((a) => a.id === accountId ? { ...a, stage: account.stage } : a)
    )
    setPendingMove(null)
  }, 6000)

  setConfirmTimerRef(timer)
  setPendingMove({ accountId, fromStage: account.stage, toStage })
}

async function handleConfirmMove() {
  if (!pendingMove) return
  if (confirmTimerRef) clearTimeout(confirmTimerRef)
  setConfirmTimerRef(null)

  const { accountId, toStage } = pendingMove
  setPendingMove(null)

  try {
    const response = await fetch(`/api/crm/accounts/${accountId}`, {
      method: 'PATCH',
      headers: buildBrowserMutationHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ stage: toStage }),
    })
    if (!response.ok) throw new Error('Failed to update stage')
  } catch {
    // Revert on error
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === accountId ? { ...a, stage: pendingMove.fromStage as CrmAccount['stage'] } : a
      )
    )
  }
}

function handleCancelMove() {
  if (!pendingMove) return
  if (confirmTimerRef) clearTimeout(confirmTimerRef)
  setConfirmTimerRef(null)

  const { accountId, fromStage } = pendingMove
  setAccounts((prev) =>
    prev.map((a) => a.id === accountId ? { ...a, stage: fromStage as CrmAccount['stage'] } : a)
  )
  setPendingMove(null)
}
```

Note: `buildBrowserMutationHeaders` is already imported in the file from `@/lib/security-client`.

- [ ] **Step 5: Wrap kanban board with DndContext**

Find the kanban columns container JSX. Wrap it:

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
>
  <div className="flex gap-4 overflow-x-auto pb-4 [scroll-snap-type:x_mandatory] [scrollbar-width:thin]">
    {PIPELINE_STAGES.map((stage) => {
      const stageAccounts = groupedAccounts[stage] ?? []
      return (
        <div
          key={stage}
          className={`w-[280px] shrink-0 [scroll-snap-align:start]`}
        >
          <SortableContext
            items={stageAccounts.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
            id={stage}
          >
            {/* Column wrapper with droppable zone */}
            <div
              id={stage}
              className={`flex min-h-[200px] flex-col gap-3 rounded-[1.75rem] border border-border bg-surface p-4 transition-all ${stageColumnBg(stage)} ${
                activeAccountId ? 'ring-1 ring-accent/20' : ''
              }`}
              style={{ borderTopColor: stageHeaderColor(stage), borderTopWidth: '3px' }}
            >
              {/* Column header */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  {/* existing stage label */}
                </p>
                <span className="rounded-full bg-surface-strong px-2 py-0.5 text-xs font-semibold text-muted">
                  {stageAccounts.length}
                </span>
              </div>

              {/* Cards */}
              {stageAccounts.map((account) => (
                <SortableAccountCard
                  key={account.id}
                  account={account}
                  isPending={pendingMove?.accountId === account.id}
                  onConfirm={handleConfirmMove}
                  onCancel={handleCancelMove}
                  pendingToStage={pendingMove?.toStage}
                  onSelect={() => setSelectedAccountId(account.id)}
                />
              ))}
            </div>
          </SortableContext>
        </div>
      )
    })}
  </div>
  <DragOverlay>
    {activeAccountId ? (
      <div className="rotate-1 rounded-[1.35rem] border border-accent/40 bg-surface-strong shadow-[0_16px_48px_rgba(17,24,18,0.22)] opacity-95 p-4">
        <p className="text-sm font-semibold">
          {accounts.find((a) => a.id === activeAccountId)?.company_name}
        </p>
      </div>
    ) : null}
  </DragOverlay>
</DndContext>
```

- [ ] **Step 6: Create SortableAccountCard component**

Add this component above `CrmWorkspace` in `crm-workspace.tsx`:

```tsx
type SortableAccountCardProps = {
  account: CrmAccount
  isPending: boolean
  pendingToStage: string | undefined
  onConfirm: () => void
  onCancel: () => void
  onSelect: () => void
}

function SortableAccountCard({
  account,
  isPending,
  pendingToStage,
  onConfirm,
  onCancel,
  onSelect,
}: SortableAccountCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: account.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const avgScore = (() => {
    if (!account.lead) return null
    const scores = [account.lead.score_mobile, account.lead.score_speed, account.lead.score_seo, account.lead.score_design].filter((s): s is number => s !== null)
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  })()

  const followUpBadge = (() => {
    if (!account.follow_up_date) return null
    const followUp = new Date(account.follow_up_date)
    const diff = followUp.getTime() - Date.now()
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    if (diff < 0) return <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning">📅 vencido</span>
    if (diff <= sevenDays) return <span className="rounded-full bg-[#f59e0b]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#92650a] dark:text-[#f59e0b]">📅 {Math.ceil(diff / 86400000)}d</span>
    return null
  })()

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div
        className="group cursor-pointer rounded-[1.35rem] border border-border bg-surface-strong shadow-[0_2px_8px_rgba(17,24,18,0.06),0_0_0_1px_rgba(17,24,18,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(17,24,18,0.10)] overflow-hidden"
        onClick={onSelect}
      >
        <div className="flex items-start gap-2 px-4 pt-4 pb-2">
          <span
            {...listeners}
            className="mt-0.5 select-none text-base text-muted opacity-0 transition-opacity group-hover:opacity-100 cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            ⠿
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-[-0.02em]">{account.company_name}</p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {account.segment ?? ''}{account.city ? ` · ${account.city}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
          <CrmStageBadge stage={account.stage} />
          {account.reply_status && <CrmReplyBadge status={account.reply_status} />}
          {followUpBadge}
        </div>

        {avgScore !== null && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border/50">
                <div
                  className={`h-full rounded-full ${accountScoreColor(avgScore)}`}
                  style={{ width: `${avgScore}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-muted">{avgScore}</span>
            </div>
          </div>
        )}

        {/* Inline confirmation bar */}
        {isPending && (
          <div className="border-t border-border bg-accent/8 px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-xs font-medium text-foreground">
              Mover para <span className="font-bold">{pendingToStage}</span>?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white transition hover:bg-accent-strong"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted transition hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verify CRM drag-and-drop**

```bash
npm run dev
```

- Open `/crm`
- Drag a card to another column → card moves, confirmation bar appears
- Click Confirmar → bar disappears, change persists after refresh
- Drag again, wait 6 seconds without confirming → card reverts to original column
- Click Cancelar → card reverts immediately
- Keyboard: Tab to card, Space to lift, arrow keys to move, Space to drop

- [ ] **Step 8: Run type check**

```bash
npx tsc --noEmit
```

Fix any type errors before committing.

- [ ] **Step 9: Commit**

```bash
git add components/crm/crm-workspace.tsx
git commit -m "feat(ui): drag-and-drop kanban with inline stage confirmation"
```

- [ ] **Step 10: Final push**

```bash
git push
```

---

## Verification Checklist

- [ ] Lead cards show score in `text-4xl font-bold` with correct color
- [ ] Lead cards have score bar (4px) below the score number
- [ ] Phone and site visible directly on lead cards
- [ ] Quick filters render as horizontal pill-bar (not large cards)
- [ ] Status/segment/city filters hidden behind "Filtros ▾" toggle
- [ ] Clicking a lead opens slide-over from right with animation
- [ ] Slide-over closes on backdrop click, ✕ button, and Escape key
- [ ] Bulk select checkboxes still work, sticky bar still appears
- [ ] CSV export button still works
- [ ] CRM columns have colored top border by stage group
- [ ] CRM cards show grip handle on hover
- [ ] CRM cards show follow-up badge (amber/warning) when applicable
- [ ] CRM cards show score bar at bottom
- [ ] Dragging a card shows floating overlay with rotation
- [ ] Drop zone column gets accent ring during drag
- [ ] After drop: inline confirmation appears on card
- [ ] Confirmar → persists via PATCH, bar disappears
- [ ] Cancelar or 6s timeout → card returns to original column
- [ ] `npx tsc --noEmit` → 0 errors
