# Tasks — whatsapp-media-outbound

## Prerequisito (Jack)

- [x] Preparar `temario-gh600.pdf` — committeado en repo, servido en GET /temario
- [ ] Preparar imagen de testimonios
- [ ] Subir imagen a URL pública cuando esté lista

## Investigación (antes de codear)

- [x] `@kapso/whatsapp-cloud-api` tiene `messages.sendDocument({ document: { link, filename, caption } })`

## Implementación

- [x] `index.js`: agregar `sendDocument(to, link, filename, caption)`
- [ ] `index.js`: agregar `sendImage(to, url, caption)` — pendiente hasta tener imagen
- [x] `src/system-prompt.js`: agregar tool `send_material(type)` — type: "temario"
- [x] `src/agent.js`: agregar case `send_material` → sendDocument con URL de Railway
- [x] `server.js`: GET /temario sirve el PDF directamente

## QA

- [ ] Prospecto dice "dame el temario" → bot envía PDF del temario
- [ ] Prospecto dice "tienes testimonios?" → bot envía imagen de testimonios
- [ ] URL inválida → bot responde con texto fallback en vez de crashear

## Deploy

- [ ] Agregar URLs como env vars en Railway: `MATERIAL_TEMARIO_URL`, `MATERIAL_TESTIMONIOS_URL`
- [ ] Redeploy
