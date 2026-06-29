/**
 * E2E test: rejection path → complete_task → Chatwoot archived
 * Requires:
 *   - Bot deployed and running
 *   - Phone with open WhatsApp 24h window
 *   - .env with KAPSO_WEBHOOK_SECRET, CHATWOOT_* vars
 *
 * Run: node -r dotenv/config tests/bot-e2e-reject.mjs
 * Reset session first: node -r dotenv/config tests/bot-e2e-reject.mjs --reset
 *
 * TODOs:
 * - Assert Chatwoot conversation label = "Conversación completada"
 * - Assert message count matches SCRIPT length × 2 (in+out)
 * - Mock sendText to avoid real WA messages
 */
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const BOT_URL = process.env.BOT_URL ?? 'https://agent-kapso-production-36e0.up.railway.app/webhook';
const SECRET   = process.env.KAPSO_WEBHOOK_SECRET;
const PHONE    = process.env.TEST_PHONE ?? '51965132214';
const WAIT_MS  = 15_000;
const CHATWOOT_BASE    = process.env.CHATWOOT_BASE_URL;
const CHATWOOT_TOKEN   = process.env.CHATWOOT_API_TOKEN;
const CHATWOOT_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID;
const CHATWOOT_INBOX   = process.env.CHATWOOT_INBOX_ID;

if (!SECRET) { console.error('FAIL: KAPSO_WEBHOOK_SECRET not set'); process.exit(1); }

function sign(body) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

async function sendWebhook(text, isNew = false) {
  const payload = JSON.stringify({
    message: { type: 'text', text: { body: text }, id: `test_${Date.now()}` },
    conversation: { phone_number: PHONE, kapso: { contact_name: 'E2E Reject Test' } },
    is_new_conversation: isNew,
  });
  const res = await fetch(BOT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-event': 'whatsapp.message.received',
      'x-webhook-signature': sign(payload),
    },
    body: payload,
  });
  if (res.status !== 200) throw new Error(`Webhook returned ${res.status}`);
}

async function wait(ms) {
  process.stdout.write(`  waiting ${ms / 1000}s...`);
  await new Promise(r => setTimeout(r, ms));
  console.log(' done');
}

async function resetSession() {
  const { default: Redis } = await import('ioredis');
  const r = new Redis(process.env.REDIS_URL);
  const n = await r.del(`s:${PHONE}`);
  await r.quit();
  console.log(`Session reset: ${n} key(s) deleted`);
}

async function getLatestChatwootConversation() {
  if (!CHATWOOT_BASE || !CHATWOOT_TOKEN || !CHATWOOT_ACCOUNT) return null;
  const res = await fetch(
    `${CHATWOOT_BASE}/api/v1/accounts/${CHATWOOT_ACCOUNT}/contacts/search?q=${encodeURIComponent(PHONE)}&include_contacts=true`,
    { headers: { 'api_access_token': CHATWOOT_TOKEN } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const contact = data.payload?.find(c =>
    c.phone_number === PHONE || c.phone_number === `+${PHONE}`
  );
  if (!contact) return null;

  const convRes = await fetch(
    `${CHATWOOT_BASE}/api/v1/accounts/${CHATWOOT_ACCOUNT}/contacts/${contact.id}/conversations`,
    { headers: { 'api_access_token': CHATWOOT_TOKEN } }
  );
  if (!convRes.ok) return null;
  const convData = await convRes.json();
  const convs = convData.payload?.sort((a, b) => b.id - a.id);
  return convs?.[0] ?? null;
}

if (process.argv.includes('--reset')) {
  await resetSession();
  process.exit(0);
}

// Rejection path: qualify briefly, then hard reject
const SCRIPT = [
  { text: 'Hola vi el GH-600', isNew: true },
  { text: 'No me interesa, gracias', isNew: false }, // → FASE 5 → complete_task
];

console.log(`=== Bot E2E: rejection path ===`);
console.log(`Phone: ${PHONE} | Bot: ${BOT_URL}\n`);

for (const { text, isNew } of SCRIPT) {
  process.stdout.write(`→ "${text}" `);
  await sendWebhook(text, isNew);
  console.log('[200]');
  await wait(WAIT_MS);
}

// Verify Chatwoot received the archived conversation
console.log('\nVerifying Chatwoot...');
const conv = await getLatestChatwootConversation();
if (conv) {
  const msgs = conv.messages?.length ?? conv.meta?.all_count ?? '?';
  console.log(`✓ Chatwoot conversation ${conv.id}: status=${conv.status} (${msgs} messages)`);
  assert.ok(conv.id, 'conversation id must exist');
  assert.equal(conv.status, 'resolved',
    `conversation must be resolved after complete_task, got: '${conv.status}'`);
  console.log(`✓ Chatwoot conversation ${conv.id}: status=resolved ✓`);
} else {
  console.warn('⚠ Could not verify Chatwoot (CHATWOOT_* env vars may not be set)');
}

console.log('\nPASS (webhooks accepted) — verify manually:');
console.log('  1. WhatsApp: bot replied then closed with short farewell');
console.log('  2. Railway logs: chatwoot_conv_updated with status=resolved');
console.log(`  3. Chatwoot inbox ${CHATWOOT_INBOX}: conversation with ${PHONE} status=resolved`);
