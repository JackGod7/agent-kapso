#!/usr/bin/env node
// Resolves all open conversations in Chatwoot account
// Usage: CHATWOOT_BASE_URL=... CHATWOOT_API_TOKEN=... CHATWOOT_ACCOUNT_ID=... node scripts/resolve-chatwoot-conversations.mjs

const BASE = process.env.CHATWOOT_BASE_URL;
const TOKEN = process.env.CHATWOOT_API_TOKEN;
const ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID || '1';

if (!BASE || !TOKEN) {
  console.error('Missing CHATWOOT_BASE_URL or CHATWOOT_API_TOKEN');
  process.exit(1);
}

const headers = { 'api_access_token': TOKEN, 'Content-Type': 'application/json' };

async function getOpenConversations(page = 1) {
  const res = await fetch(`${BASE}/api/v1/accounts/${ACCOUNT}/conversations?status=open&page=${page}`, { headers });
  const data = await res.json();
  return data.data || { meta: {}, payload: [] };
}

async function resolve(id) {
  const res = await fetch(`${BASE}/api/v1/accounts/${ACCOUNT}/conversations/${id}/toggle_status`, {
    method: 'POST', headers, body: JSON.stringify({ status: 'resolved' }),
  });
  return res.ok;
}

let page = 1, total = 0, resolved = 0;
while (true) {
  const { meta, payload } = await getOpenConversations(page);
  if (!payload.length) break;
  for (const c of payload) {
    const ok = await resolve(c.id);
    console.log(`${ok ? '✓' : '✗'} conversation ${c.id}`);
    if (ok) resolved++;
    total++;
  }
  if (payload.length < 25) break; // last page
  page++;
}
console.log(`\nDone: ${resolved}/${total} resolved`);
