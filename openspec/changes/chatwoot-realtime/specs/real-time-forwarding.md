# Spec — Real-Time Message Forwarding

## Objetivo

Cada mensaje visible de la conversación (usuario → bot, bot → usuario) aparece en Chatwoot en tiempo real, sin esperar al final de la sesión. El agente humano puede ver y tomar control en cualquier momento, incluso durante una conversación activa.

---

## Diagrama de secuencia — flujo normal

```
Usuario (WA)     Kapso       server.js      chatwoot.js       Chatwoot         Redis
    │               │              │               │               │               │
    │──msg──────────►              │               │               │               │
    │               │──webhook────►│               │               │               │
    │               │              │──getSession──────────────────────────────────►│
    │               │              │◄─session──────────────────────────────────────│
    │               │              │               │               │               │
    │               │              │──chatwootForward(incoming)──► │               │
    │               │              │               │──ensure conv─►│               │
    │               │              │               │◄─conv_id──────│               │
    │               │              │               │──postMessage─►│               │
    │               │              │               │◄──ok──────────│               │
    │               │              │──saveSession(conv_id)──────────────────────►  │
    │               │              │               │               │               │
    │               │              │──runAgent()───────────────────────────────────│
    │               │              │     [Claude tool loop]        │               │
    │               │              │◄─reply────────────────────────────────────────│
    │               │              │               │               │               │
    │               │              │──chatwootForward(outgoing)──► │               │
    │               │              │               │──ensure conv─►│  (skip,ID ok) │
    │               │              │               │──postMessage─►│               │
    │               │              │               │◄──ok──────────│               │
    │               │              │──sendText─────────────────────────────────────│
    │◄─reply────────────────────── │               │               │               │
```

---

## Definición de "mensaje visible"

| Tipo de evento | ¿Se postea? | Dirección | Notas |
|----------------|-------------|-----------|-------|
| Texto plano del usuario | ✅ | `incoming` | |
| Respuesta de texto del bot | ✅ | `outgoing` | Solo si pasa dedup (reply !== prevReply) |
| Audio transcripto (Kapso/Groq) | ✅ | `incoming` | Texto de la transcripción. Sin prefijo en v1. |
| Selección de botón interactivo | ✅ | `incoming` | `msg.interactive.button_reply.title` |
| Múltiples msgs consolidados (debounce) | ✅ | `incoming` | Un solo posteo con texto concatenado |
| Llamadas internas a tools Claude | ❌ | — | save_variable, get_variable, etc. son ruido interno |
| `ask_with_buttons` body | ❌ | — | La API WhatsApp lo envía; Chatwoot lo verá via WABiz nativo. Evaluar v2 |
| Archivos enviados (temario, testimonios) | ❌ | — | Out of scope v1. Solo el bot-reply de texto que los acompaña sí se postea |
| Mensajes de audio demasiado largos (>2MB) | ✅ | `incoming` | Postear `"[audio >2MB — no transcripto]"` como incoming |
| Audio sin transcripción disponible | ✅ | `incoming` | Postear `"[audio — transcripción fallida]"` como incoming |
| Fallback reply de MAX_TOOL_ROUNDS | ✅ | `outgoing` | Es una respuesta visible al usuario |

---

## Escenarios

### Escenario 1 — Primera conversación, sesión nueva

```
GIVEN sesión vacía (chatwootConversationId = null / undefined)
  AND usuario con phone 51965XXXXXX
WHEN usuario envía "Hola vi el GH-600"
THEN chatwootForward crea contacto en Chatwoot con phone +51965XXXXXX (E.164)
  AND chatwootForward crea conversación con inbox_id=CHATWOOT_INBOX_ID, status=pending
  AND session.chatwootConversationId = <nuevo ID> (entero, >0)
  AND saveSession persiste chatwootConversationId a Redis ANTES de runAgent
  AND mensaje "Hola vi el GH-600" visible en Chatwoot como incoming
  AND bot responde en WhatsApp con reply de bienvenida
  AND reply del bot visible en Chatwoot como outgoing

ACCEPTANCE: Chatwoot muestra 2 mensajes (1 in + 1 out) en <3s desde que Kapso recibe el webhook
```

### Escenario 2 — Continuación, sesión con ID existente

