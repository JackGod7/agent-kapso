# Tasks — silence-after-completion

## Implementación

- [ ] `src/state.js`: agregar `completedAt: null` a session default
- [ ] `src/agent.js` case `handoff_to_human`: setear `session.completedAt = Date.now()`
- [ ] `src/agent.js` case `complete_task`: setear `session.completedAt = Date.now()`
- [ ] `server.js` (en processMessages): check `session.completed` con lógica de reset a 24h
- [ ] Si Redis: `saveSession` después de setear `completedAt`

## Dependencias

- Se puede implementar junto con `fix-message-filtering` (ambos tocan la misma lógica en processMessages)
- Requiere que `fix-message-filtering` refactorice server.js a `processMessages()` primero

## QA

- [ ] Handoff → mensaje inmediato → bot silencioso
- [ ] Complete_task → mensaje → bot silencioso
- [ ] Session completada hace 25h → mensaje → bot responde como nuevo (sin "¡Hola Jack!" de la session anterior)

## Deploy

- [ ] Redeploy en Railway
- [ ] Test real: trigger complete_task, mandar mensaje, verificar silencio
