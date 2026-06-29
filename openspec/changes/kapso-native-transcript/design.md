# Design — kapso-native-transcript

## Lógica nueva en server.js

```js
if (msg.type === 'audio') {
  const kapsoTranscript = msg.kapso?.transcript?.text;
  const transcript = kapsoTranscript || await transcribeAudio(msg.audio, phone);
  console.log(JSON.stringify({ type: 'audio_transcript_source', source: kapsoTranscript ? 'kapso' : 'groq', chars: transcript?.length }));
  if (!transcript) continue;
  msg.type = 'text';
  msg.text = { body: transcript };
}
```

## Fallback chain
1. `msg.kapso.transcript.text` — Kapso nativo (gratis, 0 latencia extra)
2. `transcribeAudio(msg.audio, phone)` — Groq Whisper (si Kapso no transcribió)
3. `null` → `continue` (silencio, no crash)

## Log nuevo
`audio_transcript_source` con campo `source: "kapso" | "groq"` — permite monitorear en Railway cuánto usa cada fuente.
