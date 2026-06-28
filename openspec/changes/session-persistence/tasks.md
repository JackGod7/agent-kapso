# Tasks — session-persistence

## Setup Railway

- [x] Usar Valkey del proyecto `neuracode-agent` (ya existe) — URL pública: zephyr.proxy.rlwy.net:48558
- [x] Agregar `REDIS_URL` en Railway agent-kapso service — confirmado por usuario

## Implementación

- [x] `npm install ioredis`
- [x] `src/state.js`: reescribir con ioredis + fallback in-memory si no hay REDIS_URL
- [x] `src/state.js`: exportar `saveSession(phone, session)`, async getSession/resetSession/setHumanMode
- [x] `src/agent.js`: todos los `getSession()` → `await getSession()`, `saveSession` al final
- [x] `server.js`: getSession/resetSession/setHumanMode → await

## QA

- [ ] Guardar nombre via bot → reiniciar servidor → enviar mensaje → bot recuerda el nombre
- [ ] Completar handoff → reiniciar servidor → enviar mensaje → bot no responde (completed=true persistido)
- [x] Sin REDIS_URL → servidor inicia con in-memory (no falla) — guard `if (process.env.REDIS_URL)` en state.js

## Deploy

- [x] Redeploy con REDIS_URL disponible en Railway — servidor arriba sin errores
- [x] Verificar conexión Redis — lazyConnect, errores se loguean como `[redis]` si fallan; logs limpios
