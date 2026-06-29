# Spec — Chatwoot Session Schema

## Campo nuevo: `chatwootConversationId`

```js
// Session object completo (src/state.js)
{
  history:                [],        // mensajes Claude (user/assistant/tool_result)
  variables:              {},        // datos del prospecto (nombre, fase, urgencia, etc.)
  completed:              false,     // true después de handoff/complete_task
  completedAt:            null,      // Date.now() ms en el momento de completar, o null
  lastReply:              null,      // último texto enviado al usuario (dedup entre mensajes)
  totalTokens:            0,         // acumulado para cost_alert (input + output tokens)
  source:                 'organic', // tiktok | facebook_ad | instagram_ad | meta_referral | organic
  humanMode:              false,     // true = bot silenciado, agente humano activo via Chatwoot
  chatwootConversationId: null,      // ← NUEVO: integer Chatwoot conv ID o null
}
```

### Tipos y validación del campo nuevo

| Propiedad | Tipo JS | Valor Redis (JSON) | Inválido |
|-----------|---------|-------------------|----------|
| `chatwootConversationId` | `number \| null` | `21` o `null` | `undefined`, `0`, string `"21"`, negativo |

Al guardar: `Number.isInteger(session.chatwootConversationId) && session.chatwootConversationId > 0` → válido.  
Al leer: si el campo es `undefined` (sesión pre-deploy) o `null` → tratar como "no existe todavía".  
Al leer: si el campo es `0` o negativo → bug — loguear y tratar como null.

---

## Máquina de estados

```
                ┌──────────────────────────────────────────────────────────┐
                │                    SESSION                               │
                │                                                          │
                │  chatwootConversationId: null                            │
                │                  │                                       │
                │   primer mensaje  │  ensureChatwootConversation()         │
                │                  ▼                                       │
                │  chatwootConversationId: N  ←──────────────────────┐    │
                │                  │    │                             │    │
                │    cada mensaje   │    │  Chatwoot 5xx/timeout       │    │
                │    (forward ok)   │    │  → campo permanece N        │    │
                │                  │    │  → próximo intento reutiliza │    │
                │                  ▼    │                             │    │
                │  [mensajes en Chatwoot conv N]                      │    │
                │                  │                                  │    │
                │     ┌────────────┼────────────┐                    │    │
                │     ▼            ▼            ▼                    │    │
                │  handoff    complete_task   24h expiry              │    │
                │     │            │            │                    │    │
                │     └──────┬─────┘            │                    │    │
                │            ▼                  ▼                    │    │
                │  updateStatus(open/resolved)   updateStatus(resolved)    │
                │  label = HANDOFF/completada    label = 24h expiry        │
                │            │                  │                    │    │
                │            └──────────────────┘                    │    │
                │                       │                            │    │
                │                  resetSession                       │    │
                │                       │                            │    │
                │                       ▼                            │    │
                │  chatwootConversationId: null (nueva sesión) ───────┘    │
                │                                                          │
                └──────────────────────────────────────────────────────────┘
```

---

## Ciclo de vida detallado

```
Estado: null
  │
  ├─ chatwootForward(incoming, primer mensaje)
  │    └─ ensureChatwootConversation()
  │         ├─ Chatwoot OK → chatwootConversationId = N
  │         │   └─ saveSession() persiste a Redis
  │         └─ Chatwoot error → campo sigue null; log [CHATWOOT-RT]
  │
  ├─ chatwootForward(outgoing, bot reply)
  │    └─ ensureChatwootConversation()
  │         └─ field ya es N → return N sin llamar API
  │
  ├─ (N-2, N-3, ... mensajes adicionales — cada uno usa campo N sin re-crear)
  │
  ├─ [trigger de cierre]
  │    handoff_to_human → archiveToChatwoot → updateStatus(N, open, label)
  │    complete_task    → archiveToChatwoot → updateStatus(N, resolved, label)
  │    24h expiry       → archiveToChatwoot → updateStatus(N, resolved, label)
  │                                         → resetSession → Redis.DEL s:<phone>
  │
  └─ (nueva sesión del mismo lead → chatwootConversationId = null de nuevo)
```

---

## Persistencia en Redis

