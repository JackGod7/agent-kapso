# Tasks — jack-handoff-notification

## Setup

- [x] Agregar `JACK_PHONE_NUMBER=51982859073` en Railway vars
- [x] Agregar `JACK_PHONE_NUMBER=51982859073` en `.env` local

## Implementación

- [x] `src/agent.js`: agregar `import { sendText } from '../index.js'`
- [x] `src/agent.js` case `handoff_to_human`: leer `session.variables`, construir mensaje, llamar `sendText(jackPhone, notification)`
- [x] Wrappear `sendText` en try/catch — si falla no debe romper el handoff

## QA

- [ ] Enviar "quiero hablar con Jack" → Jack recibe WhatsApp con datos del prospecto
- [ ] Verificar que mensaje incluye nombre y variables guardadas
- [ ] Simular fallo de sendText (JACK_PHONE_NUMBER vacío) → handoff igual completa, solo log de warning

## Deploy

- [x] Redeploy en Railway con la nueva env var
