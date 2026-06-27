# Proposal — silence-after-completion

## Problema (confirmado en producción — 2 casos)

**Caso 1 — handoff_to_human:**
Bot hace handoff, dice "Jack te contacta pronto", pero sigue respondiendo a mensajes posteriores. Visto en conversación de Jack: después del handoff, Jack mandó 5+ mensajes más y el bot respondió a todos.

**Caso 2 — rechazo / complete_task:**
Jack dijo "me desanimó, no quiero comprar". Bot respondió "Listo. Si cambias de opinión... Un abrazo." — correcto. Pero Jack siguió mandando mensajes y el bot siguió respondiendo en vez de hacer `complete_task()` y callarse.

## Por qué falla

Dos bugs distintos:

1. `handoff_to_human` sí setea `session.completed = true`, pero `server.js` nunca verifica ese flag antes de llamar `runAgent()`. (Parcialmente cubierto en `fix-message-filtering` — pero ese spec no lo implementó aún.)

2. En el caso de rechazo, el prompt v1 no tenía regla clara de cuándo llamar `complete_task()`. El bot reconocía el rechazo con palabras pero no ejecutaba la tool. Prompt v2 lo especifica mejor, pero aún puede fallar.

## Qué cambia

**server.js**: check de `session.completed` antes de `runAgent()` — ya en `fix-message-filtering` tasks.

**Adicional**: Después de handoff o complete_task, si el usuario manda OTRO mensaje después de N minutos (ej: 30 min), resetear session → nueva conversación. Actualmente la session queda `completed=true` para siempre — si el usuario vuelve días después queda silenciado indefinidamente.

## Solución para reset

Agregar `completedAt: null` al session. Si `completed=true` y han pasado más de 24h desde `completedAt` → resetear session a estado inicial.

## Fuera de scope

Reactivar manualmente una sesión (Jack podría querer reactivar desde Chatwoot) → eso es parte del spec de Chatwoot.
