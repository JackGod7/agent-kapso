# Design — silence-after-completion

## Cambios en src/state.js

Agregar `completedAt: null` a session inicial.

## Cambios en server.js (en processMessages)

```js
const session = getSession(phone);

if (session.completed) {
  const RESET_AFTER_MS = 24 * 60 * 60 * 1000; // 24h
  const elapsed = session.completedAt ? Date.now() - session.completedAt : 0;
  
  if (elapsed > RESET_AFTER_MS) {
    // Usuario volvió después de 24h — nueva conversación
    sessions.delete(phone); // o equivalente con Redis
    console.log(`[reset] ${phone}: session expired, starting fresh`);
  } else {
    // Silencio — no responder
    console.log(`[silent] ${phone}: session completed, ignoring message`);
    return;
  }
}
```

## Cambios en src/agent.js — case handoff_to_human y complete_task

```js
case 'handoff_to_human':
  session.completed = true;
  session.completedAt = Date.now();
  // ... notify Jack ...
  return 'handoff_initiated';

case 'complete_task':
  session.completed = true;
  session.completedAt = Date.now();
  return 'completed';
```

## Test determinista

1. Handoff → enviar otro mensaje → bot no responde
2. Complete_task → enviar otro mensaje → bot no responde
3. Handoff → esperar 24h → enviar mensaje → bot responde como conversación nueva
4. Rechazo ("no me interesa") → Claude llama complete_task → silencio
