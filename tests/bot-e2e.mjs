/**
 * E2E test: Full bot conversation from greeting to handoff
 * Requires:
 *   - Bot deployed and running (Railway or local)
 *   - Phone number with open WhatsApp 24h window (must have messaged the bot before)
 *   - Redis session for PHONE must be clean (run reset-session below or del s:<phone> in Redis)
 *   - .env with KAPSO_WEBHOOK_SECRET
 *
 * Run: node -r dotenv/config tests/bot-e2e.mjs
 * Reset session first: node -r dotenv/config tests/bot-e2e.mjs --reset
 *
 * TODOs:
 * - Assert bot's reply content (need to intercept sendText, not just check logs)
 * - Assert Chatwoot conversation was created (query API after handoff)
 * - Assert session.completed = true after handoff (query Redis)
 * - Mock sendText so test doesn't send real WhatsApp messages
 * - Test rejection path: "no me interesa" → complete_task → Chatwoot
 * - Test 24h session expiry archival
 */
import crypto from 'node:crypto';

const BOT_URL = process.env.BOT_URL ?? 'https://agent-kapso-production-36e0.up.railway.app/webhook';
const SECRET = process.env.KAPSO_WEBHOOK_SECRET;
const PHONE = process.env.TEST_PHONE ?? '51965132214'; // needs open WA 24h window
const WAIT_MS = 15_000; // must exceed bot response time (~12s max observed)

if (!SECRET) { console.error('FAIL: KAPSO_WEBHOOK_SECRET not set'); process.exit(1); }

function sign(body) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

async function sendWebhook(text, isNew = false) {
  const payload = JSON.stringify({
    message: { type: 'text', text: { body: text }, id: `test_${Date.now()}` },
    conversation: { phone_number: PHONE, kapso: { contact_name: 'E2E Test' } },
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
  return res.status;
}

async function resetSession() {
  const { default: Redis } = await import('ioredis');
  const r = new Redis(process.env.REDIS_URL);
  const n = await r.del(`s:${PHONE}`);
  await r.quit();
  console.log(`Session reset: ${n} key(s) deleted`);
}

async function wait(ms) {
  process.stdout.write(`  waiting ${ms / 1000}s...`);
  await new Promise(r => setTimeout(r, ms));
  console.log(' done');
}

if (process.argv.includes('--reset')) {
  await resetSession();
  process.exit(0);
}

// Conversation script → handoff path
const SCRIPT = [
  { text: 'Hola vi el GH-600 en TikTok', isNew: true },
  { text: 'Sí soy dev' },
  { text: 'Quiero cambiar a IA' },
  { text: 'Lo antes posible' },
  { text: 'Perfecto, cuánto cuesta?' }, // → FASE 3 → handoff_to_human
];

console.log(`=== Bot E2E: handoff path ===`);
console.log(`Phone: ${PHONE} | Bot: ${BOT_URL}\n`);

for (const { text, isNew } of SCRIPT) {
  process.stdout.write(`→ "${text}" `);
  await sendWebhook(text, isNew);
  console.log('[200]');
  await wait(WAIT_MS);
}

console.log('\nPASS (webhooks accepted) — verify manually:');
console.log('  1. WhatsApp: bot replied on each step');
console.log('  2. Railway logs: [HANDOFF] and [CHATWOOT] lines present');
console.log(`  3. Chatwoot inbox 2: conversation with ${PHONE} created`);
