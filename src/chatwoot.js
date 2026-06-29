const BASE = () => process.env.CHATWOOT_BASE_URL;
const TOKEN = () => process.env.CHATWOOT_API_TOKEN;
const ACCOUNT = () => process.env.CHATWOOT_ACCOUNT_ID;
const INBOX = () => process.env.CHATWOOT_INBOX_ID;

async function req(path, method = 'GET', body) {
  const res = await fetch(`${BASE()}/api/v1/accounts/${ACCOUNT()}${path}`, {
    method,
    headers: { 'api_access_token': TOKEN(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Chatwoot ${method} ${path} → ${res.status}`);
  return res.json();
}

export async function upsertContact(phone, name) {
  const search = await req(`/contacts/search?q=${encodeURIComponent(phone)}&include_contacts=true`);
  const existing = search.payload?.find(c =>
    c.phone_number === phone || c.phone_number === `+${phone}`
  );
  if (existing) return existing.id;
  const e164 = phone.startsWith('+') ? phone : `+${phone}`;
  const contact = await req('/contacts', 'POST', { phone_number: e164, name: name || phone });
  return contact.id;
}

export async function createConversation(contactId) {
  const conv = await req('/conversations', 'POST', {
    inbox_id: parseInt(INBOX()),
    contact_id: contactId,
  });
  return conv.id;
}

export async function postMessage(conversationId, content, messageType) {
  return req(`/conversations/${conversationId}/messages`, 'POST', {
    content,
    message_type: messageType, // 'incoming' | 'outgoing'
    private: false,
  });
}