```
GIVEN session.chatwootConversationId = 21
  AND conversación 21 existe en Chatwoot con 4 mensajes
WHEN usuario envía mensaje N
THEN ensureChatwootConversation retorna 21 sin llamar Chatwoot API (ID ya existe)
  AND postMessage agrega mensaje a conversación 21
  AND session.chatwootConversationId sigue siendo 21
  AND NO se crea conversación nueva

ACCEPTANCE: GET /conversations/21/messages devuelve N+2 mensajes (N anteriores + 1 incoming + 1 outgoing)
```

### Escenario 3 — Respuesta del bot forwarded en orden correcto

```
GIVEN conversación X en Chatwoot
WHEN runAgent() devuelve reply
  AND reply.trim() !== session.lastReply?.trim() (dedup pasa)
THEN chatwootForward(outgoing) se llama ANTES de sendText(WhatsApp)
  AND en Chatwoot el orden es: incoming (usuario) → outgoing (bot)
  AND timestamps de Chatwoot reflejan orden correcto

ACCEPTANCE: últimos 2 mensajes de conv X son incoming luego outgoing, sin inversión
```

### Escenario 4 — Bot produce reply null (tool-only round, sin texto al usuario)

```
GIVEN conversación X activa
WHEN Claude llama save_variable + ask_with_buttons y retorna reply=null
THEN chatwootForward(outgoing) NO se llama (guard: if reply)
  AND sendText NO se llama
  AND WhatsApp recibe los botones via sendButtons (fuera del forward)
  AND Chatwoot no recibe el posteo del botón en v1

ACCEPTANCE: conversación X incrementa solo en 1 mensaje (incoming del usuario), no outgoing
```

### Escenario 5 — Chatwoot caído antes de ensureConversation (sin ID previo)

```
GIVEN Chatwoot devuelve 503 o connection refused
  AND session.chatwootConversationId = null
WHEN chatwootForward(incoming) intenta ensureChatwootConversation
THEN upsertContact o createConversation lanza → chatwootForward absorbe
  AND session.chatwootConversationId queda null (no se setea)
  AND saveSession no persiste chatwootConversationId nuevo
  AND runAgent() se ejecuta normalmente
  AND usuario recibe respuesta en WhatsApp
  AND log: [CHATWOOT-RT] forward failed (incoming): <error message>

ACCEPTANCE: Railway muestra [CHATWOOT-RT] error; bot responde normalmente en WA; session.chatwootConversationId=null en Redis
```

### Escenario 6 — Chatwoot caído mid-conversation (ID ya existe)

```
GIVEN session.chatwootConversationId = 21
  AND Chatwoot devuelve 503 en postMessage
WHEN chatwootForward(incoming) llama postMessage
THEN postMessage lanza → chatwootForward absorbe
  AND session.chatwootConversationId = 21 (no se borra)
  AND bot sigue funcionando
  AND próximo mensaje exitoso → se postea en conv 21 (gap de mensajes aceptable)
  AND log: [CHATWOOT-RT] forward failed (incoming): Chatwoot POST ... → 503

ACCEPTANCE: bot responde; conv 21 tiene gap (mensajes faltantes durante caída); al recuperarse, mensajes nuevos sí llegan a conv 21
```

### Escenario 7 — Handoff con conversación forwarded en tiempo real

```
GIVEN sesión con chatwootConversationId = 21 y N mensajes ya posteados
WHEN Claude llama handoff_to_human("Prospecto pregunta precio")
THEN archiveToChatwoot detecta session.chatwootConversationId = 21
  AND updateConversationStatus(21, 'open', 'HANDOFF: Prospecto pregunta precio')
  AND NO crea contacto nuevo
  AND NO crea conversación nueva
  AND conv 21 en Chatwoot tiene status=open y label='HANDOFF: Prospecto pregunta precio'
  AND Jack recibe notificación WhatsApp
  AND todos los N mensajes ya están en conv 21 (posteados en tiempo real previamente)

ACCEPTANCE: conv 21 en Chatwoot: status=open, label correcto, N mensajes previos visibles
```

### Escenario 8 — complete_task (rechazo) con conversación forwarded

```
GIVEN sesión con chatwootConversationId = 21
WHEN Claude llama complete_task()
THEN updateConversationStatus(21, 'resolved', 'Conversación completada')
  AND conv 21 queda resuelta
  AND session.completed = true
  AND NO se crean mensajes extra en Chatwoot (solo cambio de status)

ACCEPTANCE: conv 21 status=resolved; sin mensajes nuevos en Chatwoot tras complete_task
```

### Escenario 9 — Sesión expirada 24h con conversación forwarded

