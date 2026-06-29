# Design — Chatwoot Real-Time Forwarding

## Arquitectura

```
WhatsApp msg → server.js processMessages
  → chatwootForward(incoming)          ← NUEVO
  → runAgent()
    → Claude tool loop
  → chatwootForward(outgoing)          ← NUEVO
  → sendText()

handoff_to_human / complete_task / 24h expiry
  → archiveToChatwoot() (actualizada)
    → si session.chatwootConversationId existe → updateConversation(status, label)
    → si no existe → crear conv + replay history (backward compat)
```

## Cambios por archivo

### `src/chatwoot.js`

#### Nueva función: `ensureChatwootConversation(phone, session, contactInfo)`

Crea el contacto y la conversación en Chatwoot si no existen. Guarda el ID en `session.chatwootConversationId`. Idempotente.

```js
export async function ensureChatwootConversation(phone, session, contactInfo) {
  if (session.chatwootConversationId) return session.chatwootConversationId;
  const name = session.variables['nombre'] || session.variables['name']
    || contactInfo?.contact_name || phone;
  const contactId = await upsertContact(phone, name);
  if (!contactId) throw new Error('upsertContact returned undefined');
  const conversationId = await createConversation(contactId);
  session.chatwootConversationId = conversationId;
  return conversationId;
}
```

#### Nueva función: `chatwootForward(phone, session, text, direction, contactInfo)`

Non-blocking. Llama `ensureChatwootConversation`, luego `postMessage`. Nunca lanza.

```js
export async function chatwootForward(phone, session, text, direction, contactInfo) {
  try {
    const conversationId = await ensureChatwootConversation(phone, session, contactInfo);
    await postMessage(conversationId, text, direction);
  } catch (err) {
    console.error(`[CHATWOOT-RT] forward failed (${direction}): ${err.message}`);
  }
}
```

#### `updateConversationStatus(conversationId, status, label)` (nueva)

```js
export async function updateConversationStatus(conversationId, status, label) {
  await req(`/conversations/${conversationId}`, 'PATCH', { status });
  if (label) {
    await req(`/conversations/${conversationId}/labels`, 'POST', { labels: [label] });
  }
}
```

#### `archiveToChatwoot` actualizada (idempotente)

```js
export async function archiveToChatwoot(phone, session, label, contactInfo) {
  try {
    let conversationId = session.chatwootConversationId;

    if (conversationId) {
      // Real-time ya posteó mensajes — solo actualizar status y label
      const status = label.startsWith('HANDOFF') ? 'open' : 'resolved';
      await updateConversationStatus(conversationId, status, label);
    } else {
      // Fallback: sesión sin real-time (backward compat) — replay history
      const name = session.variables['nombre'] || session.variables['name']
        || contactInfo?.contact_name || phone;
      const contactId = await upsertContact(phone, name);
      if (!contactId) throw new Error('upsertContact returned undefined');
      conversationId = await createConversation(contactId);
      const messages = session.history
        .map(msg => ({ text: extractText(msg.content), dir: msg.role === 'user' ? 'incoming' : 'outgoing' }))
        .filter(m => m.text);
      await Promise.all(messages.map(m => postMessage(conversationId, m.text, m.dir)));
      const status = label.startsWith('HANDOFF') ? 'open' : 'resolved';
      await updateConversationStatus(conversationId, status, label);
    }

    console.log(`[CHATWOOT] ${phone} → conversation ${conversationId} (${label})`);
  } catch (err) {
    console.error(`[CHATWOOT] archive failed (${label}): ${err.message}`);
  }
}
```

> Nota: `extractText` se mueve de `agent.js` a `chatwoot.js` (o se exporta desde `agent.js`).

### `server.js`

#### `processMessages` — agregar forward antes y después de `runAgent`

```js
async function processMessages(phone, messages, contactInfo, lastMessageId) {
  const text = messages.join('\n');
  if (!text.trim()) return;

  const session = await getSession(phone);

  if (session.humanMode) { ... return; }

  try {
    if (session.completed) { ... } // 24h expiry logic sin cambio

    if (lastMessageId) await sendTyping(phone, lastMessageId).catch(() => {});

    // Forward mensaje entrante a Chatwoot en tiempo real
    await chatwootForward(phone, session, text, 'incoming', contactInfo);
    await saveSession(phone, session); // persistir chatwootConversationId si se creó

    const prevReply = session.lastReply;
    const reply = await runAgent(phone, text, contactInfo);

    if (reply && reply.trim() !== prevReply?.trim()) {
      // Forward respuesta del bot a Chatwoot en tiempo real
      await chatwootForward(phone, session, reply, 'outgoing', contactInfo);
      await sendText(phone, reply);
    }
  } catch (err) {
    console.error(`[agent] ${phone}:`, err.message);
    webhookErrors++;
  }
}
```

