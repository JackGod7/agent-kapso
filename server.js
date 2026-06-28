import 'dotenv/config';
import crypto from 'crypto';
import { resolve } from 'path';
import express from 'express';
import { sendText, sendTyping } from './index.js';
import { runAgent } from './src/agent.js';
import { getSession, saveSession, resetSession, setHumanMode, sessions, getAllSessions } from './src/state.js';

const app = express();

// Capture raw body for signature verification
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET;
const PROCESSABLE_TYPES = ['text', 'interactive'];
const DEBOUNCE_MS = 4000;
const RESET_AFTER_MS = 24 * 60 * 60 * 1000;

// Sensor S4: webhook error rate
let webhookTotal = 0;
let webhookErrors = 0;
let completedSessions = 0;

function verifySignature(req) {
  if (!WEBHOOK_SECRET) return true; // skip if not configured
  const sig = req.headers['x-webhook-signature'];
  if (!sig) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(req.rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

const CHATWOOT_WEBHOOK_SECRET = process.env.CHATWOOT_WEBHOOK_SECRET;

function verifyChatwootSignature(req) {
  if (!CHATWOOT_WEBHOOK_SECRET) return true; // skip if not configured
  const sig = req.headers['x-chatwoot-hmac-sha256'];
  if (!sig) return false;
  const expected = crypto.createHmac('sha256', CHATWOOT_WEBHOOK_SECRET).update(req.rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// Debounce buffer: phone → { timer, messages[], contactInfo }
const pendingMessages = new Map();

async function processMessages(phone, messages, contactInfo, lastMessageId) {
  const text = messages.join('\n');
  if (!text.trim()) return;

  const session = await getSession(phone);

  if (session.humanMode) {
    console.log(`[human-mode] ${phone}: bot silenced, human agent active`);
    return;
  }

  if (session.completed) {
    const elapsed = session.completedAt ? Date.now() - session.completedAt : 0;
    if (elapsed > RESET_AFTER_MS) {
      await resetSession(phone);
      console.log(`[reset] ${phone}: session expired after 24h`);
      // fall through — process as new conversation
    } else {
      console.log(`[silent] ${phone}: session completed, ignoring`);
      completedSessions++;
      return;
    }
  }

  try {
    if (lastMessageId) await sendTyping(phone, lastMessageId).catch(() => {});
    const reply = await runAgent(phone, text, contactInfo);
    if (reply && reply.trim() !== session.lastReply?.trim()) {
      session.lastReply = reply;
      await sendText(phone, reply);
    }
  } catch (err) {
    console.error(`[agent] ${phone}:`, err.message);
    webhookErrors++;
  }
}

app.get('/temario', (_req, res) => res.sendFile(resolve('temario-gh600.pdf')));
app.get('/testimonios', (_req, res) => res.sendFile(resolve('testimonio-gh600.jpg')));

// Funnel stats — reads all sessions from Redis + in-memory
app.get('/stats', async (_req, res) => {
  const all = await getAllSessions();
  const byFase = {}, bySource = {};
  let completed = 0, humanMode = 0;
  for (const s of all) {
    const fase = s.variables?.fase || 'sin_fase';
    byFase[fase] = (byFase[fase] || 0) + 1;
    const src = s.source || 'organic';
    bySource[src] = (bySource[src] || 0) + 1;
    if (s.completed) completed++;
    if (s.humanMode) humanMode++;
  }
  res.json({ total: all.length, byFase, bySource, completed, humanMode, webhookTotal, webhookErrors });
});

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

app.get('/dashboard', async (_req, res) => {
  const all = await getAllSessions();
  const byFase = {}, bySource = {};
  let completed = 0, humanMode = 0;
  for (const s of all) {
    const fase = s.variables?.fase || 'sin_fase';
    byFase[fase] = (byFase[fase] || 0) + 1;
    const src = s.source || 'organic';
    bySource[src] = (bySource[src] || 0) + 1;
    if (s.completed) completed++;
    if (s.humanMode) humanMode++;
  }
  const bar = (label, val, max, color) =>
    `<div style="margin:6px 0"><span style="display:inline-block;width:140px;font-size:13px">${esc(label)}</span><span style="display:inline-block;background:${esc(color)};width:${max ? Math.round((val/max)*200) : 0}px;height:16px;border-radius:3px;vertical-align:middle"></span> <b>${val}</b></div>`;
  const maxFase = Math.max(1, ...Object.values(byFase));
  const maxSrc  = Math.max(1, ...Object.values(bySource));
  res.send(`<!DOCTYPE html><html><head><meta charset=utf-8><title>Kapso Funnel — GH600</title>
<style>body{font-family:sans-serif;padding:32px;background:#0f0f0f;color:#eee}h2{color:#a78bfa}h3{color:#7dd3fc;margin-top:24px}.card{background:#1a1a1a;border-radius:10px;padding:20px;margin-bottom:20px;border:1px solid #333}.row{display:flex;gap:20px}.stat{flex:1;text-align:center}.stat b{font-size:32px;color:#a78bfa}.stat small{display:block;color:#888;font-size:12px}</style>
</head><body>
<h2>🤖 Funnel GH-600 — Agent Kapso</h2>
<div class=row>
  <div class=card><div class=stat><b>${all.length}</b><small>Total prospectos</small></div></div>
  <div class=card><div class=stat><b>${humanMode}</b><small>Con Jack ahora</small></div></div>
  <div class=card><div class=stat><b>${completed}</b><small>Completados</small></div></div>
  <div class=card><div class=stat><b>${webhookErrors}</b><small>Errores webhook</small></div></div>
</div>
<div class=card><h3>Fase del funnel</h3>
${Object.entries(byFase).sort().map(([k,v]) => bar(k, v, maxFase, '#a78bfa')).join('')}
</div>
<div class=card><h3>Fuente de tráfico</h3>
${Object.entries(bySource).sort().map(([k,v]) => bar(k, v, maxSrc, '#34d399')).join('')}
</div>
<p style="color:#555;font-size:12px">Actualiza la página para refrescar · <a href=/stats style=color:#555>/stats JSON</a> · <a href=/health style=color:#555>/health</a></p>
</body></html>`);
});

// Sensor S3: health + metrics
app.get('/health', (_req, res) => res.json({
  ok: true,
  activeSessions: sessions.size,
  completedSessions,
  uptimeSeconds: Math.floor(process.uptime()),
  webhookTotal,
  webhookErrors,
}));

// Chatwoot → WhatsApp: human agent replies + takeover/resolve
app.post('/chatwoot-webhook', async (req, res) => {
  if (!verifyChatwootSignature(req)) return res.sendStatus(401);
  res.sendStatus(200);

  const { event, message_type, content, private: isPrivate, sender, meta } = req.body;

  // Extract WhatsApp phone from conversation sender
  const rawPhone = meta?.sender?.phone_number || req.body.conversation?.meta?.sender?.phone_number || '';
  const phone = rawPhone.replace(/^\+/, ''); // normalize: strip leading +
  if (!phone) return;

  if (event === 'message_created') {
    // Only forward: outgoing messages from human agents (not bot/api posts)
    if ((message_type === 'outgoing' || message_type === 1) && !isPrivate && sender?.type === 'user') {
      console.log(`[chatwoot→wa] ${phone}: human reply forwarded`);
      await setHumanMode(phone, true); // takeover implicit on first human reply
      try {
        await sendText(phone, content);
      } catch (err) {
        console.error(`[chatwoot→wa] ${phone}:`, err.message);
      }
    }
    return;
  }

  if (event === 'conversation_status_changed') {
    const status = req.body.status || req.body.conversation?.status;
    if (status === 'resolved') {
      await setHumanMode(phone, false);
      console.log(`[chatwoot] ${phone}: conversation resolved, bot resumed`);
    } else if (status === 'open' && sender?.type === 'user') {
      await setHumanMode(phone, true);
      console.log(`[chatwoot] ${phone}: human takeover`);
    }
  }
});

app.post('/webhook', async (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  // Acknowledge within 10s window — Kapso retries on non-200
  res.sendStatus(200);
  webhookTotal++;

  const eventType = req.headers['x-webhook-event'];
  if (eventType !== 'whatsapp.message.received') return;

  // Buffered delivery sends array; single event sends object
  const events = Array.isArray(req.body) ? req.body : [req.body];

  for (const event of events) {
    const msg = event.message;
    if (!msg || !PROCESSABLE_TYPES.includes(msg.type)) continue;

    const phone = event.conversation?.phone_number;
    const text = msg.type === 'interactive'
      ? (msg.interactive?.button_reply?.title || '')
      : (msg.text?.body || msg.kapso?.content || '');
    const contactInfo = { contact_name: event.conversation?.kapso?.contact_name };

    if (!phone || !text.trim()) continue;

    // Source attribution: referral (Meta ads) or magic-word prefix in opening text
    if (event.is_new_conversation) {
      const session = await getSession(phone);
      const referral = msg.referral; // Kapso may or may not forward this from Meta
      if (referral) {
        console.log(JSON.stringify({ type: 'referral', phone_suffix: phone.slice(-4), referral }));
        const stype = referral.source_type || '';
        const KNOWN = { ad: referral.source_url?.includes('instagram') ? 'instagram_ad' : 'facebook_ad' };
        session.source = KNOWN[stype] || 'meta_referral';
      } else {
        const lower = text.toLowerCase();
        if (lower.startsWith('tiktok')) session.source = 'tiktok';
        else if (lower.startsWith('fb-') || lower.startsWith('facebook')) session.source = 'facebook_ad';
        else if (lower.startsWith('ig-') || lower.startsWith('instagram')) session.source = 'instagram_ad';
        // else stays 'organic'
      }
      await saveSession(phone, session);
    }

    // Debounce: accumulate rapid messages per phone
    if (pendingMessages.has(phone)) {
      clearTimeout(pendingMessages.get(phone).timer);
      pendingMessages.get(phone).messages.push(text);
      pendingMessages.get(phone).lastMessageId = msg.id;
    } else {
      pendingMessages.set(phone, { messages: [text], contactInfo, lastMessageId: msg.id });
    }

    const pending = pendingMessages.get(phone);
    pending.timer = setTimeout(async () => {
      const { messages, contactInfo, lastMessageId } = pendingMessages.get(phone);
      pendingMessages.delete(phone);
      await processMessages(phone, messages, contactInfo, lastMessageId);
    }, DEBOUNCE_MS);
  }
});

app.listen(PORT, () => {
  console.log(`Webhook server on :${PORT}`);
  console.log(`POST http://localhost:${PORT}/webhook`);
});
