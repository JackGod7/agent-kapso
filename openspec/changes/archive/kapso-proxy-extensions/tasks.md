# Tasks — kapso-proxy-extensions

## Spec
- [x] proposal.md
- [x] design.md
- [x] tasks.md

## Pre-implementación

- [x] Verificar shape de `conversations.list` en SDK dist/index.js (campo phoneNumber ✓, waId para contacts ✓)
- [x] Verificar campos editables de `contacts.update` en SDK — metadata: { note } (no campo notes directo)
- [x] `kapsoApiKey` ya estaba en constructor — client ya era Proxy-capable

## Implementación

### index.js
- [x] `kapsoApiKey` ya en constructor `WhatsAppClient` — sin cambio
- [x] Exportar `saveContactNote(phone, note)` — usa `contacts.update({ metadata: { note } })`
- [x] Wrap con try/catch — falla → log warn, no crash

### src/system-prompt.js
- [x] Agregar tool `save_contact_note` al array TOOLS
- [x] Agregar instrucción: "SIEMPRE justo antes de handoff_to_human, llama save_contact_note"

### src/agent.js
- [x] Importar `saveContactNote` de `../index.js`
- [x] Agregar case `save_contact_note` en `executeTool`

## QA
- [ ] Claude llama `save_contact_note` antes de handoff → nota aparece en Kapso dashboard
- [ ] Si `KAPSO_API_KEY` undefined → log warn, no crash, flujo continúa

## Deploy
- [ ] `git push main` → Railway autodeploy
- [ ] Verificar logs: no errores de `assertKapsoProxy`

## Deploy
- [ ] `git push main` → Railway autodeploy
- [ ] Verificar logs: no errores de `assertKapsoProxy`
