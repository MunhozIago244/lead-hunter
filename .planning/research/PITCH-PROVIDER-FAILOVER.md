# Pitch Provider Failover Flow

## Objetivo

Adaptar o `POST /api/pitch` para usar **dois providers de IA** com fallback automático:

- `anthropic`
- `openai`

O dashboard e o endpoint continuam iguais para o frontend. A mudança acontece apenas na camada server-side de geração de pitch.

---

## Estado Atual

Hoje o fluxo é:

1. UI chama `POST /api/pitch`
2. `app/api/pitch/route.ts` valida auth, origin, CSRF e rate limit
3. rota carrega o lead no Supabase
4. `lib/pitch.ts` usa **somente Anthropic**
5. pitch é salvo na tabela `leads`
6. resposta retorna `{ pitch }`

Problema:

- se Anthropic estiver indisponível
- se houver timeout
- se a chave estiver ausente
- se houver rate limit do provider

então o fluxo inteiro falha, mesmo que outro provider esteja disponível.

---

## Fluxo Desejado

### Visão Geral

1. UI chama `POST /api/pitch`
2. rota faz validações normais
3. rota carrega o lead
4. `lib/pitch.ts` monta o prompt uma única vez
5. camada de provider resolve a ordem de execução:
   - provider primário
   - provider secundário
6. sistema tenta o provider primário
7. se falhar por indisponibilidade recuperável, tenta o fallback
8. se algum provider gerar pitch válido:
   - salva no Supabase
   - retorna `{ pitch, provider }`
9. se ambos falharem:
   - log estruturado por provider
   - resposta controlada ao cliente

---

## Contrato Proposto

### Env vars

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `PITCH_PRIMARY_PROVIDER=anthropic`
- `PITCH_FALLBACK_PROVIDER=openai`

Valores válidos para provider:

- `anthropic`
- `openai`
- `none`

Exemplos:

```env
PITCH_PRIMARY_PROVIDER=anthropic
PITCH_FALLBACK_PROVIDER=openai
```

```env
PITCH_PRIMARY_PROVIDER=openai
PITCH_FALLBACK_PROVIDER=anthropic
```

```env
PITCH_PRIMARY_PROVIDER=anthropic
PITCH_FALLBACK_PROVIDER=none
```

---

## Estrutura Recomendada

### `lib/pitch.ts`

Transformar em orquestrador:

- `buildPitchPrompt(lead)`
- `generatePitchForLead(lead)`
- `resolvePitchProviderOrder()`
- `shouldRetryWithFallback(error)`

### `lib/pitch/anthropic.ts`

Responsável por:

- validar `ANTHROPIC_API_KEY`
- chamar Anthropic
- aplicar timeout
- normalizar resposta em texto

### `lib/pitch/openai.ts`

Responsável por:

- validar `OPENAI_API_KEY`
- chamar OpenAI
- aplicar timeout
- normalizar resposta em texto

### `lib/pitch/types.ts`

Tipos sugeridos:

```ts
export type PitchProvider = 'anthropic' | 'openai'

export type PitchGenerationResult = {
  pitch: string
  provider: PitchProvider
}
```

---

## Critério de Fallback

O fallback deve acontecer apenas para falhas recuperáveis.

### Deve tentar o provider secundário

- chave ausente no provider primário
- timeout
- erro 429
- erro 5xx do provider
- indisponibilidade de rede
- resposta vazia do provider

### Não deve tentar o provider secundário

- prompt inválido gerado internamente
- lead inválido
- erro de banco
- erro de autenticação do usuário
- erro de CSRF/origin/rate limit da rota

---

## Fluxo Detalhado

### Caso 1: primário funciona

1. resolver ordem: `anthropic -> openai`
2. chamar Anthropic
3. receber pitch
4. salvar pitch
5. responder com:

```json
{
  "pitch": "...",
  "provider": "anthropic"
}
```

### Caso 2: primário falha, fallback funciona

1. resolver ordem: `anthropic -> openai`
2. Anthropic falha com timeout
3. registrar log estruturado
4. chamar OpenAI
5. receber pitch
6. salvar pitch
7. responder com:

```json
{
  "pitch": "...",
  "provider": "openai"
}
```

### Caso 3: ambos falham

1. Anthropic falha
2. OpenAI falha
3. registrar ambos os erros
4. responder:

```json
{
  "error": "Pitch generation is temporarily unavailable."
}
```

---

## Logging Recomendado

Cada tentativa deve registrar:

- `provider`
- `leadId`
- `attempt`
- `durationMs`
- `result`: `success` ou `failure`
- `errorType`

Exemplo:

```ts
logger.info(
  { provider: 'anthropic', leadId, durationMs: 842, result: 'success' },
  '[pitch] Provider success'
)
```

```ts
logger.error(
  { provider: 'openai', leadId, errorType: 'timeout' },
  '[pitch] Provider failure'
)
```

---

## Ajuste na API Route

`app/api/pitch/route.ts` continua responsável por:

- auth
- same-origin
- CSRF
- rate limit
- leitura do lead
- persistência do pitch

Mas passa a chamar:

```ts
const result = await generatePitchForLead(lead)
```

e salvar:

```ts
const pitch = result.pitch
```

Opcionalmente, responder também o provider:

```ts
return apiJson({ pitch: result.pitch, provider: result.provider })
```

---

## Impacto no Frontend

O frontend atual pode continuar funcionando sem mudança se continuar lendo só `pitch`.

Melhoria opcional:

- exibir um badge pequeno:
  - `Gerado por Anthropic`
  - `Gerado por OpenAI`

Mas isso não é obrigatório para a migração.

---

## Ordem Segura de Implementação

1. adicionar env vars novas
2. criar `lib/pitch/types.ts`
3. extrair provider Anthropic
4. adicionar provider OpenAI
5. criar orquestrador com fallback
6. atualizar `POST /api/pitch`
7. validar logs e mensagens de erro
8. testar 4 cenários:
   - Anthropic ok
   - Anthropic falha, OpenAI ok
   - OpenAI primário ok
   - ambos indisponíveis

---

## Decisões de Produto em Aberto

1. A resposta da API deve incluir o campo `provider`?
2. O fallback deve acontecer também para erro 401/403 do provider, ou isso deve ser tratado como configuração quebrada?
3. O sistema deve persistir qual provider gerou o pitch em banco, ou apenas retornar isso na resposta?
4. Devemos manter Anthropic como padrão, ou OpenAI passa a ser o provider primário?
