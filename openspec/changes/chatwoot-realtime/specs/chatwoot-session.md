# Spec — Chatwoot Session Schema

## Campo nuevo: `chatwootConversationId`

```js
// Session object completo (src/state.js)
{
  history:               [],       // mensajes Claude (user/assistant)
  variables:             {},       // datos del prospecto (nombre, fase, etc.)
  completed:             false,    // true después de handoff/complete_task
  completedAt:           null,     // timestamp ms o null
  lastReply:             null,     // último texto enviado al usuario (dedup)
  totalTokens:           0,        // acumulado para cost_alert
  source:                'organic',// tiktok | facebook_ad | instagram_ad | meta_referral | organic
  humanMode:             false,    // true = bot silenciado, agente humano activo
  chatwootConversationId: null,    // ← NUEVO: integer ID de Chatwoot o null
}
```

## Ciclo de vida del campo

```
null
  │
  ├─ primer chatwootForward() → crea conv → chatwootConversationId = N
  │
  ├─ mensajes siguientes → reutiliza N
  │
  ├─ handoff / complete_task / 24h expiry
  │    └─ archiveToChatwoot detecta N → updateStatus → campo NO se borra
  │         (la conv sigue en Chatwoot para referencia)
  │
  └─ resetSession() → session eliminada de Redis → próxima sesión empieza en null
```

## Persistencia

- `chatwootConversationId` se persiste via `saveSession(phone, session)` después de crearse.
- `getSession(phone)` lo devuelve con el resto de la session.
- Sesiones creadas antes de este deploy → campo ausente → `session.chatwootConversationId` es `undefined`, tratado igual que `null` (falsy).

## Invariantes

| Invariante | Descripción |
|------------|-------------|
| I1 | Si `chatwootConversationId` está set, la conversación existe en Chatwoot |
| I2 | `chatwootConversationId` no se reutiliza entre sesiones distintas del mismo phone |
| I3 | `ensureChatwootConversation` es idempotente: N llamadas → mismo ID |
| I4 | `chatwootForward` nunca lanza al caller — errores de Chatwoot son absorbidos |

## Violación de I1 (edge case)

Si Chatwoot elimina una conversación manualmente pero Redis aún tiene el ID:
- `postMessage(staleId)` → Chatwoot devuelve 404
- `chatwootForward` lo captura → loguea `[CHATWOOT-RT] forward failed`
- Bot sigue funcionando, mensajes no llegan a Chatwoot hasta próxima sesión

Mitigación v2: si forward falla con 404, limpiar `session.chatwootConversationId` y reintentar.

## Chatwoot conversation status mapping

| Trigger | Status en Chatwoot | Label |
|---------|--------------------|-------|
| Primer mensaje (auto) | `pending` | — |
| handoff_to_human | `open` | `HANDOFF: <reason>` |
| complete_task (rechazo) | `resolved` | `Conversación completada` |
| 24h expiry | `resolved` | `Sesión expirada 24h` |
| Agente humano toma control | `open` | (Chatwoot lo maneja) |
| Conversación resuelta por agente | `resolved` | (Chatwoot lo maneja) |

## API de Chatwoot usada

```
POST /api/v1/accounts/:id/contacts              → upsertContact
POST /api/v1/accounts/:id/conversations         → createConversation
POST /api/v1/accounts/:id/conversations/:id/messages  → postMessage
PATCH /api/v1/accounts/:id/conversations/:id    → updateConversationStatus (status)
POST /api/v1/accounts/:id/conversations/:id/labels    → updateConversationStatus (label)
```

> PATCH /conversations/:id acepta `{ status: 'pending' | 'open' | 'resolved' | 'snoozed' }`.
> POST /conversations/:id/labels acepta `{ labels: ['string'] }`.
