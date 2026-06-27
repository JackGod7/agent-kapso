# Design — deploy-webhook-kapso

## Flujo completo

```
Usuario WhatsApp
    ↓ mensaje
Kapso (phone_number_id: REDACTED_PHONE_NUMBER_ID)
    ↓ POST /webhook  (X-Webhook-Event: whatsapp.message.received)
server.js (Railway)
    ↓ verifica firma HMAC-SHA256
    ↓ extrae: phone = conversation.phone_number, text = message.text.body
src/agent.js
    ↓ Claude claude-opus-4-8 con tools
    ↓ loop tool_use hasta end_turn
index.js → sendText(phone, reply)
    ↓
Kapso SDK → WhatsApp → Usuario
```

## Estado del agente (in-memory)

```js
sessions[phone] = {
  phase: 'nuevo' | 'info' | 'precio' | 'objecion',
  variables: { nombre, experiencia, objetivo, ... },
  history: [...messages],  // pasado completo a Claude
  waiting: boolean,
  completed: boolean,
}
```

**Limitación**: se pierde al reiniciar el proceso. Para persistencia agregar Redis.

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `server.js` | Express webhook, verifica firma, despacha al agente |
| `src/agent.js` | Loop Claude con tool_use |
| `src/system-prompt.js` | Prompt + definición de herramientas |
| `src/state.js` | Sesiones en memoria |
| `index.js` | WhatsAppClient (Kapso SDK) + sendText() |

## Variables de entorno requeridas

| Variable | Valor |
|----------|-------|
| `KAPSO_API_KEY` | `REDACTED_KAPSO_API_KEY` |
| `KAPSO_PHONE_NUMBER_ID` | `REDACTED_PHONE_NUMBER_ID` |
| `ANTHROPIC_API_KEY` | `REDACTED_ANTHROPIC_KEY` |
| `KAPSO_WEBHOOK_SECRET` | generado al crear webhook en Kapso |
| `PORT` | Railway lo inyecta |
