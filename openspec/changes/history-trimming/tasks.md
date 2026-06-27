# Tasks — history-trimming

## Implementación

- [ ] `src/agent.js`: reemplazar `const messages = [...session.history]` con slice de últimos 20 + fix de tool pair integrity
- [ ] Agregar constante `HISTORY_WINDOW = 20` al inicio del archivo

## QA

- [ ] Conversación de 30+ mensajes → Claude responde sin error de contexto
- [ ] Tool use en el borde del window → no hay error "tool_use sin tool_result"
- [ ] `session.history` sigue acumulando todos los mensajes (para futura sync a Chatwoot)

## Deploy

- [ ] Redeploy en Railway
- [ ] Monitorear logs Railway — sin errores de Anthropic API sobre contexto inválido