```
GIVEN sesión con chatwootConversationId = 21, elapsed > RESET_AFTER_MS (24h)
WHEN nuevo mensaje llega y processMessages detecta expiración
THEN archiveToChatwoot(phone, session, 'Sesión expirada 24h')
  → updateConversationStatus(21, 'resolved', 'Sesión expirada 24h')
  AND resetSession borra sesión de Redis (incluido chatwootConversationId)
  AND processMessages continúa con sesión nueva (fall through)
  AND nuevo mensaje del usuario abre conversación nueva en Chatwoot (conv 22)

ACCEPTANCE: conv 21 = resolved con label; conv 22 nueva con primer mensaje del lead
```

### Escenario 10 — Backward compat: sesión sin chatwootConversationId llega a handoff

```
GIVEN sesión existente sin chatwootConversationId (lead pre-deploy de esta feature)
  AND historia de 8 mensajes
WHEN Claude llama handoff_to_human("Prospecto listo para inscribirse")
THEN archiveToChatwoot detecta session.chatwootConversationId falsy
  AND crea contacto y conversación nueva en Chatwoot
  AND replay de los 8 mensajes de session.history via Promise.all
  AND updateConversationStatus(nueva_conv, 'open', 'HANDOFF: ...')
  AND session.chatwootConversationId = nueva_conv (backfill para referencia futura)

ACCEPTANCE: conv nueva en Chatwoot con 8 mensajes históricos + status=open
```

### Escenario 11 — Audio transcripto forwarded correctamente

```
GIVEN usuario envía mensaje de audio
  AND Kapso transcript = "quiero saber el precio" (91 chars)
WHEN processMessages procesa el transcript como texto
THEN chatwootForward(incoming) postea "quiero saber el precio" en Chatwoot
  AND NO postea "[audio]" prefix en v1
  AND bot procesa el texto normalmente

ACCEPTANCE: Chatwoot muestra texto transcripto como incoming; sin prefijo
```

### Escenario 12 — Audio sin transcripción (fallida o muy largo)

```
GIVEN usuario envía audio >2MB
  AND server.js envía mensaje "Tu audio es muy largo..."
WHEN chatwootForward(incoming) se llama con "[audio >2MB — no transcripto]"
THEN Chatwoot muestra el marcador como incoming
  AND el mensaje de error al usuario se postea como outgoing

ACCEPTANCE: conv Chatwoot muestra: incoming "[audio >2MB]" → outgoing "Tu audio es muy largo..."
```

### Escenario 13 — Selección de botón interactivo

```
GIVEN bot envió ask_with_buttons con opciones ["Sí, soy dev", "Algo técnico", "No aún"]
WHEN usuario toca botón "Sí, soy dev"
  AND server.js extrae msg.interactive.button_reply.title = "Sí, soy dev"
THEN chatwootForward(incoming) postea "Sí, soy dev" en Chatwoot
  AND bot procesa como respuesta de calificación

ACCEPTANCE: Chatwoot muestra "Sí, soy dev" como incoming (no "button_reply_id")
```

### Escenario 14 — Mensajes simultáneos (debounce batching)

```
GIVEN usuario envía 3 mensajes rápidos en 2s (< DEBOUNCE_MS=4s)
  AND mensajes: "hola", "vi el curso", "de tiktok"
WHEN debounce consolida → text = "hola\nvi el curso\nde tiktok"
THEN chatwootForward postea el texto concatenado como UN solo mensaje incoming
  AND Chatwoot muestra 1 mensaje, no 3
  AND runAgent procesa los 3 mensajes juntos (como ya ocurre hoy)

ACCEPTANCE: conv Chatwoot tiene 1 incoming con "\n" concatenado
```

### Escenario 15 — humanMode activo: bot silenciado

```
GIVEN session.humanMode = true (Jack tomó control via Chatwoot)
WHEN nuevo mensaje del usuario llega
THEN processMessages retorna temprano (humanMode guard)
  AND chatwootForward NO se llama
  AND Chatwoot recibe el mensaje del usuario via webhook nativo de Chatwoot (no via bot)

ACCEPTANCE: mensaje del usuario llega a Chatwoot via el canal Chatwoot nativo, no duplicado via chatwootForward
```

### Escenario 16 — Stale conversation ID (conv eliminada de Chatwoot manualmente)

