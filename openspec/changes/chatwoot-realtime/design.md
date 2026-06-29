# Design — Chatwoot Real-Time Forwarding

## Diagrama de dependencias entre módulos

```
server.js
  ├── imports: chatwootForward         ← src/chatwoot.js (NUEVO)
  ├── imports: archiveToChatwoot       ← src/chatwoot.js (MOVIDO desde agent.js)
  ├── imports: runAgent                ← src/agent.js (sin cambio)
  └── imports: getSession, saveSession ← src/state.js (sin cambio)

src/agent.js
  ├── imports: archiveToChatwoot       ← src/chatwoot.js (NUEVO — antes era local)
  └── ya NO define: archiveToChatwoot, extractText

src/chatwoot.js (propietario único de toda la lógica Chatwoot)
  ├── exports: upsertContact           (existente)
  ├── exports: createConversation      (existente)
  ├── exports: postMessage             (existente)
  ├── exports: ensureChatwootConversation  ← NUEVO
  ├── exports: chatwootForward             ← NUEVO
  ├── exports: updateConversationStatus    ← NUEVO
  └── exports: archiveToChatwoot           ← MOVIDO desde agent.js
  └── (interna) extractText                ← MOVIDA desde agent.js
```

**Principio de diseño:** `src/chatwoot.js` es el único módulo que conoce Chatwoot. Ni `server.js` ni `agent.js` llaman `req()` ni conocen la API de Chatwoot directamente. Toda la lógica de Chatwoot vive en un lugar.

---

## Flujo de datos — happy path completo

```
Usuario (WA)       Kapso         server.js            chatwoot.js           Chatwoot          Redis
    │                │                │                    │                    │                │
    │──"Hola"────────►                │                    │                    │                │
    │                │──webhook POST──►                    │                    │                │
    │                │                │─getSession(phone)──────────────────────────────────────►│
    │                │                │◄─{...session, chatwootConversationId: null}──────────────│
    │                │                │                    │                    │                │
    │                │                │──chatwootForward("Hola", incoming)──►   │                │
    │                │                │                    │─ensureConv()──────►│                │
    │                │                │                    │  upsertContact()──►│                │
    │                │                │                    │◄─contactId=9───────│                │
    │                │                │                    │  createConv(9)────►│                │
    │                │                │                    │◄─convId=21─────────│                │
    │                │                │                    │  session.chatwootConversationId=21  │
    │                │                │                    │  postMessage(21, "Hola", incoming)─►│
    │                │                │                    │◄─ok────────────────│                │
    │                │                │◄───────────────────│                    │                │
    │                │                │──saveSession(session)───────────────────────────────────►│
    │                │                │  (persiste chatwootConversationId=21)   │               ◄│
    │                │                │                    │                    │                │
    │                │                │──runAgent(phone, "Hola", contactInfo)───────────────────►│
    │                │                │  [Claude: get_whatsapp_context, ask_with_buttons, ...]   │
    │                │                │◄─reply="¿Tienes base técnica?"──────────────────────────│
    │                │                │  (runAgent hace saveSession internamente)                │
    │                │                │                    │                    │                │
    │                │                │──chatwootForward("¿Tienes base técnica?", outgoing)──►   │
    │                │                │                    │─ensureConv()──────►│                │
    │                │                │                    │  (convId=21, skip) │                │
    │                │                │                    │  postMessage(21, "¿Tienes...", out)►│
    │                │                │                    │◄─ok────────────────│                │
    │                │                │◄───────────────────│                    │                │
    │                │                │──sendText(phone, reply)                 │                │
    │◄─"¿Tienes base técnica?"─────────                   │                    │                │
    │                │                │                    │                    │                │
    │  [N mensajes más — convId=21 reutilizado, sin re-crear]                   │                │
    │                │                │                    │                    │                │
    │──"cuánto cuesta?"───────────────►                    │                    │                │
    │                │                │  [Claude → handoff_to_human]            │                │
    │                │                │                    │─archiveToChatwoot──►               │
    │                │                │                    │  (convId=21 existe → updateStatus)  │
    │                │                │                    │  PATCH /conv/21 → status=open──────►│
    │                │                │                    │  POST /conv/21/labels → handoff────►│
    │◄─"Jack te escribe ahora"─────────                   │                    │                │
```

---

## Implementación por archivo

### `src/chatwoot.js` — orden de implementación

#### T0 — Agregar AbortController a `req()` (CRÍTICO — implementar primero)