```
Key: s:<phone>          (ej: s:51965132214)
TTL: ninguno            (sesiones no expiran por TTL — solo por RESET_AFTER_MS logic)
Valor: JSON.stringify(session)
```

**Timing crítico:** `saveSession` debe llamarse INMEDIATAMENTE después de que `ensureChatwootConversation` setea el campo en session, ANTES de `runAgent`. Si el proceso muere entre estos dos eventos, el ID se pierde (acepted risk v1).

```js
// orden correcto en processMessages:
await chatwootForward(phone, session, text, 'incoming', contactInfo);
await saveSession(phone, session);  // ← persiste chatwootConversationId a Redis
const reply = await runAgent(...);  // ← si el proceso muere aquí, el ID YA está en Redis
```

---

## Invariantes

| ID | Invariante | Violación y consecuencia |
|----|-----------|------------------------|
| I1 | Si `chatwootConversationId = N`, conv N existe en Chatwoot | Violación: conv eliminada manualmente → postMessage da 404 → mensajes perdidos en Chatwoot (bot funciona) |
| I2 | `chatwootConversationId` no se reutiliza entre sesiones distintas del mismo phone | Violación: resetSession no se llamó → nueva sesión lee ID viejo → postea en conv antigua. Mitigación: resetSession siempre borra session completa |
| I3 | `ensureChatwootConversation` es idempotente dentro de la misma sesión | Violación: múltiples llamadas crean múltiples convs. Guard: `if (session.chatwootConversationId) return` antes de cualquier Chatwoot API call |
| I4 | `chatwootForward` nunca propaga errores al caller | Violación: error de Chatwoot rompe el bot. Guard: try/catch en chatwootForward que absorbe y loguea |
| I5 | `chatwootConversationId` es entero positivo o null/undefined — nunca 0, negativo, string | Validación al asignar: `conv.id > 0 && Number.isInteger(conv.id)` |
| I6 | El campo se guarda ANTES de `runAgent`, no después | Violación: proceso muere durante runAgent → Redis sin ID → próximo mensaje crea conv duplicada |

---

## Análisis de concurrencia

La arquitectura usa cola serial por phone (`enqueue()` en server.js), así que para un mismo phone, `processMessages` corre una a la vez. No hay race condition real entre dos mensajes del mismo lead.

Riesgo residual: el primer mensaje de una sesión nueva llega dos veces simultáneamente (replay de Kapso) **antes** de que el debounce los consolide. En ese caso:

```
Llamada A: chatwootConversationId = null → crea conv 21
Llamada B: chatwootConversationId = null → crea conv 22
```

Pero `enqueue()` serializa B detrás de A. Cuando B corre, A ya terminó y Redis tiene ID=21. `getSession` al inicio de `processMessages` en B lee ID=21 → `ensureChatwootConversation` retorna 21. No hay duplicate.

> Excepción: si el debounce timer dispara para A, A pide getSession, luego el timer de B dispara, B pide getSession (antes de que A haga saveSession con el nuevo ID), ambos tienen null. A hace enqueue primero, B hace enqueue segundo. A termina y guarda ID=21. Luego B empieza, `getSession` dentro de `processMessages` lee Redis que ya tiene ID=21. Safe.

---

## Migration strategy (sesiones existentes en prod)

Al deploy de esta feature, hay sesiones activas en Redis sin el campo `chatwootConversationId`. El sistema debe funcionar sin romperlas:

| Situación | Comportamiento |
|-----------|---------------|
| Sesión existente, lead envía nuevo mensaje | `chatwootConversationId` = undefined → falsy → `ensureChatwootConversation` crea conv nueva. Forward funciona desde ese mensaje en adelante. |
| Sesión existente llega a handoff sin haber enviado mensaje post-deploy | `archiveToChatwoot` toma path fallback (replay history). Conv nueva en Chatwoot con historial completo. |
| Sesión completada en Redis sin el campo | No hay nuevos mensajes. Campo es irrelevante. |

**No se requiere script de migración.** El fallback path en `archiveToChatwoot` cubre todos los casos pre-deploy. El campo se populará orgánicamente a medida que lleguen nuevos mensajes.

---

## Rollback strategy

Si el deploy falla y se necesita revertir:

