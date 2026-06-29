# Design — message-batching

## Cambio en server.js

```js
// Debounce buffer: phone → { timer, messages[] }
const pendingMessages = new Map();
const DEBOUNCE_MS = 4000;

// Reemplaza el bloque del for (const event of events) loop:
async function processMessages(phone, messages, contactInfo) {
  const text = messages.join('\n');
  if (!text.trim()) return;
  try {
    const session = getSession(phone);
    if (session.completed) return;
    const reply = await runAgent(phone, text, contactInfo);
    if (reply) await sendText(phone, reply);
  } catch (err) {
    console.error(`[agent] ${phone}:`, err.message);
  }
}

// Dentro del loop de eventos:
for (const event of events) {
  const msg = event.message;
  if (!msg || msg.type !== 'text') continue;

  const phone = event.conversation?.phone_number;
  const text = msg.text?.body || '';
  const contactInfo = { contact_name: event.conversation?.kapso?.contact_name };
  if (!phone || !text.trim()) continue;

  // Debounce
  if (pendingMessages.has(phone)) {
    clearTimeout(pendingMessages.get(phone).timer);
    pendingMessages.get(phone).messages.push(text);
  } else {
    pendingMessages.set(phone, { messages: [text], contactInfo });
  }

  const pending = pendingMessages.get(phone);
  pending.timer = setTimeout(async () => {
    const { messages, contactInfo } = pendingMessages.get(phone);
    pendingMessages.delete(phone);
    await processMessages(phone, messages, contactInfo);
  }, DEBOUNCE_MS);
}
```

## Formato de mensajes concatenados a Claude

Si el usuario manda 3 mensajes, Claude recibe:
```
pensé que eras sofisticado
ni funnel tienes creo
jejejeje
```
Como un solo mensaje user. Claude entiende el contexto completo y responde una sola vez.

## Edge cases

- Si Kapso hace retry del mismo mensaje → message IDs distintos, podría procesarse dos veces. Mitigar con dedup por message ID (spec separado: fix-repeated-messages).
- Timer en memoria → si server reinicia, mensajes en buffer se pierden. Aceptable — en el peor caso se pierde el mensaje.

## Test determinista

1. Enviar 3 mensajes en menos de 4 segundos → bot responde UNA sola vez con respuesta coherente a los 3
2. Esperar 5 segundos entre mensajes → bot responde 2 veces (una por mensaje)
