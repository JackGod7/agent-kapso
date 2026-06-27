# Tasks — chatwoot-kapso-architecture

## Setup Chatwoot (manual, una vez)

- [ ] Obtener URL y API token del Chatwoot en Railway (`neuracode-agent` project)
- [ ] Crear inbox tipo "API" en Chatwoot para este número WhatsApp
  - Settings → Inboxes → New Inbox → API
  - Nombre: "WhatsApp Kapso - GH600"
  - Guardar `inbox_id`
- [ ] Crear webhook en Chatwoot apuntando a `https://agent-kapso-production.up.railway.app/chatwoot-webhook`
  - Eventos: `message_created`, `conversation_status_changed`
- [ ] Agregar vars en Railway:
  - `CHATWOOT_BASE_URL`
  - `CHATWOOT_API_TOKEN`
  - `CHATWOOT_ACCOUNT_ID`
  - `CHATWOOT_INBOX_ID`

## Código

- [ ] Crear `src/chatwoot.js`:
  - `upsertContact(phone, name)` → contact_id
  - `upsertConversation(contact_id, phone)` → conversation_id
  - `postMessage(conversation_id, content, type)` type: incoming|outgoing
- [ ] Modificar `src/state.js`: agregar `humanMode: false` a session inicial
- [ ] Modificar `src/agent.js`: verificar `session.humanMode` antes de llamar Claude
- [ ] Modificar `server.js`:
  - En `/webhook`: llamar chatwoot.js para sincronizar mensaje + conversación
  - Nuevo endpoint `POST /chatwoot-webhook`: manejar takeover y replies humanos

## Test

- [ ] Enviar mensaje → verificar que aparece en Chatwoot
- [ ] Bot responde → verificar respuesta visible en Chatwoot
- [ ] Agente humano responde en Chatwoot → llega a WhatsApp + bot se silencia
- [ ] Conversación resuelta en Chatwoot → bot retoma
