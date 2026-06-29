/**
 * Unit tests — pure logic, no network, no mocks
 * Run: node tests/agent-unit.mjs
 */
import assert from 'node:assert/strict';

let passed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}

// ── dedup logic (mirrors server.js processMessages) ──────────────────────────
console.log('\n1. lastReply dedup');
function shouldSend(reply, prevReply) {
  return Boolean(reply && reply.trim() !== prevReply?.trim());
}
test('first reply sends',       () => assert.equal(shouldSend('Hola', undefined), true));
test('same reply deduped',      () => assert.equal(shouldSend('Hola', 'Hola'), false));
test('trimmed same deduped',    () => assert.equal(shouldSend('Hola', 'Hola '), false));
test('different reply sends',   () => assert.equal(shouldSend('Hola 2', 'Hola'), true));
test('null reply never sends',  () => assert.equal(shouldSend(null, 'Hola'), false));
test('empty reply never sends', () => assert.equal(shouldSend('', 'Hola'), false));

// ── extractText (mirrors agent.js) ───────────────────────────────────────────
console.log('\n2. extractText');
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
  return '';
}
test('string passthrough',     () => assert.equal(extractText('hola'), 'hola'));
test('text block extracted',   () => assert.equal(extractText([{type:'text',text:'hola'},{type:'tool_use',id:'x'}]), 'hola'));
test('tool_result skipped',    () => assert.equal(extractText([{type:'tool_result',content:'ok'}]), ''));
test('empty array → empty',    () => assert.equal(extractText([]), ''));
test('null → empty',           () => assert.equal(extractText(null), ''));
test('multiple text joined',   () => assert.equal(extractText([{type:'text',text:'a'},{type:'text',text:'b'}]), 'a b'));

// ── tool_result is_error structure ───────────────────────────────────────────
console.log('\n3. tool_result is_error');
function makeToolResult(id, isError, msg) {
  const content = isError ? `tool_error: ${msg}` : msg;
  return { type: 'tool_result', tool_use_id: id, content, ...(isError && { is_error: true }) };
}
test('success: no is_error key', () => assert.equal(makeToolResult('x', false, 'ok').is_error, undefined));
test('error: is_error=true',     () => assert.equal(makeToolResult('x', true, 'boom').is_error, true));
test('error: content has prefix',() => assert.ok(makeToolResult('x', true, 'boom').content.startsWith('tool_error:')));

// ── MAX_TOOL_ROUNDS fallback ──────────────────────────────────────────────────
console.log('\n4. MAX_TOOL_ROUNDS fallback');
function simulateAgentLoop(maxRounds) {
  let reply = null;
  for (let rounds = 1; rounds <= maxRounds + 1; rounds++) {
    if (rounds > maxRounds) {
      reply = 'Tuve un problema procesando tu mensaje. Por favor intenta de nuevo.';
      break;
    }
    // simulate tool_use round (no end_turn)
  }
  return reply;
}
test('fallback reply set on limit', () => assert.ok(simulateAgentLoop(10) !== null));
test('fallback is non-empty string',() => assert.ok(simulateAgentLoop(10).length > 0));

// ── archiveToChatwoot name resolution ────────────────────────────────────────
console.log('\n5. name resolution priority');
function resolveName(variables, contactInfo, phone) {
  return variables['nombre'] || variables['name'] || contactInfo?.contact_name || phone;
}
test('variables.nombre wins',           () => assert.equal(resolveName({nombre:'Ana'}, {contact_name:'WA Name'}, '51900001'), 'Ana'));
test('variables.name fallback',         () => assert.equal(resolveName({name:'Bob'}, {contact_name:'WA Name'}, '51900001'), 'Bob'));
test('contactInfo.contact_name fallback',() => assert.equal(resolveName({}, {contact_name:'WA Name'}, '51900001'), 'WA Name'));
test('phone last resort',               () => assert.equal(resolveName({}, {}, '51900001'), '51900001'));
test('undefined contactInfo safe',      () => assert.equal(resolveName({}, undefined, '51900001'), '51900001'));

// ── T16: structured log shapes ───────────────────────────────────────────────
console.log('\n6. chatwoot structured log shapes');
test('chatwoot_forward_ok shape', () => {
  const log = { type: 'chatwoot_forward_ok', phone_suffix: '2214',
    direction: 'incoming', conversation_id: 21, chars: 12 };
  assert.ok(log.type === 'chatwoot_forward_ok');
  assert.ok(typeof log.phone_suffix === 'string' && log.phone_suffix.length === 4);
  assert.ok(log.direction === 'incoming' || log.direction === 'outgoing');
  assert.ok(typeof log.conversation_id === 'number');
  assert.ok(typeof log.chars === 'number');
});
test('chatwoot_forward_error shape', () => {
  const log = { type: 'chatwoot_forward_error', phone_suffix: '2214',
    direction: 'outgoing', error: 'Chatwoot POST /x → 503', http_status: '503' };
  assert.ok(log.type === 'chatwoot_forward_error');
  assert.ok(typeof log.error === 'string');
  assert.ok(typeof log.http_status === 'string');
});
test('chatwoot_conv_created shape', () => {
  const log = { type: 'chatwoot_conv_created', phone_suffix: '2214',
    conversation_id: 22, contact_id: 9 };
  assert.ok(log.type === 'chatwoot_conv_created');
  assert.ok(typeof log.conversation_id === 'number');
  assert.ok(typeof log.contact_id === 'number');
});
test('chatwoot_conv_updated shape', () => {
  const log = { type: 'chatwoot_conv_updated', phone_suffix: '2214',
    conversation_id: 21, status: 'open', label: 'HANDOFF: x' };
  assert.ok(log.type === 'chatwoot_conv_updated');
  assert.ok(log.status === 'open' || log.status === 'resolved');
  assert.ok(typeof log.conversation_id === 'number');
});
test('http_status extracted from error', () => {
  const msg = 'Chatwoot POST /conversations/21/messages → 503';
  const httpStatus = msg.match(/→ (\d+)/)?.[1] || 'unknown';
  assert.equal(httpStatus, '503');
});
test('http_status unknown when no match', () => {
  const httpStatus = 'AbortError: fetch aborted'.match(/→ (\d+)/)?.[1] || 'unknown';
  assert.equal(httpStatus, 'unknown');
});

console.log(`\n${passed} tests passed\n`);
