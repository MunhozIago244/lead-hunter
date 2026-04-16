# Features Research

**Domain:** Freelance lead prospecting and cold outreach tool for web developers
**Researched:** 2026-04-16
**Overall confidence:** HIGH (core features), MEDIUM (conversion patterns)

---

## Table Stakes

Features users expect. Without these the tool is unusable or no better than manual work.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Search by niche + city | Core discovery mechanic — without it there are no leads | Low | Google Maps Places API provides this |
| Website quality score per lead | Users need a reason to prioritize one lead over another | Medium | PageSpeed + heuristics |
| Contact info display (phone, email, site URL) | Without contact info, the tool is an audit tool, not an outreach tool | Low | Scraped from site / Places API |
| Lead status tracking (new → contacted → replied → closed) | Users need to know what they've already acted on | Low | Simple enum column in DB |
| Personalized pitch generation | Generic copy converts at <1%; AI-personalized copy is the core value prop | Medium | Claude API |
| Copy-to-clipboard for pitch | Minimum viable "send" action — user can paste into any channel | Low | Browser API |
| WhatsApp deep link | Brazilian market uses WhatsApp as primary business communication | Low | wa.me/55{phone}?text={encoded} |
| Deduplication of leads | Re-scraping the same city/niche must not flood the list with duplicates | Low | Unique constraint on domain/place_id |
| Filter by status | Separating "new" from "already contacted" is the single most critical filter | Low | Dropdown or tab group |
| Pagination or scroll on lead list | > 30 leads means the list needs navigation | Low | Standard |

---

## Differentiators

Features that give this tool an advantage over doing it manually in a spreadsheet or using generic tools.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Problem list per lead (up to 5 specific issues) | Pitch references real problems ("your site has no mobile version, loads in 8s on 4G") — this is why reply rates go up | Medium | Playwright scrape + heuristics |
| AI pitch that names the problems found | Apollo/Lemlist use mail-merge tokens; this uses actual audit data as input context — qualitatively different | Medium | Claude prompt engineering |
| Design score / "last updated" signal | Helps prioritize businesses with obviously neglected sites — high ROI targets | Medium | Playwright screenshot + header check |
| WhatsApp presence detection | If a business has no WhatsApp button, that's a specific service to sell them | Low | DOM selector check |
| Meta tags / OG image detection | Missing OG tags = weak social presence = another specific thing to sell | Low | HTML head check |
| Score-based sorting | Sort by "worst site" to prioritize easiest upsells | Low | ORDER BY score ASC |
| One-click pitch regeneration | User can iterate the pitch without re-running the full scrape | Low | Re-call Claude with same lead data |
| Pitch stored in DB | Avoids regenerating on every load; user can edit before sending | Low | Already planned in PROJECT.md |
| Progress bar during scrape | Solo developer running CLI must see the scraper isn't hanging | Low | tqdm |
| Segment/city filters | When the user has scraped multiple cities or niches, they need to focus | Low | Dropdown filters |

---

## Anti-Features (Don't Build in V1)

Things that add complexity without proportional value for a solo-use tool.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Automated message sending | Legal risk (LGPD/spam), removes human review, destroys trust if a bad message goes out | Keep the deep link + copy-paste flow |
| Email sequence / follow-up scheduling | Adds email infrastructure, deliverability management, unsubscribe logic — a product in itself | Manually follow up; add later if validated |
| CRM integrations (HubSpot, Pipedrive) | Solo user doesn't need a CRM — this tool IS their CRM | Export to CSV if they ever need it |
| Team / multi-user support | Adds auth complexity, row-level security, billing — out of scope for solo tool | Single Supabase user |
| ML lead scoring | No training data, adds infra, heuristics are good enough for "score < 50 = bad site" | Heuristic score via PageSpeed + rules |
| A/B testing pitches | Apollo/Lemlist feature for scale; a solo freelancer sends 20 messages/week | Regenerate button is enough |
| LinkedIn scraping | Legal risk (ToS violation), different infrastructure, different context | Focus on Google Maps local businesses |
| Browser extension | Different deployment target; adds maintenance burden | Web dashboard is sufficient |
| Invoice / contract generation | Different product (Bonsai, AND.CO exist for this) | Out of scope |
| Lead import from CSV | Adds mapping UI; the tool's value is the discovery + audit, not list management | Not worth the complexity in v1 |

