# Design — Conversation Archival

## Approach

Extraer la lógica de archival de Chatwoot de `handoff_to_human` a una función reutilizable `archiveToChartwoot(phone, session, label)`. Llamarla desde:
1. `handoff_to_human` (ya existe, solo refactor)
2. `complete_task` (nuevo)
3. `resetSession` en state.js cuando expira por 24h (nuevo)

## Cambios

### `src/agent.js`

Extraer bloque Chatwoot de `handoff_to_human` a función local `archiveToChatwoot(phone, session, label)`.

Llamar también en `complete_task`:
```js
case 'complete_task':
  session.completed = true;
  session.completedAt = Date.now();
  await archiveToChatwoot(phone, session, 'Conversación completada (sin handoff)').catch(err =>
    console.error(`[CHATWOOT] archive failed: ${err.message}`)
  );
  return 'completed';
```

### `src/state.js`

En `resetSession` (llamada cuando expira por 24h): si la sesión tiene historial, archivar antes de borrar. Requiere pasar la función o importarla — evaluar si genera dependencia circular.

Alternativa más limpia: en `server.js`, cuando se detecta sesión expirada, llamar `archiveToChatwoot` antes de `resetSession`.

## Test determinístico

```
POST /webhook con msg de texto → bot llama complete_task()
→ Chatwoot recibe POST /contacts con phone E.164 (+51...)
→ Chatwoot recibe POST /conversations
→ Chatwoot recibe N POST /conversations/:id/messages
```

Verificable manualmente: enviar mensaje con texto "No me interesa" → bot completa → ver en Chatwoot inbox.
