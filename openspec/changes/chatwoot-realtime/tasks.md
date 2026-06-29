# Tasks — Chatwoot Real-Time Forwarding

Rama de trabajo: `feature/chatwoot-realtime`

---

## Pre-requisitos operativos (hacer ANTES de cualquier código)

Estos items no son código — son configuración de Chatwoot y Railway que el deploy depende de.

- [x] **P1** — Crear labels en Chatwoot Settings → Labels:
  - `handoff` (para conversaciones de handoff_to_human)
  - `completada` (para conversaciones de complete_task)
  - `expirada-24h` (para sesiones que expiran)
  - Verificar: aparecen en la lista de labels al crear un mensaje en Chatwoot
  - Referencia: `specs/chatwoot-session.md` → "Chatwoot conversation status lifecycle"

- [x] **P2** — Verificar `CHATWOOT_INBOX_ID` en Railway env vars:
  - Debe ser el ID del inbox "WhatsApp Kapso - GH600" (actualmente ID=2)
  - Verificar: Railway → agent-kapso → Variables → `CHATWOOT_INBOX_ID=2`

- [x] **P3** — Verificar `CHATWOOT_API_TOKEN` válido y `CHATWOOT_BASE_URL` correcto:
  ```bash
  curl -H "api_access_token: $CHATWOOT_API_TOKEN" \
    $CHATWOOT_BASE_URL/api/v1/profile
  # → debe retornar 200 con datos del perfil
  ```
  Si falla: renovar token en Chatwoot → Profile → Access Token.

---

## Implementación

Las tareas siguen el orden de dependencias del diagrama en `design.md`. **No implementar T2 sin T0.**

### `src/chatwoot.js`

- [x] **T0** *(crítico — implementar primero)* — Agregar `AbortController` timeout de 8s a la función interna `req()`:
  - Envolver fetch con `AbortController` + `setTimeout(8000)`
  - `finally { clearTimeout(timer) }` para no dejar timers colgados
  - Código exacto en `design.md` → "T0 — Agregar AbortController"
  - Validar: `node -r dotenv/config -e "import('./src/chatwoot.js').then(m => m.upsertContact('51900000099', 'test'))"` → retorna en < 8s

- [x] **T1** — Agregar función interna `updateConversationStatus(conversationId, status, label)`:
  - PATCH `/conversations/:id` con `{ status }`
  - Si `label` presente: POST `/conversations/:id/labels` con `{ labels: [label.slice(0, 25)] }`
  - Truncar label a 25 chars (límite Chatwoot) — label completo sigue en logs
  - No exportar (uso interno de `archiveToChatwoot`)
  - Código exacto en `design.md` → "T1"

- [x] **T2** — Agregar función interna `ensureChatwootConversation(phone, session, contactInfo)`:
  - Guard: `if (session.chatwootConversationId) return session.chatwootConversationId`
  - Name resolution: `variables.nombre || variables.name || contactInfo?.contact_name || phone`
  - POST /conversations con `additional_attributes: { source: 'kapso-whatsapp' }`
  - Validar `conv.id > 0` antes de asignar a session
  - Emitir `chatwoot_conv_created` structured JSON log
  - No exportar (uso interno de `chatwootForward` y `archiveToChatwoot`)
  - Código exacto en `design.md` → "T2"
  - Specs validadas: `specs/real-time-forwarding.md` Escenarios 1, 2, 5

- [x] **T3** — Agregar función exportada `chatwootForward(phone, session, text, direction, contactInfo)`:
  - Guard: `if (!text?.trim()) return` para no postear mensajes vacíos
  - Llama `ensureChatwootConversation` + `postMessage`
  - try/catch total: NUNCA relanzar
  - Emitir `chatwoot_forward_ok` en éxito con `{type, phone_suffix, direction, conversation_id, chars}`
  - Emitir `chatwoot_forward_error` en fallo con `{type, phone_suffix, direction, error, http_status}`
  - Código exacto en `design.md` → "T3"
  - Specs validadas: Escenarios 1, 2, 3, 4, 5, 6

- [x] **T4** — Mover función interna `extractText(content)` de `agent.js` a `chatwoot.js`:
  - Copiar la función (no exportar — es interna)
  - En `agent.js`: eliminar la definición
  - Verificar: `node tests/agent-unit.mjs` sigue verde (extractText tests son de lógica pura, no importan desde chatwoot.js)
  - Refs: `design.md` → "T4"

