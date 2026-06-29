# Tasks — kapso-broadcast

## Spec
- [x] proposal.md
- [ ] design.md
- [x] tasks.md

## Pre-implementación

- [ ] Confirmar endpoint exacto: `POST /platform/v1/whatsapp_broadcasts` vs `/meta/whatsapp/.../broadcasts`
- [ ] Confirmar si recipients aceptan phone sin country code o E.164
- [ ] Confirmar si SDK expone broadcasts o es REST directo con `KAPSO_API_KEY`

## Implementación

### scripts/broadcast.js (nuevo archivo)
- [ ] Parsear args: `--message`, `--phones` (CSV path o lista), `--schedule` (ISO datetime opcional)
- [ ] `POST /whatsapp_broadcasts` → obtener broadcast id
- [ ] `POST /:id/recipients` con phones en batches de 1000
- [ ] `POST /:id/send` (immediate si no hay `--schedule`, scheduled si hay)
- [ ] `GET /:id/recipients` → log: total, delivered, failed

## QA
- [ ] Script crea broadcast → visible en Kapso dashboard
- [ ] Destinatario recibe mensaje en WhatsApp
- [ ] Duplicados en lista → Kapso los deduplica (verificar con 2 entradas del mismo número)
- [ ] `--schedule` → mensaje llega en horario correcto

## Deploy
- [ ] Script no se sube a Railway — corre local con `node -r dotenv/config scripts/broadcast.js`
- [ ] Documentar en CLAUDE.md: `node -r dotenv/config scripts/broadcast.js --message "..." --phones phones.csv`
