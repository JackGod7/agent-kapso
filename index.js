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

// ponytail: minimal bootstrap — add webhook handler, templates, flows as needed
