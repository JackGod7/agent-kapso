# Tasks — fix-stale-name-variable

## Spec
- [x] proposal.md
- [x] design.md
- [x] tasks.md

## Implementación

### src/system-prompt.js
- [x] Agregar regla: si prospecto dice su nombre en cualquier momento → save_variable("nombre", nuevo_valor)
- [x] Agregar regla: si nombre nuevo difiere del guardado → confirmar antes de actualizar

## QA
- [ ] Bot guarda "Yaga" → prospecto dice "me llamo Jack" → bot confirma y actualiza
- [ ] Nombre correcto desde el inicio → sin pregunta extra (no regresión)
- [ ] Audio con nombre claro → guardado directo, sin confirmación innecesaria
