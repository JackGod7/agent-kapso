# Agent Kapso — CLAUDE.md

Bot de ventas por WhatsApp para el bootcamp GH-600 de Jack Aguilar.
Desplegado en Railway. Recibe mensajes vía Kapso webhook → Claude → respuesta por WhatsApp.

## Archivos que importan

```
server.js          — HTTP server, recibe webhook de Kapso, orquesta todo
index.js           — WhatsApp client (sendText via @kapso/whatsapp-cloud-api)
src/agent.js       — Claude agent loop, executeTool(), tool handling
src/state.js       — Session store (in-memory, migrar a Redis)
src/system-prompt.js — SYSTEM_PROMPT y TOOLS exportados a agent.js
```

## Archivos que NO corren en producción

```
.agents/skills/    — Scripts de CLI para observar/operar Kapso API (ops/debug only)
scripts/           — Scripts de ops locales (broadcast, etc.)
openspec/          — Specs de features/bugs (documentación)
```

## Variables de entorno requeridas

```
KAPSO_API_BASE_URL=https://api.kapso.ai
KAPSO_API_KEY=...
KAPSO_PHONE_NUMBER_ID=...
ANTHROPIC_API_KEY=...
KAPSO_WEBHOOK_SECRET=   (opcional, skip si vacío)
JACK_PHONE_NUMBER=      (para notificación de handoff)
REDIS_URL=              (para persistencia, opcional en dev)
```

## Deploy

Railway. `npm start` = `node server.js`.

Redeploy manual: push a main → Railway autodeploy.
O via CLI: `railway up` desde este directorio.

## Flujo principal

```
WhatsApp msg → Kapso → POST /webhook → server.js
  → filtro: solo type=text, session no completed
  → runAgent(phone, text, contactInfo)  [src/agent.js]
    → Claude API con SYSTEM_PROMPT + TOOLS + history window (últimos 20)
    → tool loop hasta end_turn
  → sendText(phone, reply)              [index.js]
```

## Convenciones

- Todo el código es ESModules (`"type": "module"` en package.json)
- Sin TypeScript — JS plano
- `src/state.js` exporta `getSession(phone)` — async, usa Redis/Valkey en prod (ioredis)
- Tools de Claude: nunca añadir sin spec en openspec/changes/

## Specs activos

Ver `openspec/ARCHITECTURE.md` para backlog completo.
Ver `openspec/changes/*/tasks.md` para tareas pendientes por feature.

## Broadcast (retargeting leads)

```bash
# Enviar mensaje a lista de leads
node -r dotenv/config scripts/broadcast.js --message "Hola, última semana para el GH-600..." --phones phones.csv

# Programado (ISO datetime)
node -r dotenv/config scripts/broadcast.js --message "..." --phones phones.csv --schedule 2026-07-01T10:00:00Z

# Ver estado de entrega
node -r dotenv/config scripts/broadcast.js --status <broadcast_id>
```

`phones.csv` — un número por línea, E.164 (ej: 51999123456). Duplicados → Kapso los deduplica.

⚠️  Endpoint `/platform/v1/whatsapp_broadcasts` — confirmar en primer uso, puede variar.

## Observar conversaciones en producción

```bash
node -r dotenv/config .agents/skills/observe-whatsapp/scripts/lookup-conversation.js --phone-number-id REDACTED_PHONE_NUMBER_ID --limit 20

node -r dotenv/config .agents/skills/observe-whatsapp/scripts/messages.js --conversation-id <uuid> --limit 100
```

## Git

- Rama principal: `main`
- Cada change de openspec va en su propia rama: `feature/<change-name>`
- PRs a main → merge → Railway autodeploy