```
GIVEN session.chatwootConversationId = 21
  AND conv 21 fue eliminada manualmente de Chatwoot
WHEN chatwootForward(incoming) llama postMessage(21, ...)
THEN Chatwoot devuelve 404
  AND chatwootForward absorbe el error
  AND log: [CHATWOOT-RT] forward failed (incoming): Chatwoot POST .../messages → 404
  AND session.chatwootConversationId queda 21 (no se auto-limpia en v1)
  AND bot sigue funcionando; mensajes no llegan a Chatwoot hasta resetSession

ACCEPTANCE: [CHATWOOT-RT] log en Railway; bot responde normalmente; mensajes perdidos hasta next session
```

### Escenario 17 — Race condition: Redis falla entre ensureConversation y saveSession

```
GIVEN session.chatwootConversationId = null
WHEN ensureChatwootConversation crea conv exitosamente → ID = 22
  AND saveSession falla antes de persistir (Redis timeout)
THEN session en memoria tiene chatwootConversationId = 22
  AND Redis tiene chatwootConversationId = null
  AND bot responde en WhatsApp correctamente
  AND próximo mensaje: getSession devuelve chatwootConversationId=null
    → ensureChatwootConversation crea conv 23 (duplicado en Chatwoot — gap aceptable)

ACCEPTANCE: bot funciona; 2 convs en Chatwoot para la misma sesión (visible en Chatwoot). Aceptable en v1. Mitigación v2: retry/idempotency en saveSession.
```

### Escenario 18 — MAX_TOOL_ROUNDS fallback reply forwarded

```
GIVEN Claude loop llega a 10 rondas sin end_turn
WHEN runAgent retorna reply = "Tuve un problema procesando tu mensaje..."
THEN reply pasa dedup (distinto de prevReply)
  AND chatwootForward(outgoing) postea el fallback reply
  AND sendText envía al usuario

ACCEPTANCE: Chatwoot muestra el fallback reply como outgoing; usuario no queda en silencio
```

---

## Garantías de orden

Chatwoot no garantiza orden de mensajes por timestamp si se crean simultáneamente. El orden en Chatwoot depende del orden de las llamadas HTTP:

```
chatwootForward(incoming) → await (serial) → chatwootForward(outgoing)
```

La llamada `outgoing` ocurre DESPUÉS de que `incoming` retorna exitosamente. No son paralelas. Esto garantiza que Chatwoot muestra primero el mensaje del usuario y luego la respuesta del bot.

> Si se cambia a paralelo en el futuro para performance: se pierde garantía de orden. Documentar explícitamente.

---

## Requisitos no funcionales

| ID | Requisito | Valor objetivo | Medición |
|----|-----------|---------------|----------|
| NF1 | Latencia adicional por forward (Chatwoot UP) | < 400ms p95 por mensaje | Sensor `chatwoot_forward_ms` en logs |
| NF2 | Impacto en bot si Chatwoot caído | Cero — bot funciona | Test de caída en staging |
| NF3 | Mensajes duplicados por mensaje de usuario | 0 | Chatwoot conversation ID estable |
| NF4 | Conversaciones duplicadas por sesión activa | 0 (nominal) | Race condition: riesgo teórico, no reproducible en flujo normal |
| NF5 | Backward compat con sesiones pre-deploy | 100% — path fallback | Test con sesión manual sin campo |
| NF6 | Tiempo hasta primer mensaje visible en Chatwoot | < 3s desde webhook recibido | Manual: cronometrar en staging |
| NF7 | Mensajes perdidos cuando Chatwoot caído | Aceptable (gap) — bot no retiene para reenvío en v1 | Logs de errores |
| NF8 | Impacto en Redis por campo nuevo | Negligible — 1 integer por sesión (~8 bytes) | |

---

## Fuera de scope (v1)

| Item | Motivo |
|------|--------|
| Caption de archivos multimedia (temario, testimonios) | Requiere construir URL del archivo en Chatwoot |
| `ask_with_buttons` body forwarded como mensaje | Chatwoot WABiz nativo ya los recibe; duplicar es ruido |
| Prefijo `[audio]` en transcripciones | Cosmético, bajo impacto |
| Auto-asignación de conversación a agente específico | Configuración Chatwoot, no código |
| Retry automático de mensajes fallidos cuando Chatwoot se recupera | Requiere cola persistente (complejidad alta) |
| Stale ID auto-heal (detectar 404 → limpiar → reintentar) | Mitigación v2, documentada en chatwoot-session.md |
| Forward de mensajes enviados por Jack via `/chatwoot-webhook` a Chatwoot | Ya llegan via Chatwoot nativo |