---

## Lead Analysis Signals

Which website quality signals matter most, in priority order, for identifying businesses worth pitching.

### Tier 1 — High Signal, Easy to Measure

**Mobile Performance Score (PageSpeed Insights)**
Score 0-49 = poor (red), 50-89 = needs work (orange), 90+ = good (green). Most local business sites in Brazil score 30-60 on mobile. A score below 50 is a clear, defensible pitch hook: "your site loads in 8 seconds on a phone — 53% of your visitors leave." Source: Google for Developers.

**No Mobile Responsiveness**
Detected via viewport meta tag absence or Playwright viewport test. Binary signal — either the site is responsive or it isn't. Easy to demonstrate visually in a pitch.

**Site Doesn't Exist / Redirects to Social Profile**
Strongest signal of all — business is findable on Google Maps but has no real website. Pitch is trivial: "you don't have a website."

**SSL / HTTPS Missing**
Chrome shows "Not Secure" to all visitors. Immediate trust problem. Easy to detect via URL scheme.

### Tier 2 — Strong Signal, Requires Scraping

**Missing or Empty Meta Tags (title, description, OG)**
No `<title>` or a generic/empty `<meta name="description">` means the business doesn't show up in search well. Direct SEO sell.

**No WhatsApp CTA Button**
In Brazil, a business without a WhatsApp contact button is losing conversions. Detectable via DOM (`wa.me` link or WhatsApp widget). Specific service to offer.

**Outdated Copyright Year or Last Modified Date**
Footer with "© 2017" or HTTP `Last-Modified` header from years ago signals an abandoned site. Strong pitch hook: "your site hasn't been updated in 7 years."

**No Google Analytics or Any Tracking Pixel**
Business has no idea how many visitors they get. Detectable via script src patterns. Another specific service.

### Tier 3 — Useful Context, Lower Priority

**Page Count (single-page vs multi-page)**
A one-page site from 2015 is very different from a maintained multi-page site. Rough proxy for investment level.

**Images Lacking Alt Text**
Basic accessibility and SEO issue. Easy to detect in bulk via Playwright.

**No Favicon**
Minor but visible signal of neglect. Detectable from `<link rel="icon">`.

### Signal Weighting Recommendation

For the heuristic score, weight as follows:
- Mobile PageSpeed score: 40% of total score
- Has valid SSL: 15%
- Has meta title + description: 15%
- Has WhatsApp CTA: 15%
- Is responsive (viewport meta): 15%

Invert the score so that a **low composite score = worse site = higher priority target**.

---

## Outreach Message Patterns

What makes cold messages convert for web development services sold to local Brazilian businesses.

### What Works (Evidence-Based)

**1. Name a Specific Problem You Found**
Generic: "I build websites for local businesses."
Converting: "Eu vi que o site da [Nome da Empresa] demora 9 segundos para carregar no celular — a maioria dos visitantes sai antes de ver seu cardápio."

The specificity signals that you actually looked at their business. This is the core differentiator of AI-generated pitches that use audit data as context. Studies from Lemlist and Smartlead show personalized emails get 25-40% higher open rates and 50-70% better reply rates. [Source: saleshandy.com]

**2. Lead with Their Problem, Not Your Services**
Bad: "Sou desenvolvedor web com 5 anos de experiência..."
Good: "Vi que a [Empresa] não aparece no Google quando alguém busca '[segmento] em [cidade]'..."

People care about their own problems. Your credentials are a footnote, not the headline.

**3. One Clear CTA, Low Friction**
Ask for a response, not a sale. The goal of the first message is a reply, not a signed contract.
"Posso te enviar uma análise rápida do site sem compromisso?" is better than "Entre em contato para um orçamento."

**4. Short Messages Win on WhatsApp**
WhatsApp is a casual channel. Messages over 5 lines look like spam. Keep the initial pitch to 3-4 sentences max. The AI pitch generation should enforce a ~300 token limit (already in PROJECT.md).

**5. Follow Up — 3 Times Minimum**
Data from quickmail.com: agencies that follow up 3+ times get 90% more responses. The tool should make follow-up easy (view previously sent pitch, update status, resend).

**6. Social Proof in One Line**
"Já ajudei 3 restaurantes em [cidade] a dobrar os contatos pelo site" outperforms generic claims. Prompt the user to include their own social proof in the Claude prompt as context.

