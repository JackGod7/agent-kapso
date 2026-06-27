import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import { sendText } from './index.js';
import { runAgent } from './src/agent.js';

const app = express();

// Capture raw body for signature verification
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET;

function verifySignature(req) {
  if (!WEBHOOK_SECRET) return true; // skip if not configured
  const sig = req.headers['x-webhook-signature'];
  if (!sig) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(req.rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/webhook', async (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  // Acknowledge within 10s window — Kapso retries on non-200
  res.sendStatus(200);

  const eventType = req.headers['x-webhook-event'];
  if (eventType !== 'whatsapp.message.received') return;

  // Buffered delivery sends array; single event sends object
  const events = Array.isArray(req.body) ? req.body : [req.body];

  for (const event of events) {
    const msg = event.message;
    if (!msg || msg.type !== 'text') continue;

    const phone = event.conversation?.phone_number;
    const text = msg.text?.body || msg.kapso?.content || '';
    const contactInfo = { contact_name: event.conversation?.kapso?.contact_name };

    if (!phone || !text.trim()) continue;

    try {
      const reply = await runAgent(phone, text, contactInfo);
      if (reply) await sendText(phone, reply);
    } catch (err) {
      console.error(`[agent] ${phone}:`, err.message);
    }
  }
});

app.listen(PORT, () => {
  console.log(`Webhook server on :${PORT}`);
  console.log(`POST http://localhost:${PORT}/webhook`);
});
