# Tasks — whatsapp-media-outbound

## Prerequisito (Jack)

- [ ] Preparar `temario-gh600.pdf` — temario oficial del bootcamp
- [ ] Preparar imagen de testimonios
- [ ] Subir a URL pública (Google Drive público, Notion, o S3) y guardar URLs

## Investigación (antes de codear)

- [ ] Verificar que `@kapso/whatsapp-cloud-api` tiene método para enviar documentos/imágenes
- [ ] Si no: probar directamente `POST /media` + `POST /messages` con type=document via Kapso API
- [ ] Documentar el método exacto en design.md

## Implementación

- [ ] `index.js`: agregar `sendDocument(to, url, filename, caption)` 
- [ ] `index.js`: agregar `sendImage(to, url, caption)`
- [ ] `src/system-prompt.js`: agregar tool `send_material(type)` con types: "temario", "testimonios", "brochure"
- [ ] `src/agent.js`: agregar case `send_material` → switch por type → llamar `sendDocument` o `sendImage`
- [ ] `src/system-prompt.js` SYSTEM_PROMPT: instrucción de cuándo usar `send_material` (cuando prospecto pide temario o evidencia)
- [ ] `src/agent.js`: hardcodear URLs en el case o en una constante de configuración

## QA

- [ ] Prospecto dice "dame el temario" → bot envía PDF del temario
- [ ] Prospecto dice "tienes testimonios?" → bot envía imagen de testimonios
- [ ] URL inválida → bot responde con texto fallback en vez de crashear

## Deploy

- [ ] Agregar URLs como env vars en Railway: `MATERIAL_TEMARIO_URL`, `MATERIAL_TESTIMONIOS_URL`
- [ ] Redeploy
