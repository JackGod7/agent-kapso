# Spec — Error Handling

## Principio rector

Chatwoot es un sistema **auxiliar** — su fallo nunca puede degradar la experiencia del usuario en WhatsApp ni interrumpir el bot. Todos los errores de Chatwoot son absorbidos y logueados. El usuario siempre recibe respuesta.

---

## Taxonomía de errores

### Nivel 1 — Errores de red / infraestructura

| Error | Cuándo ocurre | Comportamiento |
|-------|---------------|----------------|
| `ECONNREFUSED` | Chatwoot caído | Absorbido. Log `[CHATWOOT-RT]`. Bot continúa. |
| `ETIMEDOUT` / `ECONNRESET` | Chatwoot no responde | Absorbido. Log `[CHATWOOT-RT]`. Bot continúa. |
| DNS lookup failure | URL incorrecta o red caída | Absorbido. Log `[CHATWOOT-RT]`. Bot continúa. |
| `fetch` timeout (sin timeout explícito) | Chatwoot colgado | En v1: Node fetch no tiene timeout → posible bloqueo. **Riesgo real.** Ver sección de mitigación. |

### Nivel 2 — Errores HTTP de Chatwoot

| Código | Endpoint | Causa probable | Comportamiento |
|--------|----------|----------------|----------------|
| `400 Bad Request` | POST /contacts, POST /conversations | Payload mal formado | Log con payload redactado. Absorbido. |
| `401 Unauthorized` | Cualquier endpoint | `CHATWOOT_API_TOKEN` incorrecto o expirado | Log `[CHATWOOT-AUTH] API token inválido`. Absorbido. Alert en v2. |
| `404 Not Found` | POST /conversations/:id/messages | `chatwootConversationId` stale (conv eliminada) | Log `[CHATWOOT-RT] stale conversation id: <N>`. Absorbido. Stale-ID recovery en v2. |
| `422 Unprocessable Entity` | POST /contacts | Phone sin formato E.164 | No debe ocurrir (E.164 ya garantizado en `upsertContact`). Si ocurre: log + absorb. |
| `422 Unprocessable Entity` | POST /labels | Label no existe en Chatwoot account | Log `[CHATWOOT-RT] label not found: <label>`. Absorbido. Fallback: omitir label, solo actualizar status. |
| `429 Too Many Requests` | Cualquier endpoint | Rate limit de Chatwoot | Log `[CHATWOOT-RT] rate limited`. Absorbido. No retry en v1. |
| `5xx Server Error` | Cualquier endpoint | Chatwoot interno caído | Absorbido. Log `[CHATWOOT-RT]`. |

### Nivel 3 — Errores de negocio

| Condición | Causa | Comportamiento |
|-----------|-------|----------------|
| `upsertContact` retorna `undefined` | API response shape inesperada | `ensureChatwootConversation` lanza `Error('upsertContact returned undefined')`. Absorbido por `chatwootForward`. Log `[CHATWOOT-RT]`. |
| `createConversation` retorna `conv.id = null/0` | Respuesta inesperada | Validar `conv.id > 0`. Si falla: lanzar, absorber en `chatwootForward`. |
| `archiveToChatwoot` en session.completed = true (doble trigger) | Doble handoff o handoff + complete_task | Guard `if (session.completed) return 'already_completed'` ya previene. Si llega igual: `updateConversationStatus` es idempotente (setear mismo status 2x no rompe). |

---

## Fetch timeout — riesgo real en v1

Node `fetch` nativo (Node 18+) no tiene timeout configurable sin `AbortController`. Sin timeout, si Chatwoot cuelga la conexión sin cerrarla, `chatwootForward` puede bloquearse indefinidamente.

**Impacto:** Bot responde con delay igual al timeout TCP del SO (~2 min en Railway). Usuario espera 2 min. Inaceptable.

**Mitigación en v1 — agregar AbortController a `req()` en chatwoot.js:**