Sin esto, si Chatwoot cuelga la conexión TCP, Node espera indefinidamente (~2min timeout del SO). El bot se bloquea para ese lead.

```js
async function req(path, method = 'GET', body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
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
    clearTimeout(timer);
  }
}
```

> 8s elegido porque: Chatwoot en Railway típicamente responde en <500ms. 8s da margen para picos de carga sin ser un bloqueo inaceptable para el usuario.

#### T1 — `updateConversationStatus(conversationId, status, label)`

```js
async function updateConversationStatus(conversationId, status, label) {
  await req(`/conversations/${conversationId}`, 'PATCH', { status });
  if (label) {
    const truncated = label.slice(0, 25); // Chatwoot label limit
    await req(`/conversations/${conversationId}/labels`, 'POST', { labels: [truncated] });
  }
}
```

> Nota: `updateConversationStatus` es interna (no exportada). Solo la usan `archiveToChatwoot` dentro del mismo módulo.

#### T2 — `ensureChatwootConversation(phone, session, contactInfo)`

```js
async function ensureChatwootConversation(phone, session, contactInfo) {
  if (session.chatwootConversationId) return session.chatwootConversationId;
  const name = session.variables['nombre'] || session.variables['name']
    || contactInfo?.contact_name || phone;
  const contactId = await upsertContact(phone, name);
  if (!contactId) throw new Error('upsertContact returned undefined');
  const conv = await req('/conversations', 'POST', {
    inbox_id: parseInt(INBOX()),
    contact_id: contactId,
    additional_attributes: { source: 'kapso-whatsapp' },
  });
  const conversationId = conv.id;
  if (!conversationId || conversationId <= 0) throw new Error(`invalid conv id: ${conversationId}`);
  session.chatwootConversationId = conversationId;
  console.log(JSON.stringify({
    type: 'chatwoot_conv_created',
    phone_suffix: phone.slice(-4),
    conversation_id: conversationId,
    contact_id: contactId,
  }));
  return conversationId;
}
```

> `ensureChatwootConversation` es interna. Solo la llama `chatwootForward` (y `archiveToChatwoot` en fallback path). No exportar.

> Nota: `createConversation` existente hace POST pero con payload mínimo. Para evitar duplicar código, `ensureChatwootConversation` llama `req()` directamente con el payload completo (incluye `additional_attributes`). `createConversation` puede quedar para el fallback path o refactorizarse. Evaluar en T5.

#### T3 — `chatwootForward(phone, session, text, direction, contactInfo)` (exportada)

```js
export async function chatwootForward(phone, session, text, direction, contactInfo) {
  if (!text?.trim()) return; // no postear mensajes vacíos
  try {
    const conversationId = await ensureChatwootConversation(phone, session, contactInfo);
    await postMessage(conversationId, text, direction);
    console.log(JSON.stringify({
      type: 'chatwoot_forward_ok',
      phone_suffix: phone.slice(-4),
      direction,
      conversation_id: conversationId,
      chars: text.length,
    }));
  } catch (err) {
    const httpStatus = err.message.match(/→ (\d+)/)?.[1] || 'unknown';
    console.error(JSON.stringify({
      type: 'chatwoot_forward_error',
      phone_suffix: phone.slice(-4),
      direction,
      error: err.message,
      http_status: httpStatus,
    }));
    // NEVER rethrow — Chatwoot failure must not block the bot
  }
}
```

#### T4 — Mover `extractText(content)` de `agent.js` a `chatwoot.js`

```js
// Mueve a chatwoot.js (función interna, no exportada)
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
  return '';
}
```

En `agent.js`: eliminar la función. No hay más callers en `agent.js` después de que `archiveToChatwoot` se mueve.

#### T5 — `archiveToChatwoot` (mover de `agent.js` + actualizar para idempotencia)

