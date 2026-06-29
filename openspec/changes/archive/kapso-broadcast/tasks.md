# Tasks — kapso-broadcast

## Spec
- [x] proposal.md
- [ ] design.md
- [x] tasks.md

## Pre-implementación

- [x] SDK no expone broadcasts → REST directo con X-API-Key
- [ ] Confirmar endpoint exacto en primer uso — `ponytail:` comment en script señala duda
- [ ] Confirmar formato phone en primer uso (E.164 asumido)

## Implementación

### scripts/broadcast.js
- [x] Parsear args: `--message`, `--phones` (CSV path o lista), `--schedule` (ISO datetime opcional), `--status`
- [x] `POST /whatsapp_broadcasts` → obtener broadcast id
- [x] `POST /:id/recipients` con phones en batches de 1000
- [x] `POST /:id/send` (immediate si no hay `--schedule`, scheduled si hay)
- [x] `GET /:id/recipients` → log: total, delivered, failed

## QA
- [ ] Script crea broadcast → visible en Kapso dashboard
- [ ] Destinatario recibe mensaje en WhatsApp
- [ ] Duplicados en lista → Kapso los deduplica (verificar con 2 entradas del mismo número)
- [ ] `--schedule` → mensaje llega en horario correcto

## Deploy
- [ ] Script no se sube a Railway — corre local con `node -r dotenv/config scripts/broadcast.js`
- [ ] Documentar en CLAUDE.md: `node -r dotenv/config scripts/broadcast.js --message "..." --phones phones.csv`
