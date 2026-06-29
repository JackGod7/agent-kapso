import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

// ponytail: endpoint may need adjustment — /platform/v1/ vs /meta/whatsapp/ unconfirmed
const BASE = 'https://api.kapso.ai/platform/v1';
const PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID;
const API_KEY = process.env.KAPSO_API_KEY;

const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
};

async function kapso(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function parsePhones(phonesArg) {
  // CSV file path or comma-separated list
  if (phonesArg.endsWith('.csv') || phonesArg.endsWith('.txt')) {
    return readFileSync(phonesArg, 'utf8')
      .split(/[\n,]/)
      .map(p => p.trim().replace(/\D/g, ''))
      .filter(p => p.length >= 10);
  }
  return phonesArg.split(',').map(p => p.trim().replace(/\D/g, '')).filter(p => p.length >= 10);
}

const { values } = parseArgs({
  options: {
    message:  { type: 'string' },
    phones:   { type: 'string' },
    schedule: { type: 'string' },  // ISO datetime, e.g. 2026-07-01T10:00:00Z
    status:   { type: 'string' },  // broadcast id — skip create, just check status
  },
});

if (values.status) {
  // Status check mode
  const recipients = await kapso('GET', `/whatsapp_broadcasts/${values.status}/recipients`);
  const data = recipients.data ?? recipients;
  const total = data.length;
  const delivered = data.filter(r => r.status === 'delivered').length;
  const failed = data.filter(r => r.status === 'failed').length;
  console.log(`Broadcast ${values.status}: ${total} total, ${delivered} delivered, ${failed} failed`);
  process.exit(0);
}

if (!values.message || !values.phones) {
  console.error('Usage: node scripts/broadcast.js --message "texto" --phones phones.csv [--schedule 2026-07-01T10:00:00Z]');
  console.error('       node scripts/broadcast.js --status <broadcast_id>');
  process.exit(1);
}

const phones = parsePhones(values.phones);
console.log(`Phones loaded: ${phones.length}`);

// 1. Create broadcast
const broadcast = await kapso('POST', '/whatsapp_broadcasts', {
  phone_number_id: PHONE_NUMBER_ID,
  message: { text: { body: values.message } },
  ...(values.schedule ? { scheduled_at: values.schedule } : {}),
});
const id = broadcast.id ?? broadcast.data?.id;
console.log(`Broadcast created: ${id}`);

// 2. Add recipients in batches of 1000
const BATCH = 1000;
for (let i = 0; i < phones.length; i += BATCH) {
  const batch = phones.slice(i, i + BATCH);
  await kapso('POST', `/whatsapp_broadcasts/${id}/recipients`, {
    recipients: batch.map(phone => ({ phone_number: phone })),
  });
  console.log(`Recipients added: ${Math.min(i + BATCH, phones.length)}/${phones.length}`);
}

// 3. Send
await kapso('POST', `/whatsapp_broadcasts/${id}/send`, {});
console.log(values.schedule
  ? `Broadcast scheduled for ${values.schedule}`
  : `Broadcast sent. Check status: node -r dotenv/config scripts/broadcast.js --status ${id}`
);