```js
async function req(path, method = 'GET', body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s max
  try {
    const res = await fetch(`${BASE()}/api/v1/accounts/${ACCOUNT()}${path}`, {
      method,
      headers: { 'api_access_token': TOKEN(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Chatwoot ${method} ${path} → ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

Con esto, si Chatwoot no responde en 8s, `fetch` lanza `AbortError` → capturado por `chatwootForward` → bot continúa.

**Este cambio es parte de esta feature y debe implementarse como T0 (antes que T1-T5).**

---

## Estrategia de absorción de errores

### En `chatwootForward` (función pública)

```js
export async function chatwootForward(phone, session, text, direction, contactInfo) {
  try {
    const conversationId = await ensureChatwootConversation(phone, session, contactInfo);
    await postMessage(conversationId, text, direction);
  } catch (err) {
    const code = err.cause?.status || err.message.match(/→ (\d+)/)?.[1] || 'unknown';
    console.error(JSON.stringify({
      type: 'chatwoot_forward_error',
      direction,
      phone_suffix: phone.slice(-4),
      error: err.message,
      http_status: code,
    }));
    // NEVER rethrow — caller must not crash
  }
}
```

### En `archiveToChatwoot` (función pública)

```js
export async function archiveToChatwoot(phone, session, label, contactInfo) {
  try {
    // ... lógica
  } catch (err) {
    console.error(JSON.stringify({
      type: 'chatwoot_archive_error',
      label,
      phone_suffix: phone.slice(-4),
      error: err.message,
    }));
    // NEVER rethrow — archival failure must not interrupt handoff/complete_task
  }
}
```

### En `updateConversationStatus` (función interna)

Puede lanzar. Sus callers (`archiveToChatwoot`) tienen try/catch. No agregar try/catch adicional aquí — la absorción ocurre en el nivel superior.

### En `req()` (función interna)

Lanza en `!res.ok` o `AbortError`. No absorbe. Sus callers absorben según corresponde.

---

## Errores que SÍ deben propagarse (no absorber)

| Contexto | Error | Por qué no absorber |
|----------|-------|---------------------|
| `CHATWOOT_API_TOKEN` no seteado | `TOKEN()` retorna undefined → `api_access_token: undefined` | 401 en primera llamada. Se absorbe en chatwootForward pero se loguea como `chatwoot_forward_error`. El operador debe detectarlo en logs y setear la env var. |
| `CHATWOOT_BASE_URL` no seteado | `BASE()` retorna undefined → URL malformada | `fetch` lanza `TypeError: Invalid URL` → absorbido en chatwootForward. |
| `CHATWOOT_ACCOUNT_ID` no seteado | URL con `undefined` → 404 | Absorbido. Log. |

> Ninguno de estos rompe el bot. Todos producen logs claros. El operador los detecta en Railway logs.

---

## Errores del sistema principal que afectan a Chatwoot

| Error | Efecto en Chatwoot |
|-------|--------------------|
| `runAgent` lanza (Claude API error) | `chatwootForward(outgoing)` nunca se llama. Solo el incoming está en Chatwoot. Gap de respuesta visible — Jack puede intervenir. |
| `saveSession` falla después de setear `chatwootConversationId` | ID en memoria pero no en Redis. Próximo mensaje del mismo lead (dentro de la misma conexión Node) usa ID de memoria ✅. Pero si proceso reinicia: ID se pierde → nueva conv en Chatwoot (gap aceptable). |
| `sendText` (WhatsApp) lanza | `chatwootForward(outgoing)` ya corrió antes de `sendText`. Chatwoot tiene la respuesta pero WhatsApp no la recibió. Inconsistencia de estado — poco frecuente en práctica. |

---

## Labels que no existen en Chatwoot (422)

Labels requeridos en Chatwoot Settings → Labels antes del primer deploy:

| Label | Quién lo asigna | Trigger |
|-------|----------------|---------|
| `handoff` | archiveToChatwoot | handoff_to_human |
| `completada` | archiveToChatwoot | complete_task |
| `expirada-24h` | archiveToChatwoot | 24h expiry |

> Labels truncados para respetar el límite de ~25 chars de Chatwoot. En código, el `reason` completo del handoff se loguea en Railway (`[HANDOFF] phone: reason`), no en el label.

Si el label no existe, la API devuelve 422. `req()` lanza `Chatwoot POST .../labels → 422`. El caller (`archiveToChatwoot`) lo absorbe. Consecuencia: conversación no tiene label pero sí tiene el status correcto (open/resolved). Operacionalmente aceptable.

---

## Checklist de operación pre-deploy

Antes de hacer deploy a prod de esta feature, verificar:

- [ ] `CHATWOOT_BASE_URL` seteado en Railway (sin trailing slash)
- [ ] `CHATWOOT_API_TOKEN` seteado y válido (puede hacer GET /profile exitosamente)
- [ ] `CHATWOOT_ACCOUNT_ID` seteado (entero)
- [ ] `CHATWOOT_INBOX_ID` seteado (entero, debe ser el inbox WhatsApp Kapso - GH600)
- [ ] Labels `handoff`, `completada`, `expirada-24h` creados en Chatwoot Settings → Labels
- [ ] Integration test pasa: `node -r dotenv/config tests/chatwoot.integration.mjs`
- [ ] Realtime integration test pasa: `node -r dotenv/config tests/chatwoot-realtime.integration.mjs`
