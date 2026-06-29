# Conversation Archival

## Por qué

Hoy solo guardamos conversaciones en Chatwoot cuando hay handoff_to_human. Los leads que no llegan a handoff (bounced, rechazo, incompletos) son invisibles — no hay forma de saber quiénes contactaron, qué dijeron, en qué fase quedaron.

Además el handoff a Chatwoot tiene un bug activo (422 por phone sin `+`) que ya se fixó.

## Qué cambia

1. **Chatwoot phone fix** — ya aplicado en `src/chatwoot.js`
2. **Archive on complete_task()** — cuando el prospecto rechaza y el bot llama `complete_task()`, también enviar la conversación a Chatwoot (igual que en handoff)
3. **Archive on session expiry** — cuando una sesión expira por 24h sin completar, archivar también

## Qué NO cambia

- No se cambia Redis ni la estructura de session
- No se agrega nueva infraestructura
- Chatwoot sigue siendo el único backend de archival
