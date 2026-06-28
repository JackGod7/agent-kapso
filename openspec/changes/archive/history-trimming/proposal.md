# Proposal — history-trimming

## Problema

`session.history` crece sin límite. Cada mensaje (inbound + outbound + tool_use + tool_result) se acumula. En la conversación de Jack hay 97 mensajes. A ese ritmo:

- Tokens enviados a Claude por request = tokens_totales_history × 2 (Claude Input pricing)
- Riesgo de superar `max_tokens` del contexto en conversaciones muy largas
- Costo escala linealmente con la longitud de la conversación

## Solución

Mantener solo los últimos N turnos de history. El system prompt contiene los datos clave (bootcamp info). Las variables del prospecto están en `session.variables`. El history solo sirve para contexto conversacional reciente.

N = 20 turnos (inbound + outbound) = suficiente para coherencia conversacional.

## Trade-off

El bot puede "olvidar" lo que dijo hace 20 mensajes. Pero:
- Los datos del prospecto están en `session.variables` (persistidos)
- El stage de la conversación está implícito en el prompt
- 20 turnos = suficiente para cualquier conversación de ventas razonable

## Impacto

Costo de tokens en conversaciones largas: de O(n²) a O(n) — cada request usa un window fijo.
