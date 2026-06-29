# Proposal — kapso-proxy-extensions

## Problema

El SDK `@kapso/whatsapp-cloud-api` ya expone `client.conversations`, `client.messages.query`, y `client.contacts` — pero agent-kapso nunca inicializó el cliente con `kapsoApiKey`, así que esas rutas nunca se usan.

Hoy, el bot:
- No puede leer historial de conversación de Kapso (usa solo in-memory session)
- No puede actualizar datos de contacto en Kapso (nombre, notas, estado)
- No puede marcar una conversación como resuelta desde código
- No puede buscar mensajes pasados de un prospecto

Todo esto bloquea features de valor: contexto cross-session, notas post-handoff, resumen de lead en Kapso dashboard.

## Qué cambia

1. `index.js` — inicializar `WhatsAppClient` con `kapsoApiKey: process.env.KAPSO_API_KEY` (ya existe la env var)
2. Exponer helpers de Proxy Extensions:
   - `getContact(phone)` → datos del contacto en Kapso
   - `updateContact(phone, fields)` → actualizar nombre/notas/metadata
   - `getConversationHistory(phone, limit)` → mensajes pasados (cross-session)
   - `resolveConversation(conversationId)` → marcar como resuelta
3. `src/agent.js` — nueva tool `save_contact_note(note)` que Claude llama al hacer handoff

## Por qué ahora

- 0 infra adicional — todo en SDK instalado
- Desbloquea: contexto cross-session real, notas de lead visible en Kapso dashboard, handoff con contexto
- Costo: ~1h implementación

## Fuera de scope

- Migrar session store a Kapso (seguir usando Redis para estado runtime)
- Leer historial completo para contexto de Claude — el history window de 20 msgs es suficiente
- Crear conversaciones desde código — solo leer + actualizar
