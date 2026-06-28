// ponytail: in-memory — add Redis when running multiple instances

const sessions = new Map();

export function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      phase: 'nuevo',
      variables: {},
      history: [],
      waiting: false,
      completed: false,
      completedAt: null,
    });
  }
  return sessions.get(phone);
}

export function resetSession(phone) {
  sessions.delete(phone);
}
