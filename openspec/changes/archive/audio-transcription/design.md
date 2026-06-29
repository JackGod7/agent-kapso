# Design — audio-transcription

## Flujo

```
WhatsApp audio msg → Kapso webhook → server.js
  → msg.type === 'audio'
  → downloadMedia(msg.audio.id)  ← Kapso SDK whatsapp.media.download()
  → groq.audio.transcriptions.create({ file, model: 'whisper-large-v3', language: 'es' })
  → text = transcript.text
  → inject into debounce buffer as normal text message
  → processMessages(phone, [text], contactInfo, msg.id)
```

## Payload de audio (WhatsApp Cloud API estándar)
```json
{
  "type": "audio",
  "audio": {
    "id": "MEDIA_ID",
    "mime_type": "audio/ogg; codecs=opus"
  }
}
```
Kapso puede normalizar con `msg.audio.url` directamente — confirmar via log `audio_payload` ya en prod.

## Implementación

### index.js — nueva función
```js
export async function downloadMedia(mediaId) {
  // whatsapp.media expone getUrl(id) o download(id)
  // Fallback: fetch directo a Kapso proxy
  const url = await whatsapp.media.getUrl(mediaId);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KAPSO_API_KEY}` } });
  return Buffer.from(await res.arrayBuffer());
}
```

### server.js — reemplazar bloque audio
```js
if (msg.type === 'audio') {
  const transcript = await transcribeAudio(msg.audio, phone);
  if (!transcript) continue;
  // inject as normal text into debounce buffer
  text = transcript;
  // fall through to normal debounce logic
}
```

### src/transcribe.js — nuevo módulo
```js
import Groq from 'groq-sdk';
import { downloadMedia } from '../index.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function transcribeAudio(audio, phone) {
  try {
    const buf = audio.url
      ? Buffer.from(await (await fetch(audio.url)).arrayBuffer())
      : await downloadMedia(audio.id);
    const file = new File([buf], 'audio.ogg', { type: audio.mime_type || 'audio/ogg' });
    const result = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
      language: 'es',
    });
    console.log(JSON.stringify({ type: 'audio_transcribed', phone_suffix: phone.slice(-4), chars: result.text.length }));
    return result.text;
  } catch (err) {
    console.error(`[transcribe] ${phone}:`, err.message);
    return null;
  }
}
```

## Variables de entorno
```
GROQ_API_KEY=gsk_...
```
Agregar en Railway → agent-kapso service.

## Fallback
Si transcripción falla (error Groq / audio corrupto) → `return null` → `continue` → silencio (no crash, no respuesta confusa).

## Dependencias
```
groq-sdk   (ya puede estar instalado como dep de Claude SDK, verificar)
```