- [x] **T5** — Actualizar `archiveToChatwoot(phone, session, label, contactInfo)` (mover de agent.js + hacer idempotente):
  - Si `session.chatwootConversationId` existe (truthy, > 0): branch idempotente
    - Llamar `updateConversationStatus(id, status, label)`
    - `status = label.startsWith('HANDOFF') ? 'open' : 'resolved'`
    - Emitir `chatwoot_conv_updated` structured log
  - Si no existe (null/undefined): branch fallback (backward compat)
    - `upsertContact` + POST /conversations + `Promise.all(messages.map postMessage)` + `updateConversationStatus`
    - Emitir `chatwoot_archive_fallback` structured log
  - catch total: emitir `chatwoot_archive_error` structured log, NUNCA relanzar
  - Código exacto en `design.md` → "T5"
  - Specs validadas: Escenarios 5, 6, 7, 8, 10

- [x] **T5b** — En `executeTool` (`agent.js`), forward `ask_with_buttons` body a Chatwoot como outgoing:
  ```js
  case 'ask_with_buttons': {
    const { body, buttons } = input;
    await sendButtons(phone, body, buttons);
    // forward button body to Chatwoot so Jack sees what the bot asked
    await chatwootForward(phone, session, body, 'outgoing', contactInfo).catch(() => {});
    return 'buttons_sent';
  }
  ```
  - Requiere importar `chatwootForward` en `agent.js` (además de `archiveToChatwoot`)
  - Esto permite ver en Chatwoot las preguntas de FASE 1 + botones de objeciones
  - Specs validadas: `specs/real-time-forwarding.md` Escenario 4 (reply null — ahora el body sí llega)

### `src/agent.js`

Estas tareas son cleanup — solo eliminación e imports. No hay nueva lógica.

- [x] **T10** — Eliminar función `archiveToChatwoot` de `agent.js` (~líneas 194-208):
  - Verificar que chatwoot.js ya la exporta (T5 completado) antes de eliminar
  - No borrar los callers en `handoff_to_human` y `complete_task` — solo la definición

- [x] **T11** — Eliminar función `extractText` de `agent.js` (~líneas 210-215):
  - Verificar que chatwoot.js la tiene internamente (T4 completado) antes de eliminar

- [x] **T12** — Actualizar import al inicio de `agent.js`:
  ```js
  // ANTES:
  import { upsertContact, createConversation, postMessage } from './chatwoot.js';

  // DESPUÉS:
  import { archiveToChatwoot } from './chatwoot.js';
  ```
  - Verificar: `node server.js` arranca sin errores de import

### `server.js`

- [x] **T6** — Actualizar imports al inicio de `server.js`:
  ```js
  // ANTES:
  import { runAgent, archiveToChatwoot } from './src/agent.js';

  // DESPUÉS:
  import { runAgent } from './src/agent.js';
  import { chatwootForward, archiveToChatwoot } from './src/chatwoot.js';
  ```

- [x] **T7** — En `processMessages`, agregar `chatwootForward` ANTES de `runAgent`:
  ```js
  await chatwootForward(phone, session, text, 'incoming', contactInfo);
  ```
  - Posición exacta: después de `sendTyping`, antes de `saveSession` (T8)
  - Specs validadas: Escenarios 1, 2, 9, 13, 14

- [x] **T8** — En `processMessages`, agregar `saveSession` DESPUÉS del forward incoming:
  ```js
  await saveSession(phone, session); // persiste chatwootConversationId a Redis
  ```
  - Posición exacta: DESPUÉS de T7, ANTES de `runAgent`
  - Crítico: sin esto, si el proceso reinicia durante runAgent, el ID se pierde
  - Specs validadas: `specs/chatwoot-session.md` → "Persistencia"

- [x] **T9** — En `processMessages`, agregar `chatwootForward` DESPUÉS de `runAgent`, ANTES de `sendText`:
  ```js
  if (reply && reply.trim() !== prevReply?.trim()) {
    await chatwootForward(phone, session, reply, 'outgoing', contactInfo); // ← T9
    await sendText(phone, reply);
  }
  ```
  - Orden garantiza: incoming en Chatwoot → runAgent → outgoing en Chatwoot → sendText WA
  - Specs validadas: Escenarios 3, 4, 18

---

## Tests

Los tests deben implementarse DESPUÉS de T0-T12. Los tests no pueden pasar si la implementación no existe.

