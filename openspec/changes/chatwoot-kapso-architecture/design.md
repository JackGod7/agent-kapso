# Design — chatwoot-kapso-architecture

## Flujo completo

### Mensaje entrante (usuario → bot)
```
1. Usuario envía mensaje a WhatsApp
2. Meta → Kapso → POST /webhook (agent-kapso)
3. agent-kapso verifica firma HMAC
4. chatwoot.js: upsert contacto en Chatwoot (por phone)
5. chatwoot.js: upsert conversación (por phone + inbox_id)
6. chatwoot.js: crear mensaje entrante en Chatwoot
7. ¿session.humanMode? → si sí, no llama a Claude, termina
8. runAgent(phone, text) → Claude → respuesta
9. sendText(phone, reply) → Kapso API → WhatsApp
10. chatwoot.js: crear mensaje saliente en Chatwoot (como bot)
```

### Takeover humano
```
1. Agente en Chatwoot abre conversación y escribe
2. Chatwoot → POST /chatwoot-webhook (agent-kapso)
   evento: message_created, message_type: outgoing, from: human agent
3. agent-kapso: session.humanMode = true
4. agent-kapso: sendText(phone, humanMessage) → Kapso API → WhatsApp
   (Chatwoot ya lo tiene, solo falta enviarlo por WhatsApp)
```

### Devolución al bot
```
1. Agente en Chatwoot cambia estado a "resolved" o usa un label "bot"
2. Chatwoot → POST /chatwoot-webhook
   evento: conversation_status_changed, status: resolved
3. agent-kapso: session.humanMode = false
4. Bot retoma automáticamente
```

## Archivos nuevos / modificados

| Archivo | Cambio |
|---------|--------|
| `src/chatwoot.js` | Cliente Chatwoot: upsert contact, conversation, message |
| `src/state.js` | Agregar campo `humanMode: boolean` a session |
| `server.js` | Nuevo endpoint `POST /chatwoot-webhook` |
| `src/agent.js` | Verificar `session.humanMode` antes de llamar Claude |
| `.env` | 4 variables nuevas de Chatwoot |

## API Chatwoot usada

```
POST /api/v1/accounts/{account_id}/contacts          # crear/buscar contacto
GET  /api/v1/accounts/{account_id}/contacts/search   # buscar por phone
POST /api/v1/accounts/{account_id}/conversations     # crear conversación
GET  /api/v1/accounts/{account_id}/conversations     # buscar por phone
POST /api/v1/accounts/{account_id}/conversations/{id}/messages  # crear mensaje
```

Auth: `api_access_token: <CHATWOOT_API_TOKEN>` en header.

## src/chatwoot.js — estructura

```js
// upsertContact(phone, name) → contact_id
// upsertConversation(contact_id, phone) → conversation_id
// postMessage(conversation_id, content, type) // type: 'incoming' | 'outgoing'
// getHumanMode(phone) → bool (via conversation assignee)
```

## Estado humanMode

Almacenado en `session.humanMode`. Se activa cuando:
- Chatwoot webhook `message_created` con `message_type: outgoing` y `created_at` de un agente humano (no bot)

Se desactiva cuando:
- Chatwoot webhook `conversation_status_changed` con `status: resolved` o `status: open` sin asignado

## Chatwoot inbox setup (manual, una vez)

1. En Chatwoot: Settings → Inboxes → New Inbox → API (no WhatsApp directo)
2. Nombre: "WhatsApp Kapso - [cliente]"
3. Guardar `inbox_id` → Railway env var `CHATWOOT_INBOX_ID`
4. En Chatwoot: Settings → Integrations → Webhooks → agregar URL de agent-kapso `/chatwoot-webhook`
   - Eventos: `message_created`, `conversation_status_changed`
