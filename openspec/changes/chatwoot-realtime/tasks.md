# Tasks — Chatwoot Real-Time Forwarding

## Implementación

### src/chatwoot.js

- [ ] T1 — Agregar `updateConversationStatus(conversationId, status, label)` que hace PATCH status + POST labels
- [ ] T2 — Agregar `ensureChatwootConversation(phone, session, contactInfo)` — crea contacto + conversación si no existe, guarda ID en session, idempotente
- [ ] T3 — Agregar `chatwootForward(phone, session, text, direction, contactInfo)` — llama ensure + postMessage, try/catch no-fatal
- [ ] T4 — Mover `extractText(content)` de `agent.js` a `chatwoot.js` (o exportar desde `agent.js` e importar en `chatwoot.js`)
- [ ] T5 — Actualizar `archiveToChatwoot(phone, session, label, contactInfo)`:
  - Si `session.chatwootConversationId` existe → solo `updateConversationStatus`
  - Si no existe → path fallback (crear conv + replay history + update status)

### server.js

- [ ] T6 — Importar `chatwootForward` desde `src/chatwoot.js`
- [ ] T7 — En `processMessages`, llamar `chatwootForward(phone, session, text, 'incoming', contactInfo)` antes de `runAgent`
- [ ] T8 — En `processMessages`, llamar `saveSession(phone, session)` después de T7 para persistir `chatwootConversationId` antes de `runAgent`
- [ ] T9 — En `processMessages`, llamar `chatwootForward(phone, session, reply, 'outgoing', contactInfo)` si reply pasa el dedup check, ANTES de `sendText`

### src/agent.js

- [ ] T10 — Eliminar definición local de `archiveToChatwoot` (se mueve a `chatwoot.js`)
- [ ] T11 — Eliminar definición local de `extractText` si se mueve (o exportar si chatwoot.js la importa)
- [ ] T12 — Importar `archiveToChatwoot` de `../src/chatwoot.js` (ajustar import existente)

## Tests

- [ ] T13 — `tests/chatwoot-realtime.integration.mjs`: test del flujo completo
  - Enviar 2 mensajes via webhook → verificar conv en Chatwoot con 4 msgs (2 in + 2 out)
  - Verificar `session.chatwootConversationId` en Redis coincide con conv ID
  - Verificar segundo mensaje usa misma conv (no duplica)
- [ ] T14 — Agregar a `tests/agent-unit.mjs`: test de `shouldForward` (dedup para forward)
- [ ] T15 — Actualizar `tests/bot-e2e-reject.mjs`: agregar assert que conv Chatwoot tiene status=`resolved` después de complete_task

## Documentación

- [ ] T16 — Actualizar `openspec/ARCHITECTURE.md`: agregar real-time forwarding en flujo principal y en la sección de Chatwoot
- [ ] T17 — Actualizar `CLAUDE.md`: agregar `src/chatwoot.js` en sección "Archivos que importan" con descripción de las nuevas funciones

## Verificación

- [ ] T18 — Deploy a Railway staging (rama `feature/chatwoot-realtime`)
- [ ] T19 — Test manual: enviar 5 mensajes via WhatsApp real → verificar en Chatwoot que aparecen en tiempo real
- [ ] T20 — Test manual: llegar a handoff → verificar que Chatwoot cambia status a `open` y tiene label HANDOFF
- [ ] T21 — Test manual: Chatwoot caído (apagar servicio temporalmente) → verificar bot sigue respondiendo en WhatsApp
- [ ] T22 — Merge a main → Railway deploy → verificar en prod

## Orden de implementación sugerido

```
T1 → T2 → T3 → T4 → T5   (chatwoot.js — de menor a mayor dependencia)
T10 → T11 → T12            (agent.js — cleanup después de que chatwoot.js tiene todo)
T6 → T7 → T8 → T9         (server.js — último, depende de los anteriores)
T13 → T14 → T15            (tests)
T16 → T17                  (docs)
T18 → T19 → T20 → T21 → T22  (verificación)
```

## Definition of Done

- [ ] `node tests/chatwoot-realtime.integration.mjs` pasa
- [ ] `node tests/agent-unit.mjs` pasa (22+ tests)
- [ ] Conversación activa visible en Chatwoot desde primer mensaje en prod
- [ ] Handoff cambia status de conversación a `open` en Chatwoot
- [ ] Bot funciona normalmente cuando Chatwoot está caído
- [ ] No hay `chatwootConversationId: undefined` en Redis (siempre null o número)
