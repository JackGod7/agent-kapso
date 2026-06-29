# Proposal — audio-transcription

## Problema
Prospectos mandan notas de voz (tipo de mensaje más común en WhatsApp LatAm). El bot actualmente los ignora o responde con redirect. Esto rompe el flujo de calificación y genera fricción.

## Solución
Transcribir mensajes de audio entrantes con Groq Whisper (gratis para bajo volumen, <1s latencia) y usar el texto transcrito como input normal al agent loop.

## Por qué Groq
- Gratis (hasta rate limit razonable para este volumen)
- `groq-sdk` ya disponible o ~5KB dep mínima
- Whisper-large-v3 → excelente para español LatAm
- <1s para audios <30s (típico en WhatsApp)

## Qué cambia
- `server.js`: detección de audio → download → transcribe → inyectar como texto
- `index.js`: función `downloadMedia(mediaId)` usando Kapso SDK `whatsapp.media`
- `.env` / Railway: agregar `GROQ_API_KEY`
- `PROCESSABLE_TYPES`: mantiene `'audio'` ya agregado

## Qué NO cambia
- Agent loop (`src/agent.js`) — recibe texto igual que siempre
- System prompt — no necesita saber que vino de audio
- Session / history — audio transcrito entra como mensaje de usuario normal

## Riesgo
- Payload de audio de Kapso desconocido — necesita un log real para confirmar campo `msg.audio.id` vs `msg.audio.url`
- Groq rate limit si el bot escala mucho — migrar a OpenAI Whisper en ese caso
