# Spec — Observability

## Objetivo

Toda la actividad de Chatwoot real-time debe ser rastreable en logs de Railway. Cuando algo falla, el operador puede ir a Railway → Logs y entender exactamente qué pasó, cuándo, para qué número de teléfono (suffix), y por qué.

---

## Sensor events nuevos (structured JSON logs)

Todos los logs de tipo sensor son JSON en una sola línea. Railway los indexa y permite `grep`.

### `chatwoot_forward_ok`

Emitido por `chatwootForward` cuando el mensaje se postea exitosamente.

```json
{
  "type": "chatwoot_forward_ok",
  "phone_suffix": "2214",
  "direction": "incoming",
  "conversation_id": 21,
  "chars": 47
}
```

| Campo | Descripción |
|-------|-------------|
| `phone_suffix` | Últimos 4 dígitos del teléfono (privacidad) |
| `direction` | `"incoming"` (usuario → Chatwoot) o `"outgoing"` (bot → Chatwoot) |
| `conversation_id` | ID de la conversación en Chatwoot |
| `chars` | Longitud del texto posteado (para detectar mensajes vacíos) |

### `chatwoot_forward_error`

Emitido por `chatwootForward` cuando postMessage o ensureConversation falla.

```json
{
  "type": "chatwoot_forward_error",
  "phone_suffix": "2214",
  "direction": "incoming",
  "error": "Chatwoot POST /conversations/21/messages → 404",
  "http_status": "404"
}
```

### `chatwoot_conv_created`

Emitido por `ensureChatwootConversation` cuando crea una conversación nueva.

```json
{
  "type": "chatwoot_conv_created",
  "phone_suffix": "2214",
  "conversation_id": 22,
  "contact_id": 9
}
```

### `chatwoot_conv_updated`

Emitido por `archiveToChatwoot` cuando actualiza status/label de conversación existente.

```json
{
  "type": "chatwoot_conv_updated",
  "phone_suffix": "2214",
  "conversation_id": 21,
  "status": "open",
  "label": "handoff",
  "trigger": "HANDOFF: Prospecto pregunta precio"
}
```

### `chatwoot_archive_error`

Emitido por `archiveToChatwoot` cuando el archival falla.

```json
{
  "type": "chatwoot_archive_error",
  "phone_suffix": "2214",
  "label": "HANDOFF: Prospecto pregunta precio",
  "error": "Chatwoot PATCH /conversations/21 → 503"
}
```

### `chatwoot_archive_fallback`

Emitido por `archiveToChatwoot` cuando no hay `chatwootConversationId` (backward compat path).

```json
{
  "type": "chatwoot_archive_fallback",
  "phone_suffix": "2214",
  "messages_replayed": 8,
  "conversation_id": 23
}
```

---

## Logs humanos existentes (ajustar prefijos)

Los logs existentes deben mantener formato consistente con los nuevos:

| Log actual | Log nuevo |
|------------|-----------|
| `[CHATWOOT] ${phone} → conversation ${id} (${label})` | Reemplazar por `chatwoot_conv_updated` structured |
| `[CHATWOOT] archive failed (${label}): ${err.message}` | Reemplazar por `chatwoot_archive_error` structured |

> Mantener los logs humanos para casos críticos (handoff, archive), pero siempre como JSON para poder hacer grep por `type`.

---

## Queries de diagnóstico en Railway

### ¿Cuántos forwards exitosos en las últimas 2h?

```
grep "chatwoot_forward_ok" logs
```

### ¿Hay errores de Chatwoot?

```
grep "chatwoot_forward_error\|chatwoot_archive_error"
```

### ¿Qué conversaciones se crearon hoy?

```
grep "chatwoot_conv_created"
```

### ¿Hay stale IDs (404)?

```
grep "http_status.*404"
```

### ¿Hay rate limiting (429)?

```
grep "http_status.*429"
```

---

## Métricas a monitorear (manual en Railway, no automatizado en v1)

| Métrica | Cómo medirla | Umbral de alerta |
|---------|-------------|------------------|
| % de forwards exitosos | `chatwoot_forward_ok` / (ok + error) | < 95% en 1h → investigar |
| Latencia de forward | `chatwoot_forward_ms` (agregar en v2) | No medida en v1 |
| Conversaciones creadas por hora | contar `chatwoot_conv_created` | Anómalo si cae a 0 con webhooks activos |
| Errores 401 | `http_status: "401"` | Cualquiera → token expirado, acción inmediata |
| Errores 404 (stale) | `http_status: "404"` | > 5 en 1h → revisar convs eliminadas en Chatwoot |

---

## Dashboard de operaciones (Railway)

Para revisar el estado de Chatwoot real-time en Railway Logs, usar los filtros:

```
# Estado general
grep '"type":"chatwoot' logs | tail -50

# Solo errores
grep '"type":"chatwoot_forward_error\|chatwoot_archive_error"' logs

# Actividad de un número específico (últimos 4 dígitos)
grep '"phone_suffix":"2214"' logs

# Conversaciones nuevas creadas
grep '"type":"chatwoot_conv_created"' logs | tail -20
```

---

## Sensor `chatwoot_forward_ms` (v2 roadmap)

Para medir latencia de Chatwoot sin afectar el flujo principal:

```js
export async function chatwootForward(phone, session, text, direction, contactInfo) {
  const t0 = Date.now();
  try {
    const conversationId = await ensureChatwootConversation(phone, session, contactInfo);
    await postMessage(conversationId, text, direction);
    const ms = Date.now() - t0;
    console.log(JSON.stringify({
      type: 'chatwoot_forward_ok',
      phone_suffix: phone.slice(-4),
      direction,
      conversation_id: conversationId,
      chars: text.length,
      ms,  // ← v2: agregar este campo
    }));
  } catch (err) {
    // ...
  }
}
```

Cuando `ms` > 400 consistentemente → Chatwoot lento → evaluar timeout más agresivo o fire-and-forget.

---

## Integración con sensor `agent_trace` existente

El sensor `agent_trace` en `runAgent` ya loguea `duration_ms`, `rounds`, `tools_called`. Para correlacionar con el tiempo de forward:

```
agent_trace.duration_ms = tiempo total de runAgent
chatwoot_forward_ok.ms (incoming) = tiempo antes de runAgent
chatwoot_forward_ok.ms (outgoing) = tiempo después de runAgent
```

Con los tres valores se puede ver: `tiempo_total_procesamiento = incoming_ms + runAgent_ms + outgoing_ms + sendText_ms`.

---

## Alertas recomendadas (Chatwoot nativo)

Chatwoot tiene notificaciones nativas que el operador debe configurar:

| Evento Chatwoot | Notificación recomendada | Canal |
|----------------|------------------------|-------|
| Nueva conversación pending | Push notification / email a Jack | Chatwoot Settings → Notifications |
| Conversación con label `handoff` | Email a Jack | Chatwoot automation (si disponible) |
| Conversación sin respuesta >10min | Notificación push | Chatwoot Settings |

Estas alertas no requieren código — son configuración de Chatwoot.
