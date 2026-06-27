# Proposal — typing-indicator

## Problema (confirmado en producción)

Jack Aguilar dijo explícitamente: "además no pareces humano porque no sale que estuvieras escriviendo por ejemplo".

WhatsApp muestra "escribiendo..." cuando alguien está escribiendo. El bot responde sin aviso previo — el mensaje aparece de la nada. Los humanos siempre tienen el indicador de escritura antes de enviar.

## Qué cambia

Antes de llamar `runAgent()` (que tarda 2-5 segundos), enviar el typing indicator de WhatsApp al usuario. Mientras Claude procesa, el usuario ve "escribiendo..." y sabe que algo está pasando.

## API

Kapso/Meta WhatsApp Cloud API tiene endpoint para typing indicator:
`POST /messages` con `{ "status": "read", "message_id": "..." }` para marcar como leído
Y para typing: depende de la API disponible en `@kapso/whatsapp-cloud-api`.

Si la librería no tiene typing indicator, usar directamente la Meta API:
```
POST https://api.kapso.ai/meta/whatsapp/v1/{phone-number-id}/messages
{ "type": "text", "recipient_type": "individual" ... }
```

Revisar qué expone `@kapso/whatsapp-cloud-api` antes de implementar.

## Por qué ahora

Feedback directo de Jack. Es UX pura, no afecta lógica. Alta percepción de humanidad por bajo costo de implementación.
