# UI Redesign — Warm Studio

**Date:** 2026-04-17  
**Scope:** Lead list dashboard + CRM kanban visual overhaul + drag-and-drop stage management  
**Approach:** Opção B "Warm Studio" — identidade visual forte, creme + teal, micro-animações leves, sem custo de performance relevante

---

## 1. Fundação Visual

### Tokens novos / ajustados

| Token CSS | Valor | Uso |
|---|---|---|
| `--accent` (light) | `#0a6b52` | Ações primárias, score excelente |
| `--surface` | `rgba(255,252,248,0.92)` | Superfície padrão de cards |
| `--surface-strong` | `#fffdf6` | Superfície sólida (slide-over, inputs) |
| `--card-gradient` | `linear-gradient(135deg,#fffdf6 0%,#f7f4e8 100%)` | Gradiente interno dos cards |
| `--glow-accent` | `rgba(10,107,82,0.12)` | Box-shadow do card selecionado |

### Tipografia

- Score médio nos cards: `text-4xl font-bold` com cor dinâmica (warning / amber / accent)
- Nomes de empresa: `text-xl font-semibold tracking-[-0.03em]`
- Labels de meta: sem alteração (já corretos)

### Sombras

- **Card repouso:** `shadow-[0_2px_8px_rgba(17,24,18,0.06),0_0_0_1px_rgba(17,24,18,0.04)]`
- **Card hover:** `shadow-[0_8px_24px_rgba(17,24,18,0.10)]` + `transform: translateY(-2px)`
- **Card selecionado:** `ring-2 ring-accent shadow-[0_0_0_4px_var(--glow-accent)]`
- **Slide-over:** `shadow-[−24px_0_48px_rgba(17,24,18,0.14)]`

---

## 2. Dashboard de Leads

### Layout

- Abandona o grid split `1.18fr / 0.82fr`
- Lista ocupa 100% da largura disponível
- Detalhe do lead abre como **slide-over** flutuante pela direita (480px)

### Cards de Lead

Anatomia horizontal:

```
┌─────────────────────────────────────────────────────────┐
│ ☐  [badge status]                          score médio  │
│                                                         │
│    Nome da Empresa                           ████ 73   │
│    segmento · cidade · sem site            barra fina   │
│                                                         │
│    📞 (19) 9xxxx-xxxx    🌐 dominio.com.br              │
└─────────────────────────────────────────────────────────┘
```

- **Score:** `text-4xl font-bold` à direita, cor dinâmica
- **Barra de progresso:** 4px de altura, `rounded-full`, cor dinâmica, logo abaixo do score
- **Telefone e site** visíveis diretamente no card
- **Background:** `var(--card-gradient)` interno
- **Selecionado:** ring accent + glow-accent box-shadow
- **Hover:** `-translate-y-0.5` + sombra elevada, `transition-all duration-200`
- **Checkbox:** absoluto top-left, aparece sempre (não só no hover)

### Filtros

- Quick filters viram **pill-bar horizontal** compacta (height ~36px) no lugar dos cards grandes atuais
- Status / Segmento / Cidade colapsam num botão **"Filtros ▾"** que expande um inline dropdown abaixo
- Busca por nome permanece como input separado

### Slide-over (Detalhe do Lead)

- **Largura:** 480px fixo, full-height
- **Backdrop:** overlay `bg-foreground/20 backdrop-blur-sm` cobre a lista
- **Fundo:** `--surface-strong` sólido
- **Header fixo:** nome da empresa + status badge + botão `✕` fechar
- **Corpo com scroll:** score cards, pitch box, CRM box
- **Animação entrada:** `translate-x-full → translate-x-0`, `transition-transform duration-300 ease-out`
- **Animação saída:** `translate-x-0 → translate-x-full`, `duration-200`
- **Fechar:** clique no overlay, botão ✕, ou tecla `Escape`

---

## 3. CRM Kanban

### Headers de Coluna por Estágio

