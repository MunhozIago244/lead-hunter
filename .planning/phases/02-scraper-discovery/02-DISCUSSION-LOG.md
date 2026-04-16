# Phase 2: Scraper Discovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 02-scraper-discovery
**Areas discussed:** Estrutura do arquivo, Output do CLI durante execução, Paginação do Google Maps, Segmento (segment field)

---

## Estrutura do arquivo

| Option | Description | Selected |
|--------|-------------|----------|
| Arquivo único scraper.py | Tudo em scraper/scraper.py. Simples de rodar, fácil de entender. As fases 3 e 4 adicionam funções no mesmo arquivo. | ✓ |
| Módulos separados | scraper/discovery.py, scraper/persistence.py, scraper/main.py. Mais organizado, mas overhead desnecessário. | |

**User's choice:** Arquivo único scraper.py
**Notes:** Ferramenta CLI solo — simplicidade é prioridade.

---

## Output do CLI durante execução

| Option | Description | Selected |
|--------|-------------|----------|
| Progress bar + log por empresa | tqdm progress bar + log por empresa: nome, status do save. | ✓ |
| Só progress bar | Apenas tqdm mostrando progresso. | |

**User's choice:** Progress bar + log por empresa

| Option | Description | Selected |
|--------|-------------|----------|
| Resumo final com contagem | "Concluído: X novos, Y atualizados, Z erros" | ✓ |
| Finalizar silenciosamente | Sem summary extra. | |

**User's choice:** Resumo final com contagem de salvos/atualizados/erros

---

## Paginação do Google Maps

| Option | Description | Selected |
|--------|-------------|----------|
| Seguir nextPageToken automaticamente | Chamadas encadeadas até --max ou sem mais páginas. | ✓ |
| Limitar a 20 na v1 | Cap em 20, paginação fica para v2. | |

**User's choice:** Seguir nextPageToken automaticamente

| Option | Description | Selected |
|--------|-------------|----------|
| Default --max 20 | Uma página, uma chamada de API. | ✓ |
| Default --max 50 | 2-3 páginas, mais leads por execução. | |

**User's choice:** 20 (uma página)

---

## Segmento (segment field)

| Option | Description | Selected |
|--------|-------------|----------|
| Usar valor de --query como segment | segment = --query normalizado. Simples e consistente. | ✓ |
| Usar tipo do negócio da API | Tipos da Places API (em inglês, genéricos). | |
| Deixar segment como null | Popular em fase posterior. | |

**User's choice:** Usar valor de --query como segment

| Option | Description | Selected |
|--------|-------------|----------|
| Normalizar: strip + title case | "dentista" → "Dentista" | ✓ |
| Salvar como digitado | Sem alterações. | |

**User's choice:** Sim — strip + title case

---

## Claude's Discretion

- Estrutura interna das funções dentro de scraper.py
- Detalhes do exponential backoff (tentativas, delay, fator)
- Formato exato do field mask na requisição

## Deferred Ideas

Nenhuma ideia fora do escopo surgiu durante a discussão.
