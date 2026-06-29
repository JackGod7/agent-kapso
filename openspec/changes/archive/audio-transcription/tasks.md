# Tasks — audio-transcription

## Spec
- [x] proposal.md
- [x] design.md
- [x] tasks.md

## Pre-implementación
- [x] Confirmar payload de audio: log `audio_payload` en prod — implementado fallback url/id
- [x] Verificar si `groq-sdk` ya está en node_modules — no estaba, instalado
- [x] Obtener `GROQ_API_KEY` en https://console.groq.com

## Implementación

### package.json
- [x] `npm install groq-sdk`

### src/transcribe.js (nuevo)
- [x] Crear módulo con `transcribeAudio(audio, phone)`
- [x] Usar `audio.url` si existe, sino `downloadMedia(audio.id)`
- [x] Groq `whisper-large-v3`, language `es`
- [x] Log `audio_transcribed` con chars count
- [x] Return `null` en error (no throw)

### index.js
- [x] Agregar `downloadMedia(mediaId)` — `whatsapp.media` get URL + fetch con auth header

### server.js
- [x] Import `transcribeAudio` desde `./src/transcribe.js`
- [x] Reemplazar bloque audio: transcribir → si null skip, si ok → `msg.text = transcript` → fall through a debounce normal
- [x] Eliminar `AUDIO_REPLY` constant (ya no se usa)
- [x] Mantener log `audio_payload` para confirmar estructura en prod

## Railway
- [x] Agregar `GROQ_API_KEY` en variables del servicio agent-kapso

## QA
- [x] Enviar nota de voz → bot responde con el contenido transcrito
- [x] Audio en español → transcript en español, no inglés
- [x] Audio corrupto / silencio → bot silencioso (no crash)
- [x] Verificar log `audio_transcribed` en Railway con chars > 0
