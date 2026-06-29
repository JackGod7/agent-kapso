/**
 * Integration test: Chatwoot archival chain
 * Requires: .env with CHATWOOT_* vars (or Railway env via `railway run`)
 * Run: node -r dotenv/config tests/chatwoot.integration.mjs
 *
 * TODOs:
 * - Assert message content matches what was sent (not just count)
 * - Test upsertContact dedup (same phone → same contact id returned)
 * - Test postMessage outgoing vs incoming type mapping
 */
import assert from 'node:assert/strict';
import { upsertContact, createConversation, postMessage } from '../src/chatwoot.js';

const TEST_PHONE = '51900000099'; // fake phone, won't conflict with real leads
let contactId, conversationId;

async function run() {
  console.log('1. upsertContact...');
  contactId = await upsertContact(TEST_PHONE, 'Test Chatwoot Integration');
  assert.ok(typeof contactId === 'number', `contactId must be number, got: ${contactId}`);
  console.log(`   contact id: ${contactId} ✓`);

  // Second call → same id (dedup)
  const contactId2 = await upsertContact(TEST_PHONE, 'Test Chatwoot Integration');
  assert.equal(contactId2, contactId, 'upsertContact must return same id for existing phone');
  console.log(`   dedup: same id ${contactId2} ✓`);

  console.log('2. createConversation...');
  conversationId = await createConversation(contactId);
  assert.ok(typeof conversationId === 'number', `conversationId must be number, got: ${conversationId}`);
  console.log(`   conversation id: ${conversationId} ✓`);

  console.log('3. postMessage (incoming + outgoing)...');
  await postMessage(conversationId, 'Hola, test incoming', 'incoming');
  await postMessage(conversationId, 'Hola, test outgoing', 'outgoing');
  console.log('   messages posted ✓');

  console.log('\nPASS — Chatwoot archival chain OK');
  console.log(`Verify: ${process.env.CHATWOOT_BASE_URL}/app/accounts/${process.env.CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}`);
}

run().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
