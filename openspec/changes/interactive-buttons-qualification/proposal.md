# Proposal — interactive-buttons-qualification

## Por qué

La calificación actual es free-text: el bot pregunta "¿eres desarrollador?" y el prospecto escribe lo que quiera. Esto tiene dos problemas:
1. **Fricción** — escribir requiere más esfuerzo que tocar un botón
2. **Variabilidad** — Claude necesita interpretar "sí más o menos" vs "algo de código" vs "nop" antes de avanzar

WhatsApp Interactive Buttons resuelve ambos: el prospecto toca una opción, Claude recibe un valor limpio y estructurado, la calificación avanza en 1 toque.

## Qué cambia

### Preguntas de FASE 1 → buttons

| Pregunta actual (free-text) | Opciones con buttons |
|---|---|
| ¿Eres desarrollador o tienes base técnica? | "Sí, soy dev" / "Algo técnico" / "No aún" |
| ¿Qué te motivó a escribir hoy? | "Cambiar a IA" / "Mejorar mi trabajo" / "Solo curiosidad" |
| ¿Tienes fecha límite para hacer este cambio? | "Antes de 1 mes" / "1-3 meses" / "Sin fecha" |

### Objeciones → buttons de respuesta

Cuando el bot maneja una objeción, puede ofrecer botones al final:
- "¿Qué prefieres?" → "Hablar con Jack" / "Ver el temario" / "Pensarlo más"

## Qué NO cambia

- El bot sigue respondiendo free-text si el prospecto escribe texto libre (botones son sugerencia, no barrera)
- FASE 2-5 sin cambios — solo FASE 1 y cierre de objeción
- El handoff, complete_task, send_material tools: intactos

## Resultado esperado

- Calificación FASE 1 completa en 3 toques vs 3 mensajes escritos
- Datos estructurados (`"Sí, soy dev"`) vs interpretación libre
- Menor drop en el primer intercambio
