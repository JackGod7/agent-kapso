# Tasks — fix-message-filtering

## Implementación

- [ ] `server.js`: reemplazar `msg.type !== 'text'` por `!PROCESSABLE_TYPES.includes(msg.type)`
- [ ] `server.js`: importar `getSession` y agregar check `session.completed` antes de `runAgent()`

## QA

- [ ] Enviar sticker → confirmar bot NO responde
- [ ] Enviar audio → confirmar bot NO responde
- [ ] Trigger handoff → enviar texto → confirmar bot NO responde
- [ ] Enviar texto normal → confirmar bot SÍ responde

## Deploy

- [ ] Redeploy en Railway
- [ ] Verificar logs: sin errores de "unsupported message"
