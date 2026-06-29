const BASE = () => process.env.CHATWOOT_BASE_URL;
const TOKEN = () => process.env.CHATWOOT_API_TOKEN;
const ACCOUNT = () => process.env.CHATWOOT_ACCOUNT_ID;
const INBOX = () => process.env.CHATWOOT_INBOX_ID;

// T0: AbortController 8s timeout — prevents Node hanging if Chatwoot TCP hangs
async function req(path, method = 'GET', body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`${BASE()}/api/v1/accounts/${ACCOUNT()}${path}`, {
      method,
      headers: { 'api_access_token': TOKEN(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Chatwoot ${method} ${path} → ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// T4: moved from agent.js
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
  return '';
}

export async function upsertContact(phone, name) {
  const search = await req(`/contacts/search?q=${encodeURIComponent(phone)}&include_contacts=true`);
  const existing = search.payload?.find(c =>
    c.phone_number === phone || c.phone_number === `+${phone}`
  );
  if (existing) return existing.id;
  const e164 = phone.startsWith('+') ? phone : `+${phone}`;
  const contact = await req('/contacts', 'POST', { phone_number: e164, name: name || phone });
  return contact.payload?.contact?.id ?? contact.id;
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

// T1: internal — only used by archiveToChatwoot
async function updateConversationStatus(conversationId, status, label) {
  await req(`/conversations/${conversationId}`, 'PATCH', { status });
  if (label) {
    const truncated = label.slice(0, 25);
    await req(`/conversations/${conversationId}/labels`, 'POST', { labels: [truncated] });
  }
}

// T2: internal — only used by chatwootForward and archiveToChatwoot fallback
async function ensureChatwootConversation(phone, session, contactInfo) {
  if (session.chatwootConversationId) return session.chatwootConversationId;
  const name = session.variables['nombre'] || session.variables['name']
    || contactInfo?.contact_name || phone;
  const contactId = await upsertContact(phone, name);
  if (!contactId) throw new Error('upsertContact returned undefined');
  const conv = await req('/conversations', 'POST', {
    inbox_id: parseInt(INBOX()),
    contact_id: contactId,
    additional_attributes: { source: 'kapso-whatsapp' },
  });
  const conversationId = conv.id;
  if (!conversationId || conversationId <= 0) throw new Error(`invalid conv id: ${conversationId}`);
  session.chatwootConversationId = conversationId;
  console.log(JSON.stringify({
    type: 'chatwoot_conv_created',
    phone_suffix: phone.slice(-4),
    conversation_id: conversationId,
    contact_id: contactId,
  }));
  return conversationId;
}

// T3: exported — called by server.js before and after runAgent
export async function chatwootForward(phone, session, text, direction, contactInfo) {
  if (!text?.trim()) return;
  try {
    const conversationId = await ensureChatwootConversation(phone, session, contactInfo);
    await postMessage(conversationId, text, direction);
    console.log(JSON.stringify({
      type: 'chatwoot_forward_ok',
      phone_suffix: phone.slice(-4),
      direction,
      conversation_id: conversationId,
      chars: text.length,
    }));
  } catch (err) {
    const httpStatus = err.message.match(/→ (\d+)/)?.[1] || 'unknown';
    console.error(JSON.stringify({
      type: 'chatwoot_forward_error',
      phone_suffix: phone.slice(-4),
      direction,
      error: err.message,
      http_status: httpStatus,
    }));
    // NEVER rethrow — Chatwoot failure must not block the bot
  }
}

// T5: moved from agent.js + idempotent (uses existing convId if present)
export async function archiveToChatwoot(phone, session, label, contactInfo) {
  try {
    const conversationId = session.chatwootConversationId;

    if (conversationId) {
      // Real-time path: conv already exists — only update status + label
      const status = label.startsWith('HANDOFF') ? 'open' : 'resolved';
      await updateConversationStatus(conversationId, status, label);
      console.log(JSON.stringify({
        type: 'chatwoot_conv_updated',
        phone_suffix: phone.slice(-4),
        conversation_id: conversationId,
        status,
        label: label.slice(0, 25),
        trigger: label,
      }));
    } else {
      // Fallback: session without real-time (pre-deploy or forward failed) — replay history
      const name = session.variables['nombre'] || session.variables['name']
        || contactInfo?.contact_name || phone;
      const contactId = await upsertContact(phone, name);
      if (!contactId) throw new Error('upsertContact returned undefined');
      const conv = await req('/conversations', 'POST', {
        inbox_id: parseInt(INBOX()),
        contact_id: contactId,
        additional_attributes: { source: 'kapso-whatsapp-fallback' },
      });
      const newConvId = conv.id;
      if (!newConvId) throw new Error('createConversation returned no id');

      const messages = session.history
        .map(msg => ({ text: extractText(msg.content), dir: msg.role === 'user' ? 'incoming' : 'outgoing' }))
        .filter(m => m.text);
      await Promise.all(messages.map(m => postMessage(newConvId, m.text, m.dir)));

      const status = label.startsWith('HANDOFF') ? 'open' : 'resolved';
      await updateConversationStatus(newConvId, status, label);

      console.log(JSON.stringify({
        type: 'chatwoot_archive_fallback',
        phone_suffix: phone.slice(-4),
        conversation_id: newConvId,
        messages_replayed: messages.length,
      }));
    }
  } catch (err) {
    console.error(JSON.stringify({
      type: 'chatwoot_archive_error',
      phone_suffix: phone.slice(-4),
      label,
      error: err.message,
    }));
    // NEVER rethrow — archive failure must not interrupt handoff/complete_task
  }
}
