# Tasks — fix-repeated-messages

## Implementación

- [ ] `src/state.js`: agregar `lastReply: null` a session inicial
- [ ] `server.js`: comparar `reply.trim()` con `session.lastReply?.trim()` antes de `sendText`
- [ ] `server.js`: si diferente → actualizar `session.lastReply` y enviar

## Dependencia

- Bloquea parcialmente en `agent-sales-prompt-v2` (elimina `enter_waiting`) — implementar en paralelo, ambos fixes son independientes

## QA

- [ ] Enviar mensaje que trigger handoff → verificar que bot no envía 2+ mensajes seguidos
- [ ] Conversación normal → verificar mensajes distintos sí se envían todos

## Deploy

- [ ] Redeploy en Railway tras v2
