# Design — session-persistence

## Dependencias

```bash
npm install ioredis
```

## src/state.js — nuevo

```js
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const TTL = 60 * 60 * 24 * 7; // 7 días

const DEFAULT_SESSION = () => ({
  phase: 'nuevo',
  variables: {},
  history: [],
  completed: false,
  lastReply: null,
});

export async function getSession(phone) {
  const raw = await redis.get(`session:${phone}`);
  if (raw) return JSON.parse(raw);
  const session = DEFAULT_SESSION();
  await saveSession(phone, session);
  return session;
}

export async function saveSession(phone, session) {
  await redis.set(`session:${phone}`, JSON.stringify(session), 'EX', TTL);
}
```

## Cambio en agent.js

`getSession` pasa a async — todos los `getSession(phone)` pasan a `await getSession(phone)`.

Además: después de cada mutación del session (push a history, save_variable, set completed), llamar `await saveSession(phone, session)`.

## Env var requerida

```
REDIS_URL=redis://default:<password>@<host>:<port>
```

Railway la genera automáticamente al crear el servicio Redis y la inyecta como variable de referencia.

## Fallback en dev

Si `REDIS_URL` no está definido → usar Map en memoria (mismo comportamiento actual).

```js
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
```

## Test determinista

1. Guardar sesión con `save_variable`
2. Reiniciar servidor
3. Enviar mensaje → bot debe recordar el nombre y variables
