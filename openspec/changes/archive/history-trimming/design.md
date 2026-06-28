# Design — history-trimming

## Cambio en src/agent.js

La history completa se guarda en `session.history` para persistencia. Pero Claude solo recibe una ventana reciente.

```js
// ANTES:
const messages = [...session.history];

// DESPUÉS:
const HISTORY_WINDOW = 20;
const messages = session.history.slice(-HISTORY_WINDOW);
```

Una línea. `session.history` sigue acumulando todo (útil para Chatwoot sync en el futuro). Claude solo ve los últimos 20 mensajes.

## Nota sobre tool messages

Claude requiere que cada `tool_use` tenga su `tool_result` en el history. Si el slice corta en medio de un par tool_use/tool_result, Claude devuelve error.

Fix: asegurar que el slice empieza en un mensaje `role: 'user'` (no en `tool_result` ni en la mitad de un bloque).

```js
let trimmed = session.history.slice(-HISTORY_WINDOW);
// Si el primer mensaje no es user, buscar el primer user message
const firstUser = trimmed.findIndex(m => m.role === 'user');
if (firstUser > 0) trimmed = trimmed.slice(firstUser);
const messages = trimmed;
```

## Test determinista

1. Simular conversación de 30+ mensajes
2. Verificar que Claude responde coherentemente (no error de contexto roto)
3. Verificar que el request a Claude no excede tokens esperados