```js
export async function archiveToChatwoot(phone, session, label, contactInfo) {
  try {
    const conversationId = session.chatwootConversationId;

    if (conversationId) {
      // Conversación ya existe (real-time path) — solo actualizar status y label
      const status = label.startsWith('HANDOFF') ? 'open' : 'resolved';
      await updateConversationStatus(conversationId, status, label);
      console.log(JSON.stringify({
        type: 'chatwoot_conv_updated',
        phone_suffix: phone.slice(-4),
        conversation_id: conversationId,
        status,
        label: label.slice(0, 25),
      }));
    } else {
      // Fallback: sesión sin real-time (pre-deploy o forward fallido)
      const name = session.variables['nombre'] || session.variables['name']
        || contactInfo?.contact_name || phone;
      const contactId = await upsertContact(phone, name);
      if (!contactId) throw new Error('upsertContact returned undefined');
      const newConvId = await req('/conversations', 'POST', {
        inbox_id: parseInt(INBOX()),
        contact_id: contactId,
        additional_attributes: { source: 'kapso-whatsapp-fallback' },
      }).then(c => c.id);
      if (!newConvId) throw new Error('createConversation returned no id');

      const messages = session.history
        .map(msg => ({ text: extractText(msg.content), dir: msg.role === 'user' ? 'incoming' : 'outgoing' }))
        .filter(m => m.text);
      await Promise.all(messages.map(m => postMessage(newConvId, m.text, m.dir)));

      const status = label.startsWith('HANDOFF') ? 'open' : 'resolved';
      await updateConversationStatus(newConvId, status, label);

      console.log(JSON.stringify({
        type: 'chatwoot_archive_fallback',
        phone_suffix: phone.slice(-4),
        conversation_id: newConvId,
        messages_replayed: messages.length,
      }));
    }
  } catch (err) {
    console.error(JSON.stringify({
      type: 'chatwoot_archive_error',
      phone_suffix: phone.slice(-4),
      label,
      error: err.message,
    }));
    // NEVER rethrow — archive failure must not interrupt handoff/complete_task
  }
}
```

---

### `src/agent.js` — solo cleanup (T10-T12)

**T10:** Eliminar `archiveToChatwoot` (líneas 194-208 aprox).  
**T11:** Eliminar `extractText` (líneas 210-215 aprox).  
**T12:** Actualizar el import al inicio:

```js
// ANTES:
import { upsertContact, createConversation, postMessage } from './chatwoot.js';

// DESPUÉS:
import { archiveToChatwoot } from './chatwoot.js';
```

> Las otras funciones (`upsertContact`, `createConversation`, `postMessage`) ya no se llaman desde `agent.js` — `archiveToChatwoot` las usa internamente.

La lógica de `agent.js` no cambia. Solo los imports y la eliminación del código movido.

---

### `server.js` — `processMessages` (T6-T9)

```js
// NUEVO import (T6):
import { chatwootForward, archiveToChatwoot } from './src/chatwoot.js';

async function processMessages(phone, messages, contactInfo, lastMessageId) {
  const text = messages.join('\n');
  if (!text.trim()) return;

  const session = await getSession(phone);

  if (session.humanMode) {
    console.log(`[human-mode] ${phone}: bot silenced, human agent active`);
    return;
  }

  try {
    if (session.completed) {
      const elapsed = session.completedAt ? Date.now() - session.completedAt : 0;
      if (elapsed > RESET_AFTER_MS) {
        await archiveToChatwoot(phone, session, 'Sesión expirada 24h', contactInfo);
        await resetSession(phone);
        console.log(`[reset] ${phone}: session expired after 24h`);
        // fall through — process as new conversation
      } else {
        console.log(`[silent] ${phone}: session completed, ignoring`);
        completedSessions++;
        return;
      }
    }

    if (lastMessageId) await sendTyping(phone, lastMessageId).catch(() => {});

    // T7: forward mensaje entrante a Chatwoot ANTES de runAgent
    await chatwootForward(phone, session, text, 'incoming', contactInfo);
    // T8: persistir chatwootConversationId a Redis ANTES de runAgent
    //     (si el proceso muere durante runAgent, el ID ya está en Redis)
    await saveSession(phone, session);

    const prevReply = session.lastReply;
    const reply = await runAgent(phone, text, contactInfo);

    if (reply && reply.trim() !== prevReply?.trim()) {
      // T9: forward respuesta del bot ANTES de sendText (garantiza orden en Chatwoot)
      await chatwootForward(phone, session, reply, 'outgoing', contactInfo);
      await sendText(phone, reply);
    }
  } catch (err) {
    console.error(`[agent] ${phone}:`, err.message);
    webhookErrors++;
  }
}
```

**Cambio en el import al inicio de server.js:**

```js
// ANTES:
import { runAgent, archiveToChatwoot } from './src/agent.js';

// DESPUÉS:
import { runAgent } from './src/agent.js';
import { chatwootForward, archiveToChatwoot } from './src/chatwoot.js';
```

---

## Análisis de latencia

