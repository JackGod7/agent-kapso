// ponytail: in-memory — add Redis when running multiple instances

export const sessions = new Map();

export function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      phase: 'nuevo',
      variables: {},
      history: [],
      waiting: false,
      completed: false,
      completedAt: null,
      humanMode: false,
      lastReply: null,
    });
  }
  return sessions.get(phone);
}

export function resetSession(phone) {
  sessions.delete(phone);
}

export function setHumanMode(phone, value) {
  getSession(phone).humanMode = value;
}
