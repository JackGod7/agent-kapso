# Tasks — jack-handoff-notification

## Setup

- [ ] Agregar `JACK_PHONE_NUMBER=51971388435` en Railway vars
- [ ] Agregar `JACK_PHONE_NUMBER=51971388435` en `.env` local

## Implementación

- [ ] `src/agent.js`: agregar `import { sendText } from '../index.js'`
- [ ] `src/agent.js` case `handoff_to_human`: leer `session.variables`, construir mensaje, llamar `sendText(jackPhone, notification)`
- [ ] Wrappear `sendText` en try/catch — si falla no debe romper el handoff

## QA

- [ ] Enviar "quiero hablar con Jack" → Jack recibe WhatsApp con datos del prospecto
- [ ] Verificar que mensaje incluye nombre y variables guardadas
- [ ] Simular fallo de sendText (JACK_PHONE_NUMBER vacío) → handoff igual completa, solo log de warning

## Deploy

- [ ] Redeploy en Railway con la nueva env var