### Claude Prompt Architecture for Pitch Generation

The generated pitch should receive:
- Business name and segment
- City
- Specific problems found (the 5-problem list)
- Scores (mobile, speed, SEO)
- Whether they have/lack WhatsApp CTA
- User's own social proof (stored in settings)
- Tone: casual but professional, Brazilian Portuguese

Output: 3-4 sentence WhatsApp message, 280-300 tokens max.

### Conversion Benchmarks

- Cold email for web dev services: 1-5% reply rate is good; 5%+ is excellent [Source: cleverly.co]
- WhatsApp cold messages to local businesses: anecdotally higher open rates (80%+) due to channel, but no reliable public data
- Personalized outreach vs template: 2-5x better reply rates

---

## Lead Workflow Patterns

Status flows that work for solo freelancers doing local business outreach.

### Recommended Status Pipeline

```
novo → contatado → respondeu → proposta_enviada → fechado → descartado
```

**novo** — scraped, not yet acted on. Default state.
**contatado** — message sent (WhatsApp or email). User manually advances.
**respondeu** — prospect replied. High priority.
**proposta_enviada** — formal proposal delivered.
**fechado** — won. Client signed.
**descartado** — not interested, bad fit, or already has a good site.

### Why This Pipeline

- 5-6 stages maps to real behavior without being over-engineered
- Apollo/HubSpot use 6-8 stages for enterprise; freelancers need simpler
- "respondeu" is a critical milestone — separates warm from cold leads
- "descartado" is as important as "fechado" — it declutters the active list
- No "nurture" or "re-engage" stage in v1 — adds complexity, low ROI for solo use

### UX Patterns for Lead Lists

**Priority filters (in order of usefulness):**
1. Status filter — most used; "show me only new leads" vs "show me who replied"
2. Score filter or sort — sort by worst site to find easiest pitches
3. Segment / niche filter — when user has scraped multiple niches
4. City filter — when user operates across multiple cities

**Default sort:** score ascending (worst sites first = highest priority targets)

**Default view on load:** filter to `status = novo`, sorted by score ascending. User sees their best targets immediately without any interaction.

**Bulk actions to consider for v1:**
- "Mark all selected as contatado" — saves time after a batch outreach session
- Not required but high-value if there are 30+ leads in the same session

**Table vs card view:**
- Table is more scannable for 30+ leads (see score, status, city at a glance)
- Cards work better for individual lead detail
- Recommendation: table list view + click-to-expand detail panel or detail page

---

## Sources

- [Apollo vs Lemlist comparison 2026 — saleshandy.com](https://www.saleshandy.com/blog/lemlist-vs-apollo/)
- [Hunter.io vs Apollo vs Scrupp 2026 — Scrupp](https://scrupp.com/blog/hunter-io-vs-apollo-vs-scrupp-2026-honest-comparison)
- [Cold Email Templates for Web Design Services — SmartReach](https://smartreach.io/blog/cold-email-templates-for-web-design-services/)
- [Cold Email Outreach Best Practices 2026 — cleverly.co](https://www.cleverly.co/blog/cold-email-outreach-best-practices)
- [Web Design Cold Email Templates — quickmail.com](https://quickmail.com/cold-email/templates/web-design-templates)
- [How to Get Web Dev Clients 2025 — saleshandy.com](https://www.saleshandy.com/blog/how-to-get-clients-for-web-development/)
- [About PageSpeed Insights — Google for Developers](https://developers.google.com/speed/docs/insights/v5/about)
- [PageSpeed Score Thresholds — wpspeedfix.com](https://www.wpspeedfix.com/low-score-in-google-pagespeed-insights-or-lighthouse-mobile-test/)
- [Pipeline Stages for Freelancers — nmd.imporinfo.com](https://nmd.imporinfo.com/2026/04/pipeline-stages-that-fit-freelancers-5.html)
- [Designing Effective Lead Filters in SaaS — Medium/Anubha Porwal](https://medium.com/@porwalanubha99/designing-effective-lead-filters-in-saas-ux-ui-design-examples-for-optimized-engagement-11a4f45aae57)
- [Local SEO Audit Checklist 2026 — revved.digital](https://revved.digital/the-complete-local-seo-audit-checklist-for-2026/)
