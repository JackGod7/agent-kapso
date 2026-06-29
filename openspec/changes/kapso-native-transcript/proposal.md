# Proposal — kapso-native-transcript

## Problema
Kapso ya transcribe audio automáticamente y entrega `msg.kapso.transcript.text` en el webhook. Actualmente ignoramos ese dato y llamamos Groq Whisper para cada audio, lo cual es innecesario y agrega latencia (~1s extra).

## Solución
Usar `msg.kapso.transcript.text` como fuente primaria. Groq como fallback solo si Kapso no entregó transcript.

## Qué cambia
- `server.js`: en el bloque audio, leer `msg.kapso?.transcript?.text` primero
- `src/transcribe.js`: solo se llama si Kapso no tiene transcript
- Cero cambios al agent loop ni al system prompt

## Beneficio
- Elimina latencia de Groq en el happy path
- Elimina costo de Groq API (aunque es free tier, el rate limit desaparece)
- Menos puntos de falla
