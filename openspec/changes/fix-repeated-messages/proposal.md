# Proposal — fix-repeated-messages

## Problema

Jack reportó en producción: "repites mensajes". El bot enviaba 3-4 variaciones del mismo mensaje seguidas ("Jack te contacta pronto", "Quedamos así", "Lo tomo sin excusas").

## Causa raíz

`enter_waiting` tool existía en v1. Cuando Claude la llamaba:
1. `executeTool('enter_waiting')` → setea `session.waiting = true` → retorna `"waiting"`
2. Tool result se pushea a `messages` → Claude vuelve a correr en el loop
3. Claude genera OTRO texto de respuesta → bot envía segundo mensaje
4. Claude puede volver a llamar `enter_waiting` → loop de mensajes

El agent loop en `agent.js` continuaba mientras `stop_reason === 'tool_use'`. `enter_waiting` no tenía lógica para romper el loop.

## Solución

**Primaria**: eliminar `enter_waiting` del TOOLS array y del `executeTool` switch (parte de agent-sales-prompt-v2 — ya en implementación).

**Secundaria (safety net)**: agregar deduplicación de mensajes salientes. Si el último mensaje outbound es idéntico o muy similar al que se va a enviar, skip.

## Scope

Solo el safety net de deduplicación — la eliminación de `enter_waiting` va en v2.
