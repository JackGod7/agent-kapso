# Tasks — sales-prompt-humanization

## Spec
- [x] proposal.md
- [ ] design.md — ejemplos de respuestas antes/después por cada fase
- [x] tasks.md

## Implementación

### src/system-prompt.js
- [ ] Reescribir sección [ESTILO]: agregar tono cercano LatAm, variación de apertura, acusar recibo
- [ ] Reescribir FASE 1: preguntas de calificación más naturales, con contexto
- [ ] Reescribir FASE 2: pitch con emoción + dolor del prospecto conectado
- [ ] Reescribir FASE 4 [OBJECTIONS]: validación real antes de reencuadrar
- [ ] Revisar FASE 3 y FASE 5: lenguaje de cierre más humano
- [ ] Mantener toda la lógica de tools y stage machine intacta

## QA
- [ ] Flujo completo con prospecto real → no suena a script
- [ ] Objeción "es caro" → respuesta empática, no mecánica
- [ ] Pitch → conectado al dolor que mencionó el prospecto
- [ ] Comparar con conversaciones anteriores: tono más cálido sin perder efectividad
