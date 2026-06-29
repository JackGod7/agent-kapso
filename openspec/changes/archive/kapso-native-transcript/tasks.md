# Tasks — kapso-native-transcript

## Spec
- [x] proposal.md
- [x] design.md
- [x] tasks.md

## Implementación

### server.js
- [x] Leer `msg.kapso?.transcript?.text` antes de llamar transcribeAudio
- [x] Si existe → usarlo directo, skip Groq
- [x] Si no → llamar transcribeAudio como fallback
- [x] Log `audio_transcript_source` con campo `source: "kapso"|"groq"`

## QA
- [ ] Enviar nota de voz → log muestra `source: "kapso"` → bot responde
- [ ] Verificar latencia: respuesta más rápida que antes (~1s menos)
