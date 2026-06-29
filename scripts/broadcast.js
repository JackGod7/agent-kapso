import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

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
  // CSV file path or comma-separated list → E.164 with +
  const raw = phonesArg.endsWith('.csv') || phonesArg.endsWith('.txt')
    ? readFileSync(phonesArg, 'utf8').split(/[\n,]/)
    : phonesArg.split(',');
  return raw
    .map(p => p.trim().replace(/[^\d+]/g, ''))
    .filter(p => p.replace(/\D/g, '').length >= 10)
    .map(p => p.startsWith('+') ? p : `+${p}`);
}

const { values } = parseArgs({
  options: {
    template: { type: 'string' },   // Meta template ID (required to create)
    name:     { type: 'string' },   // broadcast name/label
    phones:   { type: 'string' },
    schedule: { type: 'string' },   // ISO datetime, e.g. 2026-07-01T10:00:00Z
    status:   { type: 'string' },   // broadcast id — skip create, just check status
    list:     { type: 'boolean' },  // list available templates
  },
});

// List templates mode
if (values.list) {
  const res = await kapso('GET', `/whatsapp/templates?phone_number_id=${PHONE_NUMBER_ID}`);
  const templates = res.data ?? res;
  console.log('Available templates:');
  for (const t of templates) {
    console.log(`  ${t.id} — ${t.name} (${t.status})`);
  }
  process.exit(0);
}

// Status check mode
if (values.status) {
  const res = await kapso('GET', `/whatsapp/broadcasts/${values.status}/recipients`);
  const data = res.data ?? res;
  const total = Array.isArray(data) ? data.length : (res.total ?? '?');
  const delivered = Array.isArray(data) ? data.filter(r => r.status === 'delivered').length : (res.delivered ?? '?');
  const failed = Array.isArray(data) ? data.filter(r => r.status === 'failed').length : (res.failed ?? '?');
  console.log(`Broadcast ${values.status}: ${total} total, ${delivered} delivered, ${failed} failed`);
  process.exit(0);
}

if (!values.template || !values.phones) {
  console.error('Usage:');
  console.error('  node -r dotenv/config scripts/broadcast.js --template <meta_template_id> --phones phones.csv [--name "label"] [--schedule 2026-07-01T10:00:00Z]');
  console.error('  node -r dotenv/config scripts/broadcast.js --status <broadcast_id>');
  console.error('  node -r dotenv/config scripts/broadcast.js --list   # show available templates');
  process.exit(1);
}

const phones = parsePhones(values.phones);
const name = values.name ?? `broadcast-${Date.now()}`;
console.log(`Phones: ${phones.length} | Template: ${values.template} | Name: ${name}`);

// 1. Create broadcast
const created = await kapso('POST', '/whatsapp/broadcasts', {
  whatsapp_broadcast: {
    name,
    phone_number_id: PHONE_NUMBER_ID,
    whatsapp_template_id: values.template,
    ...(values.schedule ? { scheduled_at: values.schedule } : {}),
  },
});
const id = created.id ?? created.data?.id ?? created.whatsapp_broadcast?.id;
if (!id) throw new Error(`Broadcast created but no ID in response: ${JSON.stringify(created)}`);
console.log(`Broadcast created: ${id}`);

// 2. Add recipients in batches of 1000
const BATCH = 1000;
for (let i = 0; i < phones.length; i += BATCH) {
  const batch = phones.slice(i, i + BATCH);
  await kapso('POST', `/whatsapp/broadcasts/${id}/recipients`, {
    whatsapp_broadcast: {
      recipients: batch.map(phone => ({ phone_number: phone })),
    },
  });
  console.log(`Recipients added: ${Math.min(i + BATCH, phones.length)}/${phones.length}`);
}

// 3. Send
await kapso('POST', `/whatsapp/broadcasts/${id}/send`, {});
console.log(values.schedule
  ? `Scheduled for ${values.schedule}`
  : `Sent. Check: node -r dotenv/config scripts/broadcast.js --status ${id}`
);
