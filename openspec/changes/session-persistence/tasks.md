# Tasks — session-persistence

## Setup Railway

- [ ] Crear servicio Redis en Railway (proyecto agent-kapso)
- [ ] Verificar que `REDIS_URL` queda disponible como var en el servicio

## Implementación

- [ ] `npm install ioredis`
- [ ] `src/state.js`: reescribir con Redis client + fallback in-memory si no hay REDIS_URL
- [ ] `src/state.js`: exportar `saveSession(phone, session)` además de `getSession`
- [ ] `src/agent.js`: todos los `getSession()` → `await getSession()`
- [ ] `src/agent.js`: agregar `await saveSession(phone, session)` después de mutaciones (history push, variables, completed)
- [ ] `server.js`: `getSession()` para check completed → `await getSession()`

## QA

- [ ] Guardar nombre via bot → reiniciar servidor → enviar mensaje → bot recuerda el nombre
- [ ] Completar handoff → reiniciar servidor → enviar mensaje → bot no responde (completed=true persistido)
- [ ] Sin REDIS_URL → servidor inicia con in-memory (no falla)

## Deploy

- [ ] Redeploy con REDIS_URL disponible en Railway
- [ ] Verificar conexión Redis en logs de inicio