1. `git revert` del commit de esta feature → push → Railway redeploy.
2. Las sesiones en Redis que YA tienen `chatwootConversationId` no rompen el código anterior — es un campo extra ignorado.
3. Chatwoot mantiene las conversaciones ya creadas (no se borran).
4. El historial en Redis (`session.history`) es idéntico — sin pérdida de datos del bot.

---

## Stale ID recovery — v2 roadmap

Cuando `postMessage` devuelve 404 (conv no existe en Chatwoot):

```
Estrategia v2:
1. Detectar 404 específicamente (no todos los errores)
2. Limpiar session.chatwootConversationId = null
3. saveSession para persistir el limpiate
4. Re-llamar chatwootForward → creará conv nueva con el mensaje actual
5. NO replay del historial pasado (ya perdido)
```

En v1: el 404 se absorbe como cualquier otro error. Log claro, bot funciona, mensajes perdidos hasta siguiente sesión nueva.

---

## Human mode interaction

Cuando `humanMode = true`:

- `processMessages` retorna antes de llamar `chatwootForward`. ✅ Correcto: Jack responde directamente desde Chatwoot — la app Chatwoot ya tiene el mensaje via webhook nativo.
- Mensajes de Jack desde Chatwoot llegan via `/chatwoot-webhook` → `sendText` → WhatsApp. No pasan por `chatwootForward` (sería eco circular).
- Cuando humanMode vuelve a `false` (conversation resolved): `chatwootConversationId` permanece. Próximo mensaje del usuario → `chatwootForward` postea en conv existente.

---

## Chatwoot conversation status lifecycle

| Trigger | Status | Label | Quién lo puede ver en Chatwoot |
|---------|--------|-------|-------------------------------|
| Primer mensaje del lead | `pending` | — | Todos los agentes (badge pending) |
| handoff_to_human | `open` | `HANDOFF: <reason>` | Jack / equipo (asignado manualmente o auto) |
| complete_task (rechazo, cierre) | `resolved` | `Conversación completada` | En archive de Chatwoot |
| 24h session expiry | `resolved` | `Sesión expirada 24h` | En archive de Chatwoot |
| Agente humano toma control desde Chatwoot | `open` (Chatwoot lo maneja) | — | Según asignación Chatwoot |
| Conversación resuelta por agente | `resolved` (Chatwoot lo maneja) | — | En archive de Chatwoot |

> Labels en Chatwoot deben ser creados en el account ANTES del primer uso. Si el label no existe, la API devuelve 422. Labels requeridos: crear `HANDOFF`, `Conversación completada`, `Sesión expirada 24h` en Chatwoot Settings → Labels.
>
> Alternativa: usar `additional_attributes` en lugar de labels si labels no están creados.

---

## API de Chatwoot usada

```
POST   /api/v1/accounts/:id/contacts                          → upsertContact
POST   /api/v1/accounts/:id/conversations                     → createConversation (status=pending)
POST   /api/v1/accounts/:id/conversations/:conv/messages      → postMessage
PATCH  /api/v1/accounts/:id/conversations/:conv               → updateStatus {status}
POST   /api/v1/accounts/:id/conversations/:conv/labels        → addLabel {labels: [string]}
GET    /api/v1/accounts/:id/contacts/search?q=<phone>         → upsertContact (lookup)
GET    /api/v1/accounts/:id/contacts/:id/conversations        → (en tests solo)
```

### Payloads exactos

```js
// createConversation
POST /conversations
{
  inbox_id: parseInt(process.env.CHATWOOT_INBOX_ID),
  contact_id: contactId,
  additional_attributes: { source: 'kapso-whatsapp' }  // metadata, opcional pero útil
}

// updateStatus
PATCH /conversations/:id
{
  status: 'pending' | 'open' | 'resolved' | 'snoozed'
}

// addLabel
POST /conversations/:id/labels
{
  labels: ['HANDOFF: Prospecto pregunta precio']
  // nota: Chatwoot labels son strings planos — el "HANDOFF: " es parte del texto del label
  // crear estos labels en Chatwoot Settings antes del primer deploy
}
```

> **Nota sobre labels:** Chatwoot tiene un límite de caracteres por label (~25 chars). El formato `HANDOFF: <reason>` puede exceder eso si `reason` es larga. Truncar `reason` a 15 chars en el label. El `reason` completo sigue en el log de Railway.
