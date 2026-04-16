# Phase 2: Scraper Discovery - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

CLI Python que aceita `--query`, `--city`, `--max` e retorna negócios do Google Maps Places API (New), salvando no Supabase via upsert. Fase entrega apenas discovery — sem análise de sites (fase 3) ou lógica de persistência avançada (fase 4).

Entregável: `python scraper/scraper.py --query "dentista" --city "Campinas" --max 20` roda sem erro e salva leads no Supabase.

</domain>

<decisions>
## Implementation Decisions

### Estrutura de arquivo
- **D-01:** Arquivo único `scraper/scraper.py` — sem módulos separados na v1. Fases 3 e 4 adicionam funções no mesmo arquivo. Simples para ferramenta CLI solo.

### CLI Output durante execução
- **D-02:** Exibir `tqdm` progress bar + log por empresa abaixo: `[N/MAX] Nome da empresa — salvo` (ou `atualizado` se upsert atualizou um existente).
- **D-03:** Ao terminar, exibir resumo: `Concluído: X novos, Y atualizados, Z erros`.

### Paginação do Google Maps
- **D-04:** Seguir `nextPageToken` automaticamente — se `--max 50`, faz múltiplas chamadas encadeadas (20+20+10). Para exatamente em `--max` resultados ou quando não houver mais páginas.
- **D-05:** Valor padrão de `--max` quando não especificado: `20` (uma página, uma chamada de API).

### Campo `segment`
- **D-06:** Popular `segment` com o valor de `--query`, normalizado: `strip()` + `title()`. Exemplo: `"  dentista  "` → `"Dentista"`, `"advocacia"` → `"Advocacia"`.
- **D-07:** Não usar tipos da Places API para `segment` — eles vêm em inglês e em categorias genéricas.

### Claude's Discretion
- Estrutura interna das funções dentro de `scraper.py` (organização de helpers, funções privadas)
- Detalhes do exponential backoff (número de tentativas, delay inicial, fator multiplicador) — DISC-05
- Formato exato do field mask na requisição Places API — desde que cubra todos os campos necessários (DISC-06)
- Tratamento de campos ausentes da API (ex: empresa sem telefone ou sem site)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack e dependências
- `CLAUDE.md` — Stack completo: versões pinadas, padrões @supabase/ssr, API keys, model IDs, what NOT to use
- `.planning/REQUIREMENTS.md` — DISC-01 a DISC-06 com critérios exatos de aceitação

### Google Maps Places API (New)
- Endpoint: `POST https://places.googleapis.com/v1/places:searchText`
- Field mask header: `X-Goog-FieldMask: places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus`
- Paginação: campo `nextPageToken` na resposta; enviar como `pageToken` no body da próxima requisição
- Auth: header `X-Goog-Api-Key`

### Supabase (Python scraper)
- Usar `supabase-py` 2.28.3, sync client
- Usar `SUPABASE_SERVICE_ROLE_KEY` (não anon key) — scraper roda server-side
- Upsert via constraint `leads_name_city_unique` (definida na fase 1)

### Schema da tabela leads
- Definido em `supabase/migrations/20260416000000_create_leads_table.sql` (fase 1)
- Tipos TypeScript espelho em `types/lead.ts` (fase 1)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scraper/requirements.txt` (planejado em 01-01-PLAN.md) — todas as deps já pinadas: `supabase==2.28.3`, `playwright==1.49.0`, `tf-playwright-stealth==2.0.2`, `requests==2.31.0`, `tqdm==4.66.0`, `python-dotenv==1.0.0`, `anthropic==0.96.0`
- `types/lead.ts` (planejado em 01-02-PLAN.md) — types `Lead`, `LeadStatus`, `LeadUpdate` para referência de schema

### Established Patterns
- Nenhum código executado ainda (fase 1 não rodou). Seguir os padrões do CLAUDE.md e STACK.md.

### Integration Points
- Scraper conecta ao Supabase via `SUPABASE_SERVICE_ROLE_KEY` e `NEXT_PUBLIC_SUPABASE_URL` do `.env`
- Tabela alvo: `leads` com constraint `leads_name_city_unique (name, city)` para upsert

</code_context>

<specifics>
## Specific Ideas

- Comando esperado: `python scraper/scraper.py --query "dentista" --city "Campinas" --max 20`
- Output esperado durante execução: progress bar tqdm + `[1/20] Dentista João — salvo`
- Output esperado ao final: `Concluído: 18 novos, 2 atualizados, 0 erros`
- Segment normalizado: `"dentista"` → `"Dentista"` (strip + title case)
- Paginação: `--max 50` faz 3 chamadas automáticas via nextPageToken

</specifics>

<deferred>
## Deferred Ideas

Nenhuma ideia fora do escopo surgiu durante a discussão.

</deferred>

---

*Phase: 02-scraper-discovery*
*Context gathered: 2026-04-16*
