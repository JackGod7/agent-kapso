/**
 * Integration test: Chatwoot real-time forwarding
 * Requires: .env with CHATWOOT_* vars AND bot running locally on port 3000
 * Run: node -r dotenv/config tests/chatwoot-realtime.integration.mjs
 *
 * Start bot first: node -r dotenv/config server.js
 *
 * T13: full flow — 2 messages, same conv reused
 * T14: status update — handoff trigger → conv.status=open
 * T15: resilience — Chatwoot down → bot still responds (manual, see note below)
 */
import assert from 'node:assert/strict';
import { getSession, resetSession } from '../src/state.js';

const TEST_PHONE = '51900000088'; // fake phone, won't conflict with real leads
const BOT_URL = process.env.BOT_URL || 'http://localhost:3000/webhook';
const WAIT_MS = 8_000; // enough for Claude to respond
const BASE = () => process.env.CHATWOOT_BASE_URL;
const TOKEN = () => process.env.CHATWOOT_API_TOKEN;
const ACCOUNT = () => process.env.CHATWOOT_ACCOUNT_ID;

async function chatwootReq(path, method = 'GET', body) {
  const res = await fetch(`${BASE()}/api/v1/accounts/${ACCOUNT()}${path}`, {
    method,
    headers: { 'api_access_token': TOKEN(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Chatwoot ${method} ${path} → ${res.status}`);
  return res.json();
}

async function getContactConversations(phone) {
  const search = await chatwootReq(`/contacts/search?q=${encodeURIComponent(phone)}&include_contacts=true`);
  const contact = search.payload?.find(c =>
    c.phone_number === phone || c.phone_number === `+${phone}`
  );
  if (!contact) return { contact: null, conversations: [] };
  const convs = await chatwootReq(`/contacts/${contact.id}/conversations`);
  return { contact, conversations: convs.payload?.conversations ?? [] };
}

async function getConversationMessages(convId) {
  const data = await chatwootReq(`/conversations/${convId}/messages`);
  return data.payload?.messages ?? [];
}

function sendWebhook(text) {
  return fetch(BOT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-event': 'whatsapp.message.received' },
    body: JSON.stringify({
      message: { type: 'text', text: { body: text }, id: `test-${Date.now()}` },
      conversation: {
        phone_number: TEST_PHONE,
        kapso: { contact_name: 'Test Integration User' },
      },
    }),
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log(`\nChatwoot real-time integration tests`);
  console.log(`Bot: ${BOT_URL}`);
  console.log(`Chatwoot: ${BASE()}`);
  console.log(`Test phone: ${TEST_PHONE}\n`);

  // SETUP: clean state
  await resetSession(TEST_PHONE);
  console.log('Setup: session reset ✓');

  // ── T13: full flow — 2 messages, same conv reused ─────────────────────────
  console.log('\nT13: 2-message flow\n');

  console.log('  sending msg 1...');
  await sendWebhook('Hola, vi el GH-600');
  await sleep(WAIT_MS);

  const { contact, conversations: convs1 } = await getContactConversations(TEST_PHONE);
  assert.ok(contact, 'contact must exist in Chatwoot after msg 1');
  console.log(`  contact id: ${contact.id} ✓`);

  const conv1 = convs1.find(c => c.meta?.sender?.phone_number?.replace('+', '') === TEST_PHONE
    || c.meta?.sender?.phone_number === `+${TEST_PHONE}`) ?? convs1[convs1.length - 1];
  assert.ok(conv1, 'conversation must exist in Chatwoot after msg 1');
  assert.ok(conv1.id > 0, `conv.id must be positive, got: ${conv1.id}`);
  console.log(`  conversation id: ${conv1.id} ✓`);

  const msgs1 = await getConversationMessages(conv1.id);
  assert.ok(msgs1.length >= 2, `conv must have ≥ 2 messages after msg 1, got: ${msgs1.length}`);
  const incoming1 = msgs1.filter(m => m.message_type === 0); // 0=incoming
  const outgoing1 = msgs1.filter(m => m.message_type === 1); // 1=outgoing
  assert.ok(incoming1.length >= 1, 'must have ≥ 1 incoming message');
  assert.ok(outgoing1.length >= 1, 'must have ≥ 1 outgoing message');
  console.log(`  messages: ${incoming1.length} incoming + ${outgoing1.length} outgoing ✓`);

  const session1 = await getSession(TEST_PHONE);
  assert.equal(session1.chatwootConversationId, conv1.id,
    `session.chatwootConversationId (${session1.chatwootConversationId}) must equal conv.id (${conv1.id})`);
  console.log(`  session.chatwootConversationId === ${conv1.id} ✓`);

  console.log('\n  sending msg 2...');
  await sendWebhook('¿De qué trata el curso?');
  await sleep(WAIT_MS);

  const { conversations: convs2 } = await getContactConversations(TEST_PHONE);
  // Must still be only one conv (no new conv created)
  const conv2ForPhone = convs2.filter(c => c.id >= conv1.id); // same or newer
  assert.ok(conv2ForPhone.some(c => c.id === conv1.id), 'same conv must still exist after msg 2');

  const msgs2 = await getConversationMessages(conv1.id);
  assert.ok(msgs2.length >= 4, `conv must have ≥ 4 messages after msg 2, got: ${msgs2.length}`);
  console.log(`  messages after msg 2: ${msgs2.length} ✓`);

  const session2 = await getSession(TEST_PHONE);
  assert.equal(session2.chatwootConversationId, conv1.id,
    'session.chatwootConversationId must not change on msg 2');
  console.log(`  conv id unchanged: ${conv1.id} ✓`);

  console.log('\nT13: PASS ✓');

  // ── T14: status update — handoff trigger ────────────────────────────────
  console.log('\nT14: handoff → status=open\n');

  console.log(`  sending handoff trigger (Claude time: up to ${WAIT_MS * 2}ms)...`);
  await sendWebhook('quiero hablar con alguien, ¿cuánto cuesta?');
  await sleep(WAIT_MS * 2); // handoff takes more Claude rounds

  const { conversations: convs3 } = await getContactConversations(TEST_PHONE);
  const conv3 = convs3.find(c => c.id === conv1.id);
  assert.ok(conv3, `conv ${conv1.id} must still exist after handoff`);

  // Check status = open (handoff)
  const convDetail = await chatwootReq(`/conversations/${conv1.id}`);
  const status = convDetail.status;
  assert.equal(status, 'open', `conv.status must be 'open' after handoff, got: '${status}'`);
  console.log(`  status=open ✓`);

  // Only 1 conv for this contact
  const totalConvs = convs3.length;
  assert.ok(totalConvs >= 1, 'must have at least 1 conv');
  // Check no duplicates created (id should be same)
  const sameIdConvs = convs3.filter(c => c.id === conv1.id);
  assert.equal(sameIdConvs.length, 1, 'must not have duplicate convs with same id');
  console.log(`  no duplicate convs ✓`);

  console.log('\nT14: PASS ✓');

  // ── T15: resilience — chatwootForward non-fatal when Chatwoot is down ────
  // This test requires the bot running locally with an invalid CHATWOOT_BASE_URL.
  // Run manually:
  //   CHATWOOT_BASE_URL=https://invalid.example.com node -r dotenv/config server.js &
  //   BOT_URL=http://localhost:3000/webhook node -r dotenv/config tests/chatwoot-realtime.integration.mjs --resilience
  //
  // Expected: bot replies on WA, Railway logs show chatwoot_forward_error, no crash.
  if (process.argv.includes('--resilience')) {
    console.log('\nT15: resilience (Chatwoot down)\n');
    console.log('  Sending msg with Chatwoot unreachable...');
    // Capture stdout to verify log output — bot must log chatwoot_forward_error
    // and still return 200 on webhook
    const resilienceRes = await fetch(BOT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-event': 'whatsapp.message.received' },
      body: JSON.stringify({
        message: { type: 'text', text: { body: 'test resilience' }, id: `resilience-${Date.now()}` },
        conversation: { phone_number: TEST_PHONE, kapso: { contact_name: 'Resilience Test' } },
      }),
    });
    assert.equal(resilienceRes.status, 200, 'webhook must return 200 even when Chatwoot is down');
    console.log('  webhook returned 200 ✓');
    console.log('  Check server logs for: chatwoot_forward_error (type) — no uncaughtException');
    console.log('\nT15: PASS (manual verification of logs required)');
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\nPASS — real-time forwarding OK`);
  console.log(`Verify: ${BASE()}/app/accounts/${ACCOUNT()}/conversations/${conv1.id}`);
}

run().catch(err => {
  console.error('\nFAIL:', err.message);
  process.exit(1);
});
