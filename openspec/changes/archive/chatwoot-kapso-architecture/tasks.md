# Tasks — chatwoot-kapso-architecture

## Setup Chatwoot (manual, una vez)

- [x] Obtener URL y API token del Chatwoot en Railway (`neuracode-agent` project)
- [x] Crear inbox tipo "API" en Chatwoot para este número WhatsApp
  - Settings → Inboxes → New Inbox → API
  - Nombre: "WhatsApp Kapso - GH600"
  - `inbox_id` = 2
- [x] Crear webhook en Chatwoot apuntando a `https://agent-kapso-production.up.railway.app/chatwoot-webhook`
  - Eventos: `message_created`, `conversation_status_changed`
- [x] Agregar vars en Railway:
  - `CHATWOOT_BASE_URL` ✅
  - `CHATWOOT_API_TOKEN` ✅
  - `CHATWOOT_ACCOUNT_ID` ✅
  - `CHATWOOT_INBOX_ID` ✅

## Código

- [x] Crear `src/chatwoot.js`: upsertContact, createConversation, postMessage
- [x] Modificar `src/agent.js`: handoff_to_human → llama Chatwoot API con historial
- [x] Modificar `src/state.js`: agregar `humanMode: false` + `setHumanMode()` + export `sessions`
- [x] Modificar `server.js`: nuevo endpoint `POST /chatwoot-webhook` para takeover/replies humanos

## Vars Railway (agent-kapso production)

- [x] CHATWOOT_BASE_URL = https://chatwoot-production-76f4.up.railway.app
- [x] CHATWOOT_API_TOKEN = (seteado)
- [x] CHATWOOT_ACCOUNT_ID = 1
- [x] CHATWOOT_INBOX_ID = 2 (inbox "WhatsApp Kapso - GH600")

## Railway Migration

- [x] Mover servicio `agent-kapso` al proyecto `neuracode-agent` en Railway (donde vive Chatwoot)
  - Simplifica vars compartidas (CHATWOOT_BASE_URL interna)
  - Requiere actualizar RAILWAY_TOKEN en GitHub Secrets si cambia proyecto

## Test

- [x] handoff_to_human → conversación creada en Chatwoot con historial ✅
- [x] Jack ve conversación en Chatwoot con historial completo ✅
- [ ] Agente humano responde en Chatwoot → llega a WhatsApp ← configurar webhook en Chatwoot admin
- [ ] Conversación resuelta en Chatwoot → bot retoma ← idem