- [x] **T13** — Crear `tests/chatwoot-realtime.integration.mjs` — flujo completo (2 mensajes):
  ```
  SETUP: resetSession(TEST_PHONE); limpiar convs de Chatwoot del test phone (si aplica)
  1. Enviar webhook "test msg 1" → esperar 6s
  2. Verificar en Chatwoot: contacto existe con phone +TEST_PHONE
  3. Verificar: conv creada con status=pending
  4. Verificar: conv tiene 2 mensajes (1 incoming + 1 outgoing)
  5. Verificar: Redis session.chatwootConversationId === conv.id
  6. Enviar webhook "test msg 2" → esperar 6s
  7. Verificar: MISMA conv tiene 4 mensajes (no conv nueva)
  8. Verificar: conv.id === session.chatwootConversationId (sin cambio)
  ```
  - Usar CHATWOOT_* env vars para consultar API
  - Si falla en paso 5: T8 no está implementado o saveSession falla
  - Si falla en paso 7: `ensureChatwootConversation` no es idempotente

- [x] **T14** — En `tests/chatwoot-realtime.integration.mjs`, agregar test de status update:
  ```
  CONTINUA desde T13 (misma conv)
  1. Enviar webhook "quiero hablar con Jack" → esperar 15s (Claude time)
  2. Verificar: conv tiene status=open Y label contiene "handoff"
  3. Verificar: NO se creó conv nueva (conv.id iguales)
  4. Verificar: número total de convs del contacto === 1
  ```
  - Si falla en paso 2: `archiveToChatwoot` branch idempotente no está actualizando status
  - Si falla en paso 4: `ensureChatwootConversation` está creando convs duplicadas

- [ ] **T15** — En `tests/chatwoot-realtime.integration.mjs`, agregar test de resiliencia (Chatwoot caído):
  ```
  1. Temporalmente setear CHATWOOT_BASE_URL a URL inválida en .env de test
  2. Enviar webhook a bot → esperar 15s
  3. Verificar en output: contiene "chatwoot_forward_error"
  4. Verificar en output: NO contiene "uncaughtException" ni stack trace de error fatal
  5. Restaurar CHATWOOT_BASE_URL correcto
  ```
  - Este test corre localmente con `BOT_URL=http://localhost:3000/webhook` y bot corriendo con URL inválida
  - Documenta: bot sigue funcionando, Chatwoot es degradación graceful

- [x] **T16** — Agregar a `tests/agent-unit.mjs` — verificar shapes de structured logs:
  ```js
  // chatwoot_forward_ok shape
  const okLog = { type: 'chatwoot_forward_ok', phone_suffix: '2214',
    direction: 'incoming', conversation_id: 21, chars: 12 };
  assert.ok(okLog.type && okLog.phone_suffix && okLog.direction
    && typeof okLog.conversation_id === 'number' && typeof okLog.chars === 'number');

  // chatwoot_forward_error shape
  const errLog = { type: 'chatwoot_forward_error', phone_suffix: '2214',
    direction: 'outgoing', error: 'Chatwoot POST ... → 503', http_status: '503' };
  assert.ok(errLog.type && errLog.error && errLog.http_status);
  ```

- [x] **T17** — Actualizar `tests/bot-e2e-reject.mjs`:
  - En `getLatestChatwootConversation()`: verificar que `conv.status === 'resolved'` después de `complete_task`
  - Agregar al output: `✓ Chatwoot conversation ${conv.id}: status=${conv.status}`
  - Si `conv.status !== 'resolved'`: `assert.fail` con mensaje descriptivo

---

## Documentación

- [ ] **T18** — Actualizar `openspec/ARCHITECTURE.md`:
  - Agregar `chatwootForward` en diagrama de flujo principal
  - Actualizar sección de triggers de archival: "real-time (cada mensaje)" es el nuevo primer trigger
  - Actualizar tabla de APIs: `src/chatwoot.js` tiene 3 funciones adicionales exportadas

- [ ] **T19** — Actualizar `CLAUDE.md` sección "Archivos que importan":
  ```
  src/chatwoot.js    — Chatwoot integration: upsertContact, createConversation, postMessage,
                       ensureChatwootConversation, chatwootForward, archiveToChatwoot,
                       updateConversationStatus (interna)
  ```

---

## Verificación en staging/prod

Ejecutar en orden. No pasar al siguiente si el anterior falla.

- [x] **V1** — Crear rama `feature/chatwoot-realtime` y hacer push:
  ```bash
  git checkout -b feature/chatwoot-realtime
  # commits T0-T19
  git push origin feature/chatwoot-realtime
  ```
  Deploy manual a Railway staging (si existe) o directamente a prod con monitoreo activo.

- [ ] **V2** — Test manual de real-time en WhatsApp:
  - Abrir Chatwoot en una pantalla
  - Desde teléfono real, enviar "Hola test realtime" al bot
  - Verificar en Chatwoot (<3s): conversación nueva visible con mensaje incoming
  - Enviar "soy dev" → verificar 4 mensajes (2 in + 2 out) en la misma conv
  - Criterio de éxito: `chatwoot_forward_ok` visible en Railway logs

