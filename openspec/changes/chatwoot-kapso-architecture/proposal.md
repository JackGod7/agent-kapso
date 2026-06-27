# Propuesta — Arquitectura Chatwoot + Kapso + agent-kapso

## Por qué

El bot responde automáticamente pero no hay forma de que el equipo Neuracode vea las conversaciones, las tome, las califique o las asigne. Falta la capa de CRM/inbox humano.

## Contexto clave

- **Kapso** actúa como proxy de la Meta WhatsApp Business API — Neuracode no necesita registrar su propia app de Meta. Kapso ya maneja eso.
- **Chatwoot** ya está desplegado en Railway (proyecto `neuracode-agent`) pero no está conectado al número WhatsApp de este cliente.
- **Problema**: Chatwoot normalmente se conecta a WhatsApp via su propia integración con Meta. Pero el número ya está en Kapso. No pueden coexistir dos apps de Meta en el mismo número.

## Arquitectura propuesta

```
Usuario WhatsApp
    ↓
Meta WhatsApp API
    ↓
Kapso (proxy Meta, maneja el número)
    ↓ webhook: whatsapp.message.received
agent-kapso (Node.js en Railway)
    ↓ responde via Kapso API
    ↓ TAMBIÉN crea/actualiza conversación via Chatwoot API
        ↓
    Chatwoot (inbox del equipo Neuracode)
        ├─ Equipo ve mensajes entrantes y respuestas del bot
        ├─ Agente humano puede "tomar" la conversación
        ├─ Al tomar → webhook de Chatwoot → agent-kapso detiene respuestas automáticas
        ├─ Humano responde en Chatwoot → Chatwoot webhook → agent-kapso envía via Kapso API
        └─ Etiquetas / calificación / asignación en Chatwoot
```

## Alternativa descartada: Kapso Inbox Embed

Kapso tiene `POST /platform/v1/inbox_embeds` para embeber su propio inbox en una app externa. Descartado porque Chatwoot ya existe, tiene más features (asignación, etiquetas, CSAT) y el equipo ya lo usa.

## Alternativa descartada: Chatwoot conectado directo a Meta

Chatwoot puede integrarse con WhatsApp Cloud API directo, pero requeriría mover el número de WhatsApp fuera de Kapso — perdemos las ventajas de Kapso (proxy, templates, analytics).

## Qué cambia

1. **agent-kapso**: al recibir mensaje → crear/buscar conversación en Chatwoot API + postear mensaje de usuario
2. **agent-kapso**: al enviar respuesta del bot → postear también en Chatwoot como mensaje del bot
3. **agent-kapso**: nuevo endpoint `POST /chatwoot-webhook` para recibir eventos de Chatwoot (human takeover, human reply)
4. **Chatwoot**: configurar webhook apuntando a agent-kapso para eventos `conversation_status_changed` y `message_created` (outbound humano)
5. **agent-kapso**: lógica de "modo humano" — cuando un agente toma la conversación, el bot se silencia

## Variables de entorno nuevas

| Variable | Descripción |
|---|---|
| `CHATWOOT_BASE_URL` | URL del Chatwoot en Railway |
| `CHATWOOT_API_TOKEN` | API token de Chatwoot (user token) |
| `CHATWOOT_ACCOUNT_ID` | ID de la cuenta en Chatwoot |
| `CHATWOOT_INBOX_ID` | ID del inbox creado para este número WhatsApp |
