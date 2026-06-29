# Design — fix-stale-name-variable

## Regla a agregar en system-prompt.js (sección save_variable)

```
→ Si el prospecto menciona su nombre en cualquier momento (no solo al inicio),
  llama save_variable("nombre", valor) para actualizar — incluso si ya había un nombre guardado.
→ Si el nombre nuevo difiere del nombre que usabas antes, confirma una vez:
  "¿Tu nombre es [nuevo nombre], correcto?" — luego actualiza.
```

## Por qué funciona
Claude ya tiene `get_variable` para leer el nombre guardado. Al notar que el prospecto dice un nombre diferente al que está usando, debe actualizar. La instrucción explícita elimina la ambigüedad de "ya lo sé".

## Escenario
1. Audio transcribe "Yaga" → Claude guarda nombre="Yaga"
2. Prospecto dice "soy Jack Aguilar" → Claude detecta nombre diferente
3. Claude pregunta "¿Tu nombre es Jack Aguilar, correcto?" → prospecto confirma
4. Claude llama save_variable("nombre", "Jack Aguilar") → actualizado