- [ ] **V3** — Test manual de handoff status:
  - Continuar conversación del V2 hasta handoff (preguntar precio)
  - Verificar en Chatwoot: conv pasa de `pending` a `open` con label `handoff`
  - Verificar: no se creó conv duplicada
  - Criterio de éxito: `chatwoot_conv_updated` con `status: open` en Railway logs

- [ ] **V4** — Test manual de complete_task status:
  - Nueva sesión (reset si necesario) → enviar "Hola, no me interesa"
  - Verificar en Chatwoot: conv creada + `resolved` + label `completada`
  - Criterio de éxito: `chatwoot_archive_fallback` o `chatwoot_conv_updated` con `resolved` en logs

- [ ] **V5** — Test de resiliencia en Railway:
  - En Railway Variables: cambiar `CHATWOOT_BASE_URL` a `https://invalid.example.com`
  - Enviar 2 mensajes via WhatsApp
  - Verificar en Railway logs: `chatwoot_forward_error` presente, NO hay crash del proceso
  - Verificar en WhatsApp: bot respondió normalmente
  - Restaurar `CHATWOOT_BASE_URL` correcto en Railway Variables
  - Criterio de éxito: webhook errors NO incrementaron (el error fue en Chatwoot, no en el bot)

- [ ] **V6** — Merge a `main` y verificación en prod:
  ```bash
  git checkout main
  git merge feature/chatwoot-realtime
  git push origin main
  ```
  - Monitorear Railway logs durante 10 min post-deploy
  - Verificar: primer mensaje real de lead muestra `chatwoot_conv_created` en logs
  - Verificar: Chatwoot inbox muestra conversación nueva en < 5s desde primer mensaje

---

## Orden de implementación

```
P1 → P2 → P3
  └── (pre-requisitos: labels, env vars verificados)

T0 → T1 → T2 → T3 → T4 → T5
  └── (chatwoot.js completo con todas las funciones)

T10 → T11 → T12
  └── (agent.js cleanup — depende de T4 y T5)

T6 → T7 → T8 → T9
  └── (server.js — depende de T3, T6 importa)

T13 → T14 → T15 → T16 → T17
  └── (tests — depende de T0-T12)

T18 → T19
  └── (docs — independientes, pueden hacerse en paralelo con tests)

V1 → V2 → V3 → V4 → V5 → V6
  └── (verificación — solo cuando tests verdes)
```

Paralelismo posible: T18/T19 pueden hacerse en paralelo con T13-T17.

---

## Definition of Done

Todos los items deben estar verdes antes de merge a `main`:

**Tests automáticos:**
- [ ] `node tests/agent-unit.mjs` → 22+ tests passed (incluye T16)
- [ ] `node -r dotenv/config tests/chatwoot.integration.mjs` → PASS (existente, no regresar)
- [ ] `node -r dotenv/config tests/chatwoot-realtime.integration.mjs` → PASS (T13 + T14)
- [ ] `node -r dotenv/config tests/bot-e2e-reject.mjs` → PASS con `status=resolved` (T17)

**Pre-deploy checklist** (de `specs/error-handling.md`):
- [ ] Labels en Chatwoot creados (P1)
- [ ] CHATWOOT_INBOX_ID correcto (P2)
- [ ] CHATWOOT_API_TOKEN válido (P3)

**Verificación manual:**
- [ ] V2: mensaje visible en Chatwoot en < 3s desde webhook
- [ ] V3: handoff → status=open + label en Chatwoot
- [ ] V5: bot responde cuando Chatwoot está caído

**Observabilidad:**
- [ ] `chatwoot_forward_ok` visible en Railway logs para cada mensaje
- [ ] `chatwoot_forward_error` visible en logs durante V5 (Chatwoot caído)
- [ ] No hay `chatwootConversationId: undefined` en Redis

**No regresiones:**
- [ ] Bot responde en WhatsApp normalmente (tiempo de respuesta sin cambio notable)
- [ ] `session.lastReply` dedup sigue funcionando (no envíos duplicados)
- [ ] Handoff a Jack por WhatsApp sigue llegando

---

## PR Checklist

Al abrir el PR de `feature/chatwoot-realtime` → `main`:

- [ ] Título: `feat(chatwoot): real-time message forwarding — chatwootForward + session.chatwootConversationId`
- [ ] Body incluye: enlace a esta spec, tabla de "qué cambia por archivo", link a Railway logs de V2/V3 verificados
- [ ] Tests verdes en PR
- [ ] Reviewer: Jack (si aplica)
- [ ] NO hacer squash — mantener commits atómicos por grupo de tareas para facilitar rollback granular
