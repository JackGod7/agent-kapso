# Tasks — Chatwoot Real-Time Forwarding

## Pre-requisitos de operación (fuera de código)

- [ ] P1 — Crear labels en Chatwoot Settings → Labels: `handoff`, `completada`, `expirada-24h`
- [ ] P2 — Verificar `CHATWOOT_INBOX_ID` en Railway env vars apunta al inbox "WhatsApp Kapso - GH600" (ID=2)
- [ ] P3 — Verificar `CHATWOOT_API_TOKEN` válido: `curl -H "api_access_token: $TOKEN" $BASE/api/v1/profile` → 200

## Implementación

### src/chatwoot.js

- [ ] T0 — Agregar `AbortController` timeout de 8s a `req()` para prevenir bloqueos si Chatwoot cuelga (ver error-handling.md)
- [ ] T1 — Agregar `updateConversationStatus(conversationId, status, label)` que hace PATCH status + POST label (truncado a 25 chars)
- [ ] T2 — Agregar `ensureChatwootConversation(phone, session, contactInfo)` — crea contacto + conversación si no existe, guarda ID en session, idempotente. Emitir `chatwoot_conv_created` structured log.
- [ ] T3 — Agregar `chatwootForward(phone, session, text, direction, contactInfo)` — llama ensure + postMessage, try/catch no-fatal. Emitir `chatwoot_forward_ok` o `chatwoot_forward_error` structured logs.
- [ ] T4 — Mover `extractText(content)` de `agent.js` a `chatwoot.js` (usado por replay history en fallback path)
- [ ] T5 — Actualizar `archiveToChatwoot(phone, session, label, contactInfo)`:
  - Si `session.chatwootConversationId` existe → solo `updateConversationStatus`. Emitir `chatwoot_conv_updated`.
  - Si no existe → path fallback (crear conv + replay history + update status). Emitir `chatwoot_archive_fallback`.
  - Cambiar `console.error` de texto plano a `chatwoot_archive_error` structured JSON.

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

- [ ] T13 — `tests/chatwoot-realtime.integration.mjs`: test determinístico del flujo completo
  - Reset sesión TEST_PHONE en Redis
  - Enviar webhook msg 1 → esperar 5s → verificar conv creada en Chatwoot con 2 msgs (1 in + 1 out)
  - Verificar `session.chatwootConversationId` en Redis === conv ID en Chatwoot
  - Enviar webhook msg 2 → esperar 5s → verificar misma conv tiene 4 msgs (no nueva conv duplicada)
  - Assert: conv status = `pending`
- [ ] T14 — `tests/chatwoot-realtime.integration.mjs`: test de handoff con conv preexistente
  - Continuar desde T13 → enviar mensaje que gatilla handoff
  - Verificar conv existente cambia a status=`open` con label `handoff`
  - Verificar NO se creó conv nueva
- [ ] T15 — `tests/chatwoot-realtime.integration.mjs`: test de Chatwoot caído (mock 503)
  - Temporalmente apuntar `CHATWOOT_BASE_URL` a endpoint inexistente
  - Enviar webhook → verificar bot responde normalmente en logs (no error fatal)
  - Verificar log `chatwoot_forward_error` en output
- [ ] T16 — Agregar a `tests/agent-unit.mjs`: tests de structured log shapes
  - `chatwoot_forward_ok` tiene campos `type`, `phone_suffix`, `direction`, `conversation_id`, `chars`
  - `chatwoot_forward_error` tiene campos `type`, `direction`, `error`, `http_status`
- [ ] T17 — Actualizar `tests/bot-e2e-reject.mjs`: agregar assert que conv Chatwoot tiene status=`resolved` después de complete_task

## Documentación

- [ ] T16 — Actualizar `openspec/ARCHITECTURE.md`: agregar real-time forwarding en flujo principal y en la sección de Chatwoot
- [ ] T17 — Actualizar `CLAUDE.md`: agregar `src/chatwoot.js` en sección "Archivos que importan" con descripción de las nuevas funciones

## Verificación

- [ ] T18 — Deploy a Railway staging (rama `feature/chatwoot-realtime`)
- [ ] T19 — Test manual: enviar 5 mensajes via WhatsApp real → verificar en Chatwoot que aparecen en tiempo real
- [ ] T20 — Test manual: llegar a handoff → verificar que Chatwoot cambia status a `open` y tiene label HANDOFF
- [ ] T21 — Test manual: Chatwoot caído (apagar servicio temporalmente) → verificar bot sigue respondiendo en WhatsApp
- [ ] T22 — Merge a main → Railway deploy → verificar en prod

## Documentación

- [ ] T18 — Actualizar `openspec/ARCHITECTURE.md`: agregar real-time forwarding en flujo principal y en sección Chatwoot
- [ ] T19 — Actualizar `CLAUDE.md`: agregar `src/chatwoot.js` en "Archivos que importan" con descripción de funciones exportadas

## Verificación

- [ ] V1 — Deploy a rama `feature/chatwoot-realtime` (no a main todavía)
- [ ] V2 — Test manual: enviar 3 mensajes via WhatsApp real → abrir Chatwoot → verificar aparecen en tiempo real (<3s)
- [ ] V3 — Test manual: llegar a handoff → verificar Chatwoot cambia status a `open` y tiene label `handoff`
- [ ] V4 — Test manual: lead dice "no me interesa" → complete_task → Chatwoot status=`resolved`
- [ ] V5 — Test de resiliencia: cambiar `CHATWOOT_BASE_URL` a URL inválida en Railway → enviar mensajes → verificar bot responde → verificar `chatwoot_forward_error` en logs → restaurar URL → verificar recovery
- [ ] V6 — Merge a main → Railway autodeploy → verificar primera conversación real en Chatwoot en tiempo real

## Orden de implementación

```
P1 → P2 → P3                              (pre-requisitos operativos)
T0 → T1 → T2 → T3 → T4 → T5             (chatwoot.js — T0 primero: timeout crítico)
T10 → T11 → T12                           (agent.js — cleanup, depende de T4/T5)
T6 → T7 → T8 → T9                         (server.js — depende de T3)
T13 → T14 → T15 → T16 → T17              (tests)
T18 → T19                                 (docs)
V1 → V2 → V3 → V4 → V5 → V6             (verificación — solo después de tests verdes)
```

## Definition of Done

- [ ] `node tests/chatwoot-realtime.integration.mjs` pasa (tests T13 + T14)
- [ ] `node tests/agent-unit.mjs` pasa (22+ tests, incluye T16)
- [ ] `node tests/bot-e2e-reject.mjs` pasa con assert de status=resolved (T17)
- [ ] Checklist pre-deploy de error-handling.md completado
- [ ] Conversación activa visible en Chatwoot desde primer mensaje en prod
- [ ] Handoff → Chatwoot status=`open` + label `handoff`
- [ ] Bot responde normalmente cuando Chatwoot está caído (V5 verificado)
- [ ] Logs estructurados `chatwoot_forward_ok` visibles en Railway para cada mensaje
- [ ] No hay `chatwootConversationId: undefined` en Redis (siempre null o entero positivo)
