# Spec — Real-Time Message Forwarding

## Objetivo

Cada mensaje visible de la conversación (usuario → bot, bot → usuario) aparece en Chatwoot en tiempo real, sin esperar al final de la sesión.

## Definición de "mensaje visible"

| Tipo | ¿Se postea a Chatwoot? |
|------|------------------------|
| Texto del usuario | ✅ `incoming` |
| Respuesta de texto del bot | ✅ `outgoing` |
| Llamadas internas a tools (save_variable, get_variable, etc.) | ❌ ruido interno |
| Botones enviados con ask_with_buttons | ✅ cuerpo del botón como `outgoing` |
| Audio transcripto del usuario | ✅ transcripción como `incoming` |
| Archivos enviados (temario, testimonios) | ❌ solo el caption si aplica (out of scope v1) |

> Nota v1: `ask_with_buttons` envía a WhatsApp pero no a Chatwoot en esta versión. El bot reply de texto que acompaña al botón sí se postea. Evaluar en v2.

## Escenarios

### Escenario 1 — Primera conversación (sesión nueva)

```
GIVEN sesión vacía (sin chatwootConversationId)
WHEN usuario envía primer mensaje
THEN Chatwoot crea contacto con número E.164
  AND Chatwoot crea conversación con status=pending
  AND session.chatwootConversationId persiste en Redis
  AND mensaje incoming visible en Chatwoot en <2s
```

### Escenario 2 — Continuación de conversación (sesión existente con ID)

```
GIVEN session.chatwootConversationId = X
WHEN usuario envía mensaje N
THEN NO se crea nueva conversación en Chatwoot
  AND mensaje se postea en conversación X
  AND X permanece igual en session
```

### Escenario 3 — Respuesta del bot forwarded

```
GIVEN conversación X existe en Chatwoot
WHEN runAgent() devuelve reply
  AND reply !== prevReply (dedup)
THEN reply se postea en conversación X como outgoing
  AND sendText envía a WhatsApp
  AND orden en Chatwoot: primero incoming, luego outgoing
```

### Escenario 4 — Chatwoot caído (error en forward)

```
GIVEN Chatwoot devuelve 5xx o no responde
WHEN chatwootForward() lanza
THEN error se loguea con [CHATWOOT-RT]
  AND bot sigue procesando normalmente
  AND usuario recibe respuesta en WhatsApp
  AND NO se bloquea ni interrumpe el flujo
```

### Escenario 5 — Handoff con conversación ya forwarded

```
GIVEN sesión con chatwootConversationId = X y 10 mensajes
WHEN Claude llama handoff_to_human("Prospecto pregunta precio")
THEN archiveToChatwoot detecta X existe
  AND updateConversationStatus(X, 'open', 'HANDOFF: Prospecto pregunta precio')
  AND NO se crea conversación nueva
  AND conversación X muestra todos los mensajes más el label de handoff
```

### Escenario 6 — complete_task con conversación already forwarded

```
GIVEN sesión con chatwootConversationId = X
WHEN Claude llama complete_task()
THEN updateConversationStatus(X, 'resolved', 'Conversación completada')
  AND conversación X queda resuelta en Chatwoot
```

### Escenario 7 — Sesión expirada (24h) con conversación forwarded

```
GIVEN sesión con chatwootConversationId = X, elapsed > 24h
WHEN processMessages detecta expiración
THEN archiveToChatwoot(phone, session, 'Sesión expirada 24h')
  AND updateConversationStatus(X, 'resolved', 'Sesión expirada 24h')
  AND resetSession borra chatwootConversationId
  AND próxima conversación del lead crea nueva conv en Chatwoot
```

### Escenario 8 — Sesión sin chatwootConversationId (backward compat)

```
GIVEN sesión existente sin chatwootConversationId (antes del deploy de esta feature)
WHEN handoff_to_human o complete_task se llama
THEN archiveToChatwoot usa path fallback: replay history completo
  AND crea conversación nueva en Chatwoot con todos los mensajes
  AND setea status y label correspondiente
```

### Escenario 9 — Mensaje de audio transcripto

```
GIVEN usuario envía audio → Kapso/Groq lo transcribe a texto
WHEN processMessages recibe transcript
THEN transcript se trata como texto normal
  AND chatwootForward(incoming) postea el transcript en Chatwoot
  AND label opcional "[audio]" al inicio del texto (out of scope v1)
```

### Escenario 10 — Mensajes simultáneos (debounce batching)

```
GIVEN usuario envía 3 mensajes rápidos dentro del DEBOUNCE_MS (4s)
WHEN debounce los consolida en un solo text = "msg1\nmsg2\nmsg3"
THEN chatwootForward postea el texto concatenado como UN solo mensaje incoming
  AND Chatwoot muestra un mensaje, no tres
```

## Requisitos no funcionales

| Requisito | Valor |
|-----------|-------|
| Latencia added por Chatwoot forward | < 500ms p95 (no bloquea UX de WhatsApp) |
| Chatwoot caído → impacto en bot | Cero (try/catch no-fatal) |
| Mensajes duplicados en Chatwoot | No (chatwootConversationId previene doble-conv) |
| Conversaciones duplicadas en Chatwoot | No para una sesión activa; posible si Redis falla antes de persistir ID |
| Backward compat con sesiones sin ID | Sí (path fallback en archiveToChatwoot) |

## Fuera de scope (v1)

- Caption de archivos multimedia (temario, testimonios) forwarded a Chatwoot
- Label de `ask_with_buttons` forwarded como mensaje separado
- Asignación automática de conversación a agente Chatwoot específico
- Notificaciones push de Chatwoot a Jack cuando llega nueva conversación (Chatwoot ya lo hace nativamente con notificaciones de la app)
