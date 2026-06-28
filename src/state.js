import Redis from 'ioredis';

// ponytail: in-memory primary, Redis for persistence across deploys
export const sessions = new Map();

let redis = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, enableReadyCheck: false });
  redis.on('error', err => console.error('[redis]', err.message));
}

function defaultSession() {
  return {
    phase: 'nuevo', variables: {}, history: [],
    waiting: false, completed: false, completedAt: null,
    humanMode: false, lastReply: null, totalTokens: 0,
  };
}

export async function getSession(phone) {
  if (!sessions.has(phone) && redis) {
    try {
      const raw = await redis.get(`s:${phone}`);
      if (raw) sessions.set(phone, JSON.parse(raw));
    } catch (_) {}
  }
  if (!sessions.has(phone)) sessions.set(phone, defaultSession());
  return sessions.get(phone);
}

export async function saveSession(phone, session) {
  sessions.set(phone, session);
  if (redis) {
    try {
      await redis.set(`s:${phone}`, JSON.stringify(session), 'EX', 604800); // 7d
    } catch (_) {}
  }
}

export async function resetSession(phone) {
  sessions.delete(phone);
  if (redis) {
    try { await redis.del(`s:${phone}`); } catch (_) {}
  }
}

export async function setHumanMode(phone, value) {
  const session = await getSession(phone);
  session.humanMode = value;
  await saveSession(phone, session);
}
