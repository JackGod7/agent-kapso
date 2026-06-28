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

- [x] Crear `src/chatwoot.js`: upsertContact, createConversation, postMessage
- [x] Modificar `src/agent.js`: handoff_to_human → llama Chatwoot API con historial
- [ ] Modificar `src/state.js`: agregar `humanMode: false` (YAGNI — pendiente si se necesita takeover)
- [ ] Modificar `server.js`: nuevo endpoint `POST /chatwoot-webhook` para takeover/replies humanos

## Vars Railway (agent-kapso production)

- [x] CHATWOOT_BASE_URL = https://chatwoot-production-76f4.up.railway.app
- [x] CHATWOOT_API_TOKEN = (seteado)
- [x] CHATWOOT_ACCOUNT_ID = 1
- [x] CHATWOOT_INBOX_ID = 2 (inbox "WhatsApp Kapso - GH600")

## Test

- [x] handoff_to_human → conversación creada en Chatwoot con historial ✅
- [x] Jack ve conversación en Chatwoot con historial completo ✅
- [ ] Agente humano responde en Chatwoot → llega a WhatsApp (requiere /chatwoot-webhook)
- [ ] Conversación resuelta en Chatwoot → bot retoma
