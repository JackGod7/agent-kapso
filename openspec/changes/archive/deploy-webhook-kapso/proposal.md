# Deploy Webhook — Agent Kapso GH-600

## Por qué
El agente de ventas WhatsApp está construido localmente pero necesita una URL pública para que Kapso pueda enviarle eventos `whatsapp.message.received`.

## Qué cambia
- Desplegar `server.js` en un hosting con URL pública persistente (Railway recomendado — tiene MCP integrado en este entorno)
- Registrar el webhook en Kapso apuntando a esa URL
- Verificar end-to-end: mensaje WhatsApp → Kapso → servidor → Claude → respuesta automática

## Alternativas descartadas
- **ngrok**: URL temporal, muere al cerrar terminal — no sirve para producción
- **localhost**: sin acceso externo — solo sirve para testing con `node scripts/test.js`
