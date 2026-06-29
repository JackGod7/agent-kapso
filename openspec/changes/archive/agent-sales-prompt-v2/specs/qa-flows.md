# QA Flows — Escenarios deterministas

Cada escenario define: INPUT del usuario → OUTPUT esperado del bot.
Si el bot produce algo diferente al OUTPUT esperado → bug en el prompt.

---

## FLUJO 1: Primera interacción (calificación normal)

**Escenario**: Prospecto nuevo, mensaje genérico.

```
USER: "Hola"
BOT:  Debe llamar get_whatsapp_context()
      Debe saludar por nombre
      Debe presentarse como asistente de Jack
      Debe hacer UNA pregunta de calificación (¿eres desarrollador?)
      NO debe dumpar info del bootcamp
      NO debe preguntar "¿en qué puedo ayudarte?"  ← genérico, prohibido
```

**Verificación**: El primer mensaje del bot contiene el nombre del contacto + una pregunta.

---

## FLUJO 2: Calificación completa → Pitch

**Escenario**: Prospecto responde las 3 preguntas.

```
USER: "Soy dev Python, quiero aprender IA para automatizar mi trabajo"
BOT:  Debe llamar save_variable("experiencia", "dev Python")
      Debe llamar save_variable("objetivo", "automatizar con IA")
      Debe hacer la siguiente pregunta de calificación (urgencia/fecha)
      NO debe hacer pitch todavía

USER: "Quiero empezar en 1-2 meses"
BOT:  Debe llamar save_variable("urgencia", "1-2 meses")
      Debe transicionar a FASE 2 (pitch)
      Pitch debe mencionar Python + automatización específicamente
      Pitch debe terminar con UNA pregunta de confirmación
```

**Verificación**: Pitch personalizado con datos del prospecto, no genérico.

---

## FLUJO 3: Off-topic

**Escenario**: Mensaje no relacionado al bootcamp.

```
USER: "Porque el Jack le gusta la gampi?"
BOT:  Debe responder EXACTAMENTE con variación de:
      "Eso está fuera de mi área, pero cuéntame — ¿qué te trajo aquí hoy?"
      NO debe responder la pregunta
      NO debe decir "Quedo atento a tu respuesta"
      NO debe ignorar el mensaje
```

**Verificación**: Respuesta contiene redirect al bootcamp.

---

## FLUJO 4: Objeción de precio

**Escenario**: Prospecto dice que es caro.

```
USER: "Cuánto cuesta?"
BOT:  NO debe inventar precio
      Debe decir que Jack maneja los precios
      Debe ofrecer conectar con Jack
      Debe llamar handoff_to_human("Prospecto pregunta precio")

(si el bot no hace handoff todavía y el usuario insiste)
USER: "Pero dame un aproximado, seguro es caro"
BOT:  Paso 1 ACKNOWLEDGE: validar la preocupación
      Paso 2 DIAGNOSE: "¿La preocupación es el monto total o el retorno de inversión?"
      Paso 3 REFRAME: dato sobre ROI/empleabilidad + oferta de hablar con Jack
      NO debe dar número inventado
```

**Verificación**: Protocolo de 3 pasos presente. Nunca inventa precio.

---

## FLUJO 5: Objeción de tiempo

```
USER: "No tengo tiempo para un bootcamp"
BOT:  Paso 1: "Es real — el tiempo es escaso."
      Paso 2: "¿Cuántas horas semanales podrías comprometer si las grabaciones estuvieran disponibles?"
      NO debe decir "tranquilo, es flexible" sin preguntar cuánto tiempo tienen
```

**Verificación**: El bot hace la pregunta de diagnóstico antes de dar solución.

---

## FLUJO 6: Rechazo definitivo

```
USER: "No me interesa, gracias"
BOT:  Debe responder con cierre amable y corto (1 oración)
      Debe llamar complete_task()
      NO debe insistir
      NO debe hacer otra pregunta
      NO debe decir "cualquier cosa aquí estoy"
```

**Verificación**: Mensaje de cierre + complete_task. Conversación termina.

---

## FLUJO 7: Solicitud de hablar con Jack

```
USER: "Quiero hablar directamente con Jack"
BOT:  Debe llamar handoff_to_human("Prospecto pide hablar con Jack directamente")
      Debe confirmar que Jack lo contactará
      NO debe seguir haciendo preguntas
```

**Verificación**: handoff_to_human llamado. Conversación en modo espera.

---

## FLUJO 8: Mensajes consecutivos rápidos (buffering)

**Escenario**: Usuario manda 3 mensajes seguidos antes de que el bot responda.

```
USER: "Hola"
USER: "Quiero info del bootcamp"
USER: "cuanto cuesta"
BOT:  (recibe los 3 como un evento buffered por Kapso)
      Debe procesar el contexto completo
      Debe responder saludando + dirigirse al precio (lo más urgente que preguntó)
      NO debe ignorar los mensajes anteriores
```

**Verificación**: El bot contextualiza todos los mensajes recibidos.

---

## FLUJO 9: Conversación ya iniciada — bot recuerda

```
(Conversación anterior: usuario dijo su nombre es "Carlos", es dev Python)
USER: "Oye y cuándo empieza?"
BOT:  Debe llamar get_variable("nombre") → "Carlos"
      Debe usar "Carlos" en la respuesta
      Debe responder sobre fechas con lo que sabe
      Si no sabe fechas exactas → handoff_to_human("Carlos pregunta fechas de inicio")
```

**Verificación**: Bot usa nombre del prospecto. No hace preguntas ya respondidas.

---

## FLUJO 10: Mensaje de tipo "unsupported" (sticker, audio, imagen)

```
USER: (manda un sticker o audio)
BOT:  server.js filtra msg.type !== 'text' → no llega al bot
      No debe hacer nada (comportamiento correcto actual)
```

**Verificación**: No genera respuesta para mensajes no-texto. ✓ Ya funciona.

---

## Checklist de regresión post-deploy

Antes de marcar el prompt como estable, verificar:

- [ ] Flujo 1: Saludo con nombre + calificación
- [ ] Flujo 2: Pitch personalizado (no genérico)
- [ ] Flujo 3: Off-topic redirigido
- [ ] Flujo 4: Precio → handoff (no inventa número)
- [ ] Flujo 5: Objeción de tiempo → pregunta diagnóstico primero
- [ ] Flujo 6: Rechazo → complete_task (no insiste)
- [ ] Flujo 7: "Hablar con Jack" → handoff inmediato
- [ ] Flujo 8: Mensajes múltiples → respuesta contextualizada
- [ ] Flujo 9: Memoria de sesión funciona
- [ ] Flujo 10: Mensajes no-texto ignorados ✓
