# Tasks — Agent Sales Prompt v2

## Spec (completado)

- [x] proposal.md — por qué y qué cambia
- [x] design.md — arquitectura sectional, stage machine, objection playbook
- [x] specs/qa-flows.md — 10 flujos deterministas con input/output esperado

## Implementación

- [x] Reescribir `src/system-prompt.js`:
  - Sección [IDENTIDAD]: Jack Aguilar SDR, no "asistente amable"
  - Sección [ESTILO]: reglas WhatsApp (3 líneas, 1 pregunta, 1 emoji)
  - Sección [CONOCIMIENTO]: datos duros del GH-600 inline (RAG lite)
  - Sección [STAGE MACHINE]: 5 fases con transiciones explícitas
  - Sección [HERRAMIENTAS]: cada tool con condición exacta de uso
  - Sección [OBJECTIONS]: 6 objeciones → protocolo 3 pasos hardcodeado
  - Sección [OFF-TOPIC]: frase exacta de redirect

- [x] Eliminar tool `enter_waiting` de TOOLS array en system-prompt.js
- [x] Eliminar case `enter_waiting` en agent.js `executeTool`
- [x] Eliminar instrucción `enter_waiting` del state.js si aplica (no existía)

## QA

- [ ] Probar Flujo 1: primera interacción → saludo con nombre
- [ ] Probar Flujo 2: calificación completa → pitch personalizado
- [ ] Probar Flujo 3: off-topic → redirect exacto
- [ ] Probar Flujo 4: precio → handoff (no inventa número)
- [ ] Probar Flujo 5: objeción tiempo → diagnose primero
- [ ] Probar Flujo 6: rechazo → complete_task, no insiste
- [ ] Probar Flujo 7: "quiero hablar con Jack" → handoff inmediato
- [ ] Probar Flujo 9: memoria de sesión funciona entre mensajes

## Deploy

- [x] `railway up` → redeploy con nuevo system-prompt.js
- [x] Verificar logs Railway — sin errores de tools desconocidos
~~- [ ] Run checklist de regresión completo (specs/qa-flows.md)~~ ← duplicado, tracking en QA arriba
