# Tasks — Conversation Archival

- [x] Fix Chatwoot 422: add `+` prefix to phone in `upsertContact` (`src/chatwoot.js`)
- [x] Refactor: extraer `archiveToChatwoot(phone, session, label)` de `handoff_to_human`
- [x] Llamar `archiveToChatwoot` desde `complete_task` en `src/agent.js`
- [x] Llamar `archiveToChatwoot` en `server.js` cuando sesión expira por 24h (antes del resetSession)
- [ ] Verificar en Chatwoot que llegan conversaciones de leads que no hicieron handoff
