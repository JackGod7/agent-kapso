import Groq from 'groq-sdk';
import { downloadMedia } from '../index.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function transcribeAudio(audio, phone) {
  try {
    const buf = audio.url
      ? Buffer.from(await (await fetch(audio.url)).arrayBuffer())
      : await downloadMedia(audio.id);
    console.log(JSON.stringify({ type: 'audio_download', bytes: buf.length, mime: audio.mime_type }));
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
