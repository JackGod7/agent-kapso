import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import { sendText } from './index.js';
import { runAgent } from './src/agent.js';
import { getSession, resetSession, setHumanMode, sessions } from './src/state.js';

const app = express();

// Capture raw body for signature verification
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET;
const PROCESSABLE_TYPES = ['text'];
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

// Debounce buffer: phone → { timer, messages[], contactInfo }
const pendingMessages = new Map();

async function processMessages(phone, messages, contactInfo) {
  const text = messages.join('\n');
  if (!text.trim()) return;

  const session = getSession(phone);

  if (session.humanMode) {
    console.log(`[human-mode] ${phone}: bot silenced, human agent active`);
    return;
  }

  if (session.completed) {
    const elapsed = session.completedAt ? Date.now() - session.completedAt : 0;
    if (elapsed > RESET_AFTER_MS) {
      resetSession(phone);
      console.log(`[reset] ${phone}: session expired after 24h`);
      // fall through — process as new conversation
    } else {
      console.log(`[silent] ${phone}: session completed, ignoring`);
      completedSessions++;
      return;
    }
  }

  try {
    const reply = await runAgent(phone, text, contactInfo);
    if (reply) await sendText(phone, reply);
  } catch (err) {
    console.error(`[agent] ${phone}:`, err.message);
    webhookErrors++;
  }
}

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
      setHumanMode(phone, true); // takeover implicit on first human reply
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
      setHumanMode(phone, false);
      console.log(`[chatwoot] ${phone}: conversation resolved, bot resumed`);
    } else if (status === 'open' && sender?.type === 'user') {
      setHumanMode(phone, true);
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
    const text = msg.text?.body || msg.kapso?.content || '';
    const contactInfo = { contact_name: event.conversation?.kapso?.contact_name };

    if (!phone || !text.trim()) continue;

    // Debounce: accumulate rapid messages per phone
    if (pendingMessages.has(phone)) {
      clearTimeout(pendingMessages.get(phone).timer);
      pendingMessages.get(phone).messages.push(text);
    } else {
      pendingMessages.set(phone, { messages: [text], contactInfo });
    }

    const pending = pendingMessages.get(phone);
    pending.timer = setTimeout(async () => {
      const { messages, contactInfo } = pendingMessages.get(phone);
      pendingMessages.delete(phone);
      await processMessages(phone, messages, contactInfo);
    }, DEBOUNCE_MS);
  }
});

app.listen(PORT, () => {
  console.log(`Webhook server on :${PORT}`);
  console.log(`POST http://localhost:${PORT}/webhook`);
});
