# Design: DevOps CI/CD Strategy

## 1. Branch Strategy

```
main          ← prod, Railway autodeploy, protegido (require PR)
feature/<name> ← openspec changes (ya convención existente)
hotfix/<name>  ← fixes urgentes a prod, merge directo a main con PR
```

**Regla**: nada directo a `main`. Todo PR. `main` siempre deployable.

Branch protection rules en GitHub:
- Require PR before merge
- Require status checks to pass (ci job)
- No force push

---

## 2. CI Pipeline — `.github/workflows/`

### `ci.yml` (PR gate)
```yaml
on:
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: node --check server.js index.js src/agent.js src/state.js src/system-prompt.js src/chatwoot.js
```

### `deploy.yml` (existente, extender)
```yaml
# Añadir después del deploy:
- name: Re-index codebase
  run: npx @fission-ai/codebase-memory-mcp index --path . --output .codebase-memory/graph.db.zst

- name: Upload artifact to Railway Object Storage
  run: |
    # ponytail: railway CLI o curl al bucket — definir cuando bucket exista
    echo "TODO: upload graph.db.zst to Railway bucket"
```

---

## 3. Artifact Management

`.gitignore` añadir:
```
.codebase-memory/
```

Flujo de artifact:
```
merge main
  → CI re-index
  → upload graph.db.zst → Railway Object Storage bucket "codebase-memory"
  → dev local: si no existe .codebase-memory/, download del bucket O re-index local (~5s)
```

**Ponytail**: hasta que el bucket esté configurado, re-index local es suficiente. No bloquea.

---

## 4. Observabilidad Agentic (Sensores)

Patrón GH-600: cada agente necesita 4 sensores mínimos.

### Sensor 1: Trace estructurado por conversación
En `src/agent.js`, cada run del agente emite al final:

```js
console.log(JSON.stringify({
  type: 'agent_trace',
  phone: phone.slice(-4),          // solo últimos 4 dígitos (privacidad)
  turns: messages.length,
  tools_called: toolsUsed,         // array de tool names
  stop_reason: response.stop_reason,
  input_tokens: usage.input_tokens,
  output_tokens: usage.output_tokens,
  duration_ms: Date.now() - startTime,
}))
```

Railway captura stdout → Railway Logs → filtrar por `agent_trace`.

### Sensor 2: Cost tracking
```js
// En agent.js — acumular por sesión
session.totalTokens = (session.totalTokens || 0) + usage.input_tokens + usage.output_tokens
// ~$0.003 por 1K tokens (Sonnet) → log cuando sesión supere umbral
if (session.totalTokens > 50_000) {
  console.log(JSON.stringify({ type: 'cost_alert', phone: phone.slice(-4), tokens: session.totalTokens }))
}
```

### Sensor 3: Health endpoint con métricas
En `server.js`, extender `/health`:

```js
// GET /health → ya existe
// Añadir métricas en la respuesta:
{
  status: 'ok',
  activeSessions: sessions.size,
  completedSessions: completedCount,  // contador global
  uptimeSeconds: Math.floor(process.uptime()),
}
```

### Sensor 4: Error rate por webhook
```js
// server.js — contar 4xx/5xx del agente
let webhookErrors = 0
let webhookTotal = 0
// En /webhook handler: webhookTotal++, en catch: webhookErrors++
// Exponer en /health
```

---

## 5. .gitignore additions

```
# Codebase memory index (re-generar local o descargar de bucket)
.codebase-memory/

# Env local
.env
```

---

## Decisiones explícitas (ADR)

| Decisión | Elegido | Descartado | Razón |
|---|---|---|---|
| Branch model | GitHub Flow | Git Flow | 1 dev, complejidad innecesaria |
| Test gate | `node --check` | Jest/Vitest | Riesgo real = SyntaxError, no lógica |
| Artifact storage | Railway Object Storage | Git LFS / repo | Artifacts binarios no van en git |
| Observability | structured stdout → Railway Logs | OpenTelemetry | Suficiente hasta >100 sess/día |
| `develop` branch | NO | — | YAGNI hasta +1 dev |
