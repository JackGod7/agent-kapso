# Tasks — typing-indicator

## Investigación (antes de codear)

- [ ] Revisar `node_modules/@kapso/whatsapp-cloud-api/dist/` — ¿hay método para typing/status?
- [ ] Si no existe: ver si Kapso API expone endpoint directo para typing indicator
- [ ] Documentar el endpoint exacto en design.md

## Implementación

- [ ] `index.js`: agregar función `sendTyping(to)` que llama el endpoint correcto
- [ ] `server.js`: llamar `sendTyping(phone)` ANTES de `runAgent()` (en `processMessages`)

## QA

- [ ] Enviar mensaje → en WhatsApp aparece "escribiendo..." durante 2-4 segundos → luego llega la respuesta

## Deploy

- [ ] Redeploy en Railway
