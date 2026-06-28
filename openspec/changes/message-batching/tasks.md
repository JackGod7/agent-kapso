# Tasks — message-batching

## Implementación

- [x] `server.js`: agregar Map `pendingMessages` con debounce de 4000ms
- [x] `server.js`: refactorizar loop de eventos para usar el buffer
- [x] `server.js`: extraer `processMessages(phone, messages[], contactInfo)` como función
- [x] `server.js`: concatenar mensajes acumulados con `\n` antes de pasar a `runAgent`

## QA

- [ ] 3 mensajes en 3 segundos → 1 sola respuesta del bot
- [ ] 2 mensajes con 6 segundos de intervalo → 2 respuestas separadas
- [ ] Mensaje único → respuesta normal (sin regresión)
- [ ] Session completed → mensajes batched igualmente ignorados

## Deploy

- [ ] Redeploy en Railway
- [ ] Test real desde WhatsApp: mandar 3 mensajes seguidos rápido
