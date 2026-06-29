# Tasks — typing-indicator

## Investigación (antes de codear)

- [x] Revisar `node_modules/@kapso/whatsapp-cloud-api/dist/` — `messages.markRead` con `typingIndicator: { type: 'text' }`
- [x] Documentar el endpoint exacto en design.md

## Implementación

- [x] `index.js`: agregar función `sendTyping(to, messageId)` — `whatsapp.messages.markRead` + typingIndicator
- [x] `server.js`: llamar `sendTyping(phone, lastMessageId)` ANTES de `runAgent()` (en `processMessages`)

## QA

- [ ] Enviar mensaje → en WhatsApp aparece "escribiendo..." durante 2-4 segundos → luego llega la respuesta

## Deploy

- [x] Redeploy en Railway (git push → autodeploy)
