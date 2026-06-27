# Tasks — deploy-webhook-kapso

## Deploy

- [ ] Elegir plataforma: Railway (recomendado, tiene MCP aquí) o Render/Fly.io
- [ ] Crear servicio en Railway y conectar este repo (o deploy manual)
- [ ] Configurar variables de entorno en Railway:
  - `KAPSO_API_KEY`
  - `KAPSO_PHONE_NUMBER_ID`
  - `ANTHROPIC_API_KEY`
  - `KAPSO_WEBHOOK_SECRET` (generar uno aleatorio)
  - `PORT` (Railway lo inyecta automáticamente)
- [ ] Obtener URL pública del servicio (ej: `https://agent-kapso.up.railway.app`)

## Webhook Kapso

- [ ] Registrar webhook phone-number en Kapso:
  ```bash
  node .agents/skills/integrate-whatsapp/scripts/create.js \
    --phone-number-id 1073310892521655 \
    --url https://<tu-url>/webhook \
    --events whatsapp.message.received \
    --payload-version v2
  ```
- [ ] Guardar el `webhook_secret` que devuelve y agregarlo a Railway como `KAPSO_WEBHOOK_SECRET`
- [ ] Verificar entrega: `node .agents/skills/integrate-whatsapp/scripts/test.js --webhook-id <id>`

## Test end-to-end

- [ ] Enviar mensaje WhatsApp al número +51 982 859 073
- [ ] Verificar respuesta automática del agente
- [ ] Revisar logs en Railway para confirmar flujo: recibido → Claude → enviado
