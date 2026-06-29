# Proposal — fix-stale-name-variable

## Problema
El bot guarda un nombre incorrecto ("Yaga" por mala transcripción) y no lo reemplaza cuando el prospecto corrige o repite su nombre correctamente en un mensaje posterior. La variable persiste en Redis con el valor erróneo.

## Causa raíz
`save_variable` solo guarda cuando Claude decide llamarlo. Si el nombre ya está en contexto (aunque sea incorrecto), Claude no vuelve a llamar `save_variable` — asume que ya tiene el dato.

## Solución
Dos partes:
1. **Prompt**: instruir a Claude que si el prospecto dice su nombre en cualquier punto de la conversación (no solo al inicio), actualice la variable `nombre` con el nuevo valor.
2. **Prompt**: si el nombre guardado y el nombre que acaba de decir el prospecto difieren, preguntar cuál es el correcto antes de continuar.

## Qué cambia
- `src/system-prompt.js`: agregar regla en sección `save_variable` sobre actualización de nombre
