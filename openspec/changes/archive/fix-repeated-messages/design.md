# Design — fix-repeated-messages

## Enfoque: last-reply dedup en state

Guardar el último texto enviado en session. Antes de enviar, comparar.

### Cambio en src/state.js

```js
sessions.set(phone, {
  phase: 'nuevo',
  variables: {},
  history: [],
  waiting: false,
  completed: false,
  lastReply: null,   // nuevo campo
});
```

### Cambio en server.js

```js
const reply = await runAgent(phone, text, contactInfo);
if (reply) {
  const session = getSession(phone);
  if (reply.trim() === session.lastReply?.trim()) {
    console.log(`[dedup] ${phone}: skipped duplicate reply`);
  } else {
    session.lastReply = reply;
    await sendText(phone, reply);
  }
}
```

## Nota

Esto es safety net — no cubre variaciones semánticas ("Lo tomo, sin excusas" vs "Lo tomo, sin excusas. Gracias."). La solución real es eliminar `enter_waiting` (v2).

## Test determinista

1. Simular agent que llama `enter_waiting` → verificar que solo se envía 1 mensaje
2. Enviar dos mensajes distintos → verificar que ambos se envían
