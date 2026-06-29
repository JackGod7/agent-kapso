# Propuesta — Agent Sales Prompt v2: De probabilístico a determinista

## Por qué

El bot actual responde con filler genérico ("Quedo atento a tu respuesta 😊") porque el system prompt deja al LLM adivinar qué hacer. El LLM es un motor probabilístico — si no le dices exactamente qué hacer en cada situación, inventa. El resultado es un vendedor que no vende.

El objetivo: convertir al bot en Jack Aguilar vendedor. No un asistente amable. Un SDR real que califica, objeta con datos, y cierra.

## Qué está mal hoy

| Problema | Causa raíz |
|---|---|
| Respuestas genéricas tipo filler | Prompt monolítico sin estructura de fases |
| `enter_waiting` confunde a Claude | Instrucción ambigua — Claude la usa como muleta |
| Off-topic mal manejado | Sin frase de redirect explícita |
| Tools vagos | Sin condición exacta "usar SOLO cuando..." |
| El bot no califica | Nunca pregunta: experiencia, objetivo, urgencia |
| Sin objection handling real | No hay protocolo de 3 pasos |
| Sin cierre | Nunca empuja a una acción concreta |

## Qué cambia

1. **system-prompt.js** — reescritura total con arquitectura sectional
2. **QA de flujos** — specs/qa-flows.md documenta escenarios deterministas
3. **Eliminar `enter_waiting`** — flujo de control vía `complete_task` + `handoff_to_human` únicamente
4. **Stage machine explícita** — 5 fases con transiciones claras
5. **Objection playbook** — 6 objeciones mapeadas a respuestas exactas (no "di algo empático")
6. **RAG lite** — contexto del bootcamp inyectado como sección fija, no como "conocimiento" del LLM

## Qué NO cambia

- `agent.js` — loop de Claude no cambia
- `state.js` — sessions en memoria se mantienen
- `server.js` — webhook sin cambios
- Deploy en Railway — mismo servicio
