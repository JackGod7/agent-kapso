# Tasks — session-persistence

## Setup Railway

- [x] Usar Valkey del proyecto `neuracode-agent` (ya existe) — URL pública: zephyr.proxy.rlwy.net:48558
- [ ] Agregar `REDIS_URL` en Railway agent-kapso service (manual — contiene credencial)

## Implementación

- [x] `npm install ioredis`
- [x] `src/state.js`: reescribir con ioredis + fallback in-memory si no hay REDIS_URL
- [x] `src/state.js`: exportar `saveSession(phone, session)`, async getSession/resetSession/setHumanMode
- [x] `src/agent.js`: todos los `getSession()` → `await getSession()`, `saveSession` al final
- [x] `server.js`: getSession/resetSession/setHumanMode → await

## QA

- [ ] Guardar nombre via bot → reiniciar servidor → enviar mensaje → bot recuerda el nombre
- [ ] Completar handoff → reiniciar servidor → enviar mensaje → bot no responde (completed=true persistido)
- [ ] Sin REDIS_URL → servidor inicia con in-memory (no falla)

## Deploy

- [ ] Redeploy con REDIS_URL disponible en Railway
- [ ] Verificar conexión Redis en logs de inicio
