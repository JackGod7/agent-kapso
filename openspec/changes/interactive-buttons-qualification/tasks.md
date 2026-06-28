# Tasks — interactive-buttons-qualification

## Spec
- [x] proposal.md
- [x] design.md
- [x] tasks.md

## Implementación

### index.js
- [ ] Agregar `sendButtons(to, bodyText, buttons)` — `whatsapp.messages.sendInteractiveButtons`
- [ ] Export en la misma línea que `sendText`, `sendDocument`, etc.

### server.js
- [ ] Agregar `'interactive'` a `PROCESSABLE_TYPES`
- [ ] Extraer texto según tipo: `msg.type === 'interactive' ? msg.interactive?.button_reply?.title : msg.text?.body || msg.kapso?.content`

### src/system-prompt.js
- [ ] Agregar tool `ask_with_buttons` al array TOOLS (ver design.md para schema completo)
- [ ] Actualizar instrucción FASE 1: "Usa ask_with_buttons para las 3 preguntas de calificación"

### src/agent.js
- [ ] Agregar `sendButtons` al import de `../index.js`
- [ ] Agregar case `ask_with_buttons` en `executeTool`

## QA
- [ ] Bot envía pregunta 1 de calificación con 3 botones → visible en WhatsApp
- [ ] Prospectos toca botón → bot avanza a pregunta 2 (sin pedir aclaración)
- [ ] Prospecto escribe texto libre en vez de tocar botón → bot procesa igual
- [ ] 2 mensajes de texto enviados antes del botón (debounce) → se concatenan y procesan correctamente
- [ ] Botón con título > 20 chars → error claro en log, no crash

## Deploy
- [ ] `git push main` → Railway autodeploy
- [ ] Verificar logs: no errores de tool desconocido `ask_with_buttons`
