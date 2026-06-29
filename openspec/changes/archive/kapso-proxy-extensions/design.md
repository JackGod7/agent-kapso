# Design — kapso-proxy-extensions

## Cambio en index.js

```js
const whatsapp = new WhatsAppClient({
  phoneNumberId: PHONE_NUMBER_ID,
  accessToken: process.env.KAPSO_ACCESS_TOKEN,
  kapsoApiKey: process.env.KAPSO_API_KEY,  // habilita Proxy Extensions
});

export async function getContact(phone) {
  const convs = await whatsapp.conversations.list({ phoneNumber: phone, limit: 1 });
  if (!convs.data?.[0]) return null;
  return whatsapp.contacts.get(convs.data[0].contact_id);
}

export async function updateContact(phone, fields) {
  const contact = await getContact(phone);
  if (!contact) return;
  return whatsapp.contacts.update(contact.id, fields);
}

export async function getConversationHistory(phone, limit = 20) {
  const convs = await whatsapp.conversations.list({ phoneNumber: phone, limit: 1 });
  if (!convs.data?.[0]) return [];
  return whatsapp.messages.listByConversation(convs.data[0].id, { limit });
}

export async function resolveConversation(conversationId) {
  return whatsapp.conversations.updateStatus(conversationId, 'resolved');
}
```

## Tool para Claude — save_contact_note

En `src/system-prompt.js`:

```js
{
  name: 'save_contact_note',
  description: 'Guarda una nota del prospecto en Kapso visible en el dashboard. Úsala al hacer handoff con Jack.',
  input_schema: {
    type: 'object',
    properties: {
      note: { type: 'string', description: 'Resumen del prospecto: interés, objeciones, estado.' }
    },
    required: ['note']
  }
}
```

En `src/agent.js` → `executeTool`:

```js
case 'save_contact_note': {
  const { updateContact } = await import('../index.js');
  await updateContact(phone, { notes: input.note });
  return { ok: true };
}
```

## Notas de implementación

- `conversations.list({ phoneNumber })` — el SDK filtra por número; confirmar campo exacto contra SDK dist/index.js
- `contacts.update` — campos disponibles: verificar shape en SDK antes de usar
- Si `KAPSO_API_KEY` está vacío → `assertKapsoProxy()` en SDK lanza error → envolver en try/catch, log warn, continuar sin Proxy
- No bloquear el flujo principal si Proxy Extension falla — es enrichment, no crítico
