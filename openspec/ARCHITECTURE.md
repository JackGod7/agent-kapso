# Agent Kapso — Arquitectura completa

Mapa de qué existe, qué crea, qué actualiza, qué elimina.

---

## Archivos del sistema

```
agent-kapso/
├── server.js              — HTTP server (Express)
├── index.js               — WhatsApp client (sendText via Kapso API)
└── src/
    ├── agent.js           — Claude agent loop + tool execution
    ├── state.js           — Session store (in-memory)
    └── system-prompt.js   — SYSTEM_PROMPT + TOOLS definitions
```

---

## Flujo de datos (mensaje entrante)

```
Usuario WhatsApp
  → Kapso Platform
    → POST /webhook (server.js)
      → verifySignature()             [lee: req.headers, req.rawBody]
      → filtro: solo text messages    [BUG: stickers/edits pasan igual]
      → runAgent(phone, text, info)   [src/agent.js]
        → getSession(phone)           [crea o lee session en Map]
        → push user msg → history     [actualiza: session.history]
        → anthropic.messages.create() [Claude API — lee: SYSTEM_PROMPT, TOOLS, history]
        → si tool_use → executeTool() [ejecuta tool, push result]
        → loop hasta end_turn
        → retorna reply string
      → sendText(phone, reply)        [index.js → Kapso API → WhatsApp]
```

---

## Estado de sesión (src/state.js)

Un objeto por número de teléfono. Vive en memoria RAM. Se pierde al reiniciar.

```js
{
  phase: 'nuevo',       // string — no usado actualmente por el agent
  variables: {},        // Map de save_variable() calls
  history: [],          // Array de mensajes Claude (crece sin límite ⚠️)
  waiting: false,       // set por enter_waiting (being removed en v2)
  completed: false,     // set por complete_task() o handoff_to_human()
}
```

**CREA**: `getSession(phone)` — si no existe, crea nueva sesión vacía  
**ACTUALIZA**: cada mensaje push a `history`; `save_variable` actualiza `variables`  
**NUNCA ELIMINA**: sessions Map nunca hace `.delete()` — memory leak en producción ⚠️

---

## Tools disponibles (src/system-prompt.js → TOOLS)

| Tool | Qué hace al state |
|---|---|
| `get_whatsapp_context` | Lee: `contactInfo` (externo, no state) |
| `get_variable(name)` | Lee: `session.variables[name]` |
| `save_variable(name, value)` | **Actualiza**: `session.variables[name]` |
| `handoff_to_human(reason)` | **Actualiza**: `session.completed = true` |
| `complete_task()` | **Actualiza**: `session.completed = true` |
| ~~`enter_waiting()`~~ | ~~Actualizaba: `session.waiting = true`~~ (eliminada en v2) |

---

## Kapso API (externa)

Usada en dos direcciones:

**Inbound** (Kapso → nosotros):
- `POST /webhook` — eventos de mensajes WhatsApp
- Header `x-webhook-event: whatsapp.message.received`
- Body: `{ message: { type, text, ... }, conversation: { phone_number, kapso: { contact_name } } }`

**Outbound** (nosotros → Kapso):
- `sendText(to, body)` via `@kapso/whatsapp-cloud-api`
- Endpoint: `https://api.kapso.ai/meta/whatsapp`
- Auth: `KAPSO_API_KEY`

**Observabilidad** (nosotros → Kapso, scripts en .agents/):
- `GET /platform/v1/whatsapp/conversations` — listar conversaciones
- `GET /platform/v1/whatsapp/messages` — listar mensajes
- `GET /platform/v1/whatsapp/conversations/:id` — detalle de conversación

---

## Bugs conocidos en producción

| # | Archivo | Línea | Problema |
|---|---|---|---|
| B1 | server.js | 43 | Unsupported msgs (stickers, edits, audio) no filtrados → Claude recibe texto de error |
| B2 | server.js | 52 | No verifica `session.completed` → bot responde después de handoff |
| B3 | agent.js | 76-79 | `enter_waiting` llamaba Claude de nuevo → mensajes repetidos (en v2 se elimina) |
| B4 | agent.js | 73 | `handoff_to_human` no notifica a Jack |
| B5 | state.js | 3 | `sessions` Map nunca limpia → memory leak |
| B6 | state.js | 8 | `session.history` crece sin límite → tokens explotan en conversaciones largas |
| B7 | server.js | — | No deduplicación por message ID → si Kapso reintenta, mensaje procesado dos veces |

---

## Bugs adicionales (de revisión de conversaciones reales)

| # | Archivo | Observado | Problema |
|---|---|---|---|
| B8 | server.js | Jack conv | Bot responde a cada mensaje por separado — usuario manda 3 en 5s → 3 respuestas |
| B9 | server.js/index.js | Jack conv | Sin typing indicator → bot aparece de la nada, parece robótico |
| B10 | agent.js | Jack conv | Post-rechazo ("no quiero comprar") bot sigue respondiendo — complete_task no se llama |
| B11 | system-prompt | Jack conv | session.completed=true persiste para siempre → usuario que vuelve días después queda silenciado |
| B12 | index.js | Jack conv | Solo sendText — no puede enviar temario/PDF/imágenes cuando prospecto pide evidencia |
| B13 | agent.js | Jack conv | Claude usó carácter Cirílico 'р' en "agрupar" — encoding bug del modelo |

---

## Changes en openspec (estado)

### 🔴 Crítico (bugs en producción hoy)
| Change | Estado |
|---|---|
| `fix-message-filtering` | ⏳ spec listo — stickers/edits crashean bot, session.completed ignorado |
| `silence-after-completion` | ⏳ spec listo — bot habla después de handoff/rechazo |
| `message-batching` | ⏳ spec listo — responde cada mensaje por separado |

### 🟡 Alta prioridad (UX y ventas)
| Change | Estado |
|---|---|
| `agent-sales-prompt-v2` | 🔄 en implementación (otra sesión) |
| `jack-handoff-notification` | ⏳ spec listo — Jack no se entera de leads |
| `fix-repeated-messages` | ⏳ spec listo — safety net para msgs duplicados |
| `typing-indicator` | ⏳ spec listo — hacer el bot más humano |
| `whatsapp-media-outbound` | ⏳ spec listo — enviar temario/testimonios como PDF/imagen |

### 🟠 Infraestructura (antes de escalar)
| Change | Estado |
|---|---|
| `history-trimming` | ⏳ spec listo — tokens explotan en convos largas |
| `session-persistence` | ⏳ spec listo — sesiones se pierden al reiniciar |
| `chatwoot-kapso-architecture` | ⏳ pendiente — requiere Chatwoot en Railway |

### ✅ Completado
| Change | Estado |
|---|---|
| `deploy-webhook-kapso` | ✅ completo — bot en producción Railway |

---

## Estado del repositorio (2026-06-27)

- **Git**: repo padre en `products/` — `agent-kapso/` completamente sin commitear
- **Remote**: ninguno — no hay GitHub
- **Branches**: solo `master` en el repo padre
- **Riesgo**: TODO el código vive solo en disco local — cualquier problema de disco = pérdida total