| Estágio(s) | Cor do border-top | Significado |
|---|---|---|
| `new`, `researching` | `#94a3b8` slate | Descoberta |
| `proposal_ready`, `contacted` | `#f59e0b` amber | Em andamento |
| `awaiting_reply`, `replied` | `var(--accent)` teal | Ativo |
| `meeting_scheduled` | `#8b5cf6` roxo | Urgente |
| `won` | accent forte + fundo teal/10 | Fechado positivo |
| `lost` | warning + fundo warning/8 | Encerrado |

### Cards de Account

Anatomia:

```
┌────────────────────────────────┐
│ ⠿  Nome da Empresa             │  ← grip handle (hover)
│     segmento · cidade          │
│                                │
│  [stage badge]  [reply badge]  │
│  📅 follow-up: em 3 dias       │  ← amber se ≤7d, warning se vencido
│                                │
│  ░░░░░░░░░░░░ score 68         │  ← barra fina no rodapé
└────────────────────────────────┘
```

- **Grip handle `⠿`:** visível no hover, `cursor: grab`
- **Score bar:** 3px, `rounded-full`, cor dinâmica, rodapé do card
- **Follow-up badge:** destaque amber se dentro de 7 dias, warning se vencido
- **Hover:** `-translate-y-0.5` + sombra elevada

### Drag-and-Drop

**Biblioteca:** `@dnd-kit/core` + `@dnd-kit/sortable`  
Motivo: leve (~10kb), sem dependências externas, acessível (teclado), sem layout thrashing.

**Comportamento durante o drag:**
- Card original: `opacity-40`, placeholder com borda dashed accent
- Card arrastado: flutua com `shadow-[0_16px_48px_rgba(17,24,18,0.22)]`, `rotate-1`
- Coluna destino ativa: `ring-2 ring-accent` + fundo `bg-accent/5`

**Comportamento ao soltar:**
1. Card aparece na nova coluna com animação de entrada (`scale-95 → scale-100`)
2. Card exibe inline: `"Mover para [Estágio]? [Confirmar] [Cancelar]"` por até 6 segundos
3. **Confirmar** → `PATCH /api/crm/accounts/[id]` com `{ stage: novoStage }` → persiste
4. **Cancelar / timeout** → card anima de volta para coluna original (`translate + opacity`)

**Estado otimista:** card permanece na nova posição visualmente enquanto a requisição resolve. Se a API falhar, volta com toast de erro.

### Scroll do Kanban

- `overflow-x-auto` com `scroll-snap-type: x mandatory`
- Cada coluna: `scroll-snap-align: start`
- Scrollbar estilizada: fina (4px), cor `--border`

---

## 4. Dependências Novas

| Pacote | Versão | Motivo |
|---|---|---|
| `@dnd-kit/core` | latest | Drag-and-drop engine |
| `@dnd-kit/sortable` | latest | Ordenação entre listas |
| `@dnd-kit/utilities` | latest | Helpers CSS transform |

---

## 5. Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| `app/globals.css` | Novos tokens CSS, ajuste de accent, card-gradient, glow-accent |
| `components/dashboard/lead-list-dashboard.tsx` | Novo layout, pill-bar filtros, cards redesenhados, slide-over |
| `components/dashboard/lead-detail-panel.tsx` | Adaptação para slide-over (sem width própria) |
| `components/crm/crm-workspace.tsx` | Kanban com dnd-kit, card redesenhado, headers por estágio, confirm inline |
| `package.json` | Adicionar @dnd-kit/* |

---

## 6. O que NÃO muda

- Lógica de fetch, filtros, status update bulk — sem alteração
- API routes — sem alteração
- Estrutura de componentes (LeadScoreCard, LeadStatusBadge, etc.) — reutilizados
- Dark mode — tokens novos respeitam `@media (prefers-color-scheme: dark)`
- Responsividade — breakpoints existentes mantidos

---

## 7. Critérios de Sucesso

- [ ] Slide-over abre/fecha com animação fluida sem jank
- [ ] Drag-and-drop funciona com mouse e teclado
- [ ] Confirmação de mudança de stage aparece inline e timeout reverte corretamente
- [ ] Score aparece em `text-4xl` com cor correta nos cards
- [ ] Filtros em pill-bar compacta sem perda de funcionalidade
- [ ] Nenhuma regressão nas features existentes (bulk update, CSV export, analytics link)
