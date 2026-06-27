# Design — fix-message-filtering

## Cambios en server.js

### Fix 1: filtro de tipos no procesables

```js
// ANTES (línea 43):
if (!msg || msg.type !== 'text') continue;

// DESPUÉS:
const PROCESSABLE_TYPES = ['text'];
if (!msg || !PROCESSABLE_TYPES.includes(msg.type)) continue;
```

Esto cubre: `sticker`, `image`, `audio`, `video`, `document`, `reaction`, `location`, `unsupported`.

### Fix 2: silenciar bot post-handoff

```js
// Agregar import en server.js:
import { getSession } from './src/state.js';

// Dentro del loop de eventos, antes de runAgent():
const session = getSession(phone);
if (session.completed) continue;
```

## Flujo resultante

```
mensaje sticker → type !== 'text' → skip → no Claude → no reply
mensaje edited  → type === 'unsupported' → skip → no Claude → no reply
mensaje texto   → session.completed? → skip si true
mensaje texto   → session.completed false → runAgent() → reply
```

## Test determinista

1. Enviar sticker → bot NO responde
2. Enviar mensaje de texto normal → bot responde
3. Hacer handoff (trigger "quiero hablar con Jack") → enviar otro texto → bot NO responde
