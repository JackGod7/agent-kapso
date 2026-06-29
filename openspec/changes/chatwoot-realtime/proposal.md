# Chatwoot Real-Time Forwarding

## Por qué

### El problema hoy

Chatwoot solo recibe una conversación cuando el bot llama `handoff_to_human`, `complete_task`, o expira la sesión (24h). Eso significa:

- **Un lead que está hablando ahora mismo con el bot es invisible en Chatwoot.**
- Jack no puede ver si un lead lleva 10 minutos sin respuesta, quedó trabado, o está listo para cerrar.
- Si el bot falla (error de herramienta, Claude loop, caída de Railway), la conversación se pierde — no hay rastro en Chatwoot.
- El equipo de ventas no puede intervenir en tiempo real aunque quiera.

### El impacto

En un funnel de ventas, el tiempo de respuesta humana en el momento correcto cierra más que cualquier script. Hoy ese momento es invisible.

### Qué ganamos con real-time

| Antes | Después |
|-------|---------|
| Conversación visible solo al final | Visible desde el primer mensaje |
| Jack no puede intervenir mid-conversation | Jack puede ver y tomar control en cualquier momento |
| Error del bot → conversación perdida | Error del bot → conversación en Chatwoot hasta ese punto |
| Chatwoot archival solo en happy path | Toda conversación en Chatwoot, sin excepción |

## Qué cambia

1. **`session.chatwootConversationId`** — nuevo campo en session. Se crea en el primer mensaje y se persiste en Redis. Idempotente: si ya existe, se reutiliza.

2. **`chatwootForward(phone, session, text, direction, contactInfo)`** — nueva función en `src/chatwoot.js`. Crea la conversación si no existe, postea el mensaje, nunca bloquea el flujo principal.

3. **`processMessages` en server.js** — llama `chatwootForward` para el mensaje entrante del usuario ANTES de `runAgent`, y para la respuesta del bot DESPUÉS.

4. **`archiveToChatwoot` actualizada** — si `session.chatwootConversationId` ya existe, no crea conversación nueva. Solo agrega label y cambia status según el trigger (handoff → `open`, complete_task → `resolved`, 24h → `resolved`).

5. **Chatwoot conversation status lifecycle**:
   - Creación → `pending`
   - Handoff → `open` (asignado, Jack notificado)
   - complete_task / 24h expiry → `resolved`

## Qué NO cambia

- La lógica del agente Claude (`runAgent`, `executeTool`) no cambia.
- `archiveToChatwoot` sigue existiendo — ahora es idempotente con el real-time.
- Redis/Valkey: solo se agrega un campo nuevo (`chatwootConversationId`) a la session existente.
- No se agrega infraestructura nueva.
- Errores de Chatwoot siguen siendo no-fatales: el bot opera aunque Chatwoot esté caído.

## Qué NO hacemos (decisiones explícitas)

- **No real-time para tool calls internos** — solo mensajes user/bot visibles. Las llamadas a herramientas (save_variable, etc.) no se postean a Chatwoot — son ruido interno.
- **No webhook bidireccional al revés aquí** — el `/chatwoot-webhook` ya existe. Esta feature es solo del bot → Chatwoot, no de Chatwoot → bot.
- **No threading por conversación** — una sesión de bot = una conversación de Chatwoot. Si la sesión se resetea, se crea una nueva conversación.
