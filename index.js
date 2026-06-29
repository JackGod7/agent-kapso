import 'dotenv/config';
import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';

const PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID;

export const whatsapp = new WhatsAppClient({
  baseUrl: 'https://api.kapso.ai/meta/whatsapp',
  kapsoApiKey: process.env.KAPSO_API_KEY,
});

export async function sendText(to, body) {
  return whatsapp.messages.sendText({ phoneNumberId: PHONE_NUMBER_ID, to, body });
}

export async function sendTyping(to, messageId) {
  return whatsapp.messages.markRead({ phoneNumberId: PHONE_NUMBER_ID, messageId, typingIndicator: { type: 'text' } });
}

export async function sendDocument(to, link, filename, caption) {
  return whatsapp.messages.sendDocument({ phoneNumberId: PHONE_NUMBER_ID, to, document: { link, filename, caption } });
}

export async function sendImage(to, link, caption) {
  return whatsapp.messages.sendImage({ phoneNumberId: PHONE_NUMBER_ID, to, image: { link, caption } });
}

export async function sendButtons(to, bodyText, buttons) {
  return whatsapp.messages.sendInteractiveButtons({ phoneNumberId: PHONE_NUMBER_ID, to, bodyText, buttons });
}

export async function saveContactNote(phone, note) {
  try {
    await whatsapp.contacts.update({ phoneNumberId: PHONE_NUMBER_ID, waId: phone, metadata: { note } });
  } catch (err) {
    console.warn('[kapso-contacts] note save failed:', err.message);
  }
}

export async function downloadMedia(mediaId) {
  const buf = await whatsapp.media.download({ mediaId, phoneNumberId: PHONE_NUMBER_ID, auth: 'always' });
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf instanceof ArrayBuffer ? buf : buf.buffer ?? buf);
}

// ponytail: minimal bootstrap — add webhook handler, templates, flows as needed
