# Tasks — whatsapp-media-outbound

## Prerequisito (Jack)

- [x] Preparar `temario-gh600.pdf` — committeado en repo, servido en GET /temario
- [x] Preparar imagen de testimonios — testimonio-gh600.jpg (Atlantic City case, 52KB)
- [x] Servida en GET /testimonios desde Railway

## Investigación (antes de codear)

- [x] `@kapso/whatsapp-cloud-api` tiene `messages.sendDocument({ document: { link, filename, caption } })`

## Implementación

- [x] `index.js`: agregar `sendDocument(to, link, filename, caption)`
- [x] `index.js`: agregar `sendImage(to, url, caption)`
- [x] `src/system-prompt.js`: agregar tool `send_material(type)` — type: "temario"
- [x] `src/agent.js`: agregar case `send_material` → sendDocument con URL de Railway
- [x] `server.js`: GET /temario sirve el PDF directamente

## QA

- [ ] Prospecto dice "dame el temario" → bot envía PDF del temario
- [ ] Prospecto dice "tienes testimonios?" → bot envía imagen de testimonios
- [x] URL inválida → bot responde con texto fallback en vez de crashear

## Deploy

- [ ] Agregar URLs como env vars en Railway: `MATERIAL_TEMARIO_URL`, `MATERIAL_TESTIMONIOS_URL`
- [ ] Redeploy