```
Ciclo completo de un mensaje:
  chatwootForward(incoming)    ≈  100–300ms  (1 HTTP call si conv existe, 3 si nueva)
  saveSession                  ≈   10–50ms   (Redis write)
  runAgent (Claude + tools)    ≈ 8000–15000ms
  chatwootForward(outgoing)    ≈  100–300ms  (1 HTTP call, conv ya existe)
  sendText (Kapso)             ≈  200–500ms
  ─────────────────────────────────────────
  Total percibido por usuario  ≈ 8500–16000ms (chatwoot agrega <1% del tiempo total)
```

El forward de Chatwoot es < 2% del tiempo total del ciclo. No es un bottleneck. Si en producción se mide > 400ms p95 consistentemente, evaluar fire-and-forget en v2.

---

## Análisis de consistencia — casos de falla

| Falla | Estado en Chatwoot | Estado del Bot | Acción requerida |
|-------|--------------------|---------------|-----------------|
| Chatwoot caído en incoming forward | Sin mensaje incoming | Bot responde normalmente | Ninguna — gap aceptable |
| Chatwoot caído en outgoing forward | Sin mensaje outgoing | Usuario recibe reply WA | Ninguna — gap aceptable |
| Redis falla en saveSession post-forward | ID en memoria, no en Redis | Bot funciona (misma sesión Node) | Ninguna hasta restart |
| Proceso Node reinicia después de forward, antes de saveSession | Conv existe en Chatwoot pero Redis tiene ID=null | Próximo mensaje crea conv nueva en Chatwoot | Gap: 2 convs en Chatwoot para el mismo lead |
| Claude API falla durante runAgent | Incoming en Chatwoot sin outgoing | Proceso entra en catch, webhookErrors++ | Jack puede ver en Chatwoot y responder manualmente |

---

## Cambios al módulo `createConversation` existente

`createConversation(contactId)` en `chatwoot.js` hace POST mínimo sin `additional_attributes`. Las nuevas funciones (`ensureChatwootConversation` fallback path) usan `req()` directamente con payload extendido.

Decisión: **no modificar `createConversation` existente**. Hacerlo cambiaría el contrato de la función y afectaría tests de integración existentes. Las llamadas nuevas usan `req()` directamente con payload completo. Si en el futuro se quiere unificar, refactor separado.

---

## Branch strategy

```
main
  └── feature/chatwoot-realtime
        ├── commit: T0 — AbortController en req()
        ├── commit: T1-T2 — updateConversationStatus + ensureChatwootConversation
        ├── commit: T3 — chatwootForward
        ├── commit: T4-T5 — extractText move + archiveToChatwoot update
        ├── commit: T10-T12 — agent.js cleanup
        ├── commit: T6-T9 — server.js processMessages update
        ├── commit: T13-T17 — tests
        └── PR → main (después de V1-V5 verdes)
```

Commits atómicos por grupo de tareas relacionadas. Si un commit rompe los tests, se puede revertir sin afectar las demás.

---

## Test determinístico

Ver `specs/real-time-forwarding.md` escenarios 1-4 para los casos cubiertos.

```
Protocolo mínimo de verificación antes de merge:

1. node tests/agent-unit.mjs           → 22+ tests verde
2. node -r dotenv/config tests/chatwoot.integration.mjs   → verde (existente)
3. node -r dotenv/config tests/chatwoot-realtime.integration.mjs → verde (nuevo T13+T14)
4. Railway staging: enviar 3 msgs reales → abrir Chatwoot → ver conv en tiempo real
5. Railway staging: simular Chatwoot caído → verificar bot sigue respondiendo
```

Fallo en paso 3: `chatwootForward` no está persistiendo o `saveSession` no se llama después del forward.  
Fallo en paso 4: revisar Railway logs `chatwoot_forward_ok` / `chatwoot_forward_error`.  
Fallo en paso 5: AbortController timeout no está configurado correctamente.

---

## Rollback

Si el deploy falla o produce regresiones:

```bash
git revert HEAD  # o revert al commit anterior a feature/chatwoot-realtime
git push origin main
# Railway autodeploy restaura versión anterior
```

Impacto en datos:
- Sesiones en Redis con `chatwootConversationId` ya seteado: el campo es ignorado por el código anterior (no conoce ese campo). Sin efecto.
- Conversaciones ya creadas en Chatwoot: persisten. Sin efecto negativo.
- Gaps en conversaciones de Chatwoot durante el período del feature: ya están. No se pueden recuperar. Aceptable.

Tiempo de rollback estimado: < 3min (push + Railway autodeploy).
