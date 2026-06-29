# Tasks — sales-prompt-humanization

## Spec
- [x] proposal.md
- [x] design.md — ejemplos de respuestas antes/después por cada fase
- [x] tasks.md

## Implementación

### src/system-prompt.js
- [x] Reescribir sección [ESTILO]: agregar tono cercano LatAm, variación de apertura, acusar recibo
- [x] Reescribir FASE 1: preguntas de calificación más naturales, con contexto
- [x] Reescribir FASE 2: pitch con emoción + dolor del prospecto conectado
- [x] Reescribir FASE 4 [OBJECTIONS]: validación real antes de reencuadrar
- [x] Revisar FASE 3: lenguaje de cierre más humano, Jack como accesible
- [x] Mantener toda la lógica de tools y stage machine intacta

## QA
- [ ] Flujo completo con prospecto real → no suena a script
- [ ] Objeción "es caro" → respuesta empática, no mecánica
- [ ] Pitch → conectado al dolor que mencionó el prospecto
- [ ] Comparar con conversaciones anteriores: tono más cálido sin perder efectividad