> Nota: `chatwootForward` ya guarda el conversationId en session. `saveSession` después del forward persiste ese ID a Redis, de modo que si el proceso reinicia entre mensajes, la siguiente conversación continúa en la misma Chatwoot conversation.

### `src/agent.js`

- `archiveToChatwoot` se mueve a `src/chatwoot.js` (único módulo de Chatwoot)
- `agent.js` importa `archiveToChatwoot` de `../src/chatwoot.js` en lugar de definirla localmente
- `extractText` también se mueve a `src/chatwoot.js` (es una utilidad de serialización de mensajes)

## Session schema (adición)

```js
// session object (src/state.js) — nuevo campo
{
  history: [...],
  variables: {},
  completed: false,
  completedAt: null,
  lastReply: null,
  totalTokens: 0,
  source: 'organic',
  humanMode: false,
  chatwootConversationId: null,  // ← NUEVO: número entero o null
}
```

Redis key: `s:<phone>` — mismo formato, campo adicional. Backward compat: sesiones sin el campo → `null` → `chatwootForward` lo crea al primer mensaje.

## Flujo completo — happy path

```
1. Lead escribe "Hola vi el GH-600"
   → chatwootForward(incoming)
     → upsertContact(+51...) → contactId=9
     → createConversation(9) → conversationId=21
     → session.chatwootConversationId = 21
     → postMessage(21, "Hola vi el GH-600", incoming)
   → saveSession → Redis persiste chatwootConversationId=21
   → runAgent → bot responde
   → chatwootForward(outgoing)
     → ensureChatwootConversation → 21 ya existe → skip
     → postMessage(21, "¡Hola! ...", outgoing)
   → sendText → WhatsApp

2. (N mensajes más — mismo flujo, conversationId=21 reutilizado)

3. Lead pregunta precio
   → runAgent → handoff_to_human("Prospecto pregunta precio")
     → archiveToChatwoot(phone, session, "HANDOFF: ...", contactInfo)
       → session.chatwootConversationId = 21 → existe
       → updateConversationStatus(21, 'open', 'HANDOFF: Prospecto pregunta precio')
     → Jack notificado por WhatsApp
```

## Flujo — bot falla a mitad de conversación

```
1. Mensajes 1-5 forwardeados en tiempo real → Chatwoot tiene 5 mensajes
2. Bot falla en mensaje 6 (Railway caída, error Claude)
3. Lead abre Chatwoot → ve conversación con 5 mensajes hasta el momento del fallo
4. Jack puede continuar manualmente desde ahí
```

## Consideraciones de performance

- `chatwootForward` es secuencial respecto al flujo: se ejecuta antes/después de `runAgent`, no en paralelo. Esto agrega ~100-300ms por mensaje (una llamada HTTP a Chatwoot).
- Si Chatwoot está caído: el `try/catch` absorbe el error en <5s (timeout de fetch), el bot sigue respondiendo.
- Para reducir latencia: `chatwootForward(incoming)` y el resto del flujo podrían correr en paralelo (fire-and-forget el forward). Evaluarlo si se mide impacto.

## Consideraciones de consistencia

- **doble posteo**: si `runAgent` falla después de `chatwootForward(incoming)`, el mensaje queda en Chatwoot pero sin respuesta del bot. Correcto — es lo que pasó en realidad.
- **session.chatwootConversationId sin persistir**: si `saveSession` falla después de `ensureChatwootConversation`, el ID se pierde → próximo mensaje crea otra conversación de Chatwoot. Riesgo bajo pero real. Mitigación: `saveSession` ya es idempotente y el impacto es duplicar conversaciones en Chatwoot (visible pero no catastrófico).
- **resetSession / 24h expiry**: `resetSession` borra el campo → próxima sesión crea nueva conversación en Chatwoot. Correcto.

## Test determinístico

```
1. Resetear sesión de TEST_PHONE en Redis
2. Enviar webhook: "Hola test realtime"
3. Esperar 5s
4. GET Chatwoot contacts/search?q=TEST_PHONE → encontrar contacto
5. GET Chatwoot contacts/:id/conversations → encontrar conversación
6. GET Chatwoot conversations/:id/messages → assert mensaje incoming existe
7. Enviar webhook: "segundo mensaje"
8. Esperar 5s
9. GET messages → assert 4 mensajes (2 user + 2 bot)
10. assert session.chatwootConversationId === conversationId en Redis
```

Fallo del test = `chatwootForward` no está llamando correctamente, o `saveSession` no persistió el ID.
