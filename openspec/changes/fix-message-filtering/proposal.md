# Proposal — fix-message-filtering

## Problema

`server.js:43` solo filtra `msg.type !== 'text'` pero mensajes no soportados (stickers, audios, mensajes editados, reacciones) llegan como eventos con `type: "unsupported"` y `content: "[Unsupported message - Error 131051]: Message type unknown"`.

El bot recibe ese texto de error como si fuera un mensaje del usuario y responde con filler ("Quedo atento a tu respuesta 😊"). Confirmado en conversación de Axel.

Adicionalmente: cuando `session.completed = true` (post-handoff o post-complete_task), el server.js NO verifica ese flag — sigue llamando `runAgent()` y el bot responde aunque ya haya cerrado la conversación.

## Qué cambia

**server.js** — dos fixes quirúrgicos:

1. Filtro explícito de `type === "unsupported"` → skip silencioso
2. Filtro de tipos no-texto que no ameritan respuesta (sticker, audio, video, document, reaction, location) → skip silencioso o respuesta genérica
3. Check de `session.completed` antes de llamar `runAgent()` → si completed, no procesar

## Por qué ahora

Bugs visibles en producción hoy. Axel recibió "Quedo atento a tu respuesta" 3 veces seguidas por mensajes no-texto. Daña la credibilidad del bot.

## Fuera de scope

- Manejar audio con transcripción → eso es una feature separada
- Responder stickers con stickers → feature separada
