# Proposal — session-persistence

## Problema

`src/state.js` usa un `Map` en memoria. Railway reinicia el servicio en cada deploy y ocasionalmente por OOM o health check failures. Al reiniciar:
- Todas las sesiones activas se pierden
- Un prospecto en medio de una conversación ve al bot empezar desde cero ("¡Hola! ¿En qué puedo ayudarte?")
- Variables guardadas (nombre, experiencia, objetivo) se pierden

## Solución

Redis como session store. Railway tiene Redis como servicio managed.

Alternativa más simple: guardar en archivo JSON en disco. Pero Railway no tiene disco persistente en el plan gratuito.

## Decisión

Redis en Railway. Un solo key por phone number con TTL de 7 días.

```
session:{phone} → JSON.stringify(sessionObject)
TTL: 7 días (604800s)
```

## Scope mínimo

- `src/state.js`: reemplazar Map por Redis client
- `getSession()` → async (breaking change en callers)
- Todos los callers de `getSession()` necesitan `await`

## Impacto en archivos

- `src/state.js` — reescritura completa
- `src/agent.js` — todos los `getSession()` pasan a `await getSession()`
- `server.js` — `getSession()` para check de `completed` pasa a `await`

## Fuera de scope

- Supabase / PostgreSQL — overkill para sessions
- Session expiry más granular — 7 días es suficiente
