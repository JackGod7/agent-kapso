# Design — interactive-buttons-qualification

## SDK

`@kapso/whatsapp-cloud-api` ya tiene `sendInteractiveButtons`:

```js
await whatsapp.messages.sendInteractiveButtons({
  phoneNumberId: PHONE_NUMBER_ID,
  to,
  bodyText: "¿Eres desarrollador o tienes base técnica?",
  buttons: [
    { id: "yes_dev",   title: "Sí, soy dev" },
    { id: "some_tech", title: "Algo técnico" },
    { id: "no_tech",   title: "No aún" },
  ]
});
```

Límite Meta: máximo 3 botones por mensaje. Títulos: máximo 20 caracteres.

## Inbound — button reply payload

Cuando el prospecto toca un botón, Kapso entrega:

```json
{
  "message": {
    "type": "interactive",
    "interactive": {
      "type": "button_reply",
      "button_reply": { "id": "yes_dev", "title": "Sí, soy dev" }
    }
  }
}
```

El texto útil es `button_reply.title` — se pasa a Claude como si el prospecto lo hubiera escrito.

## Cambios por archivo

### `index.js`
Agregar:
```js
export async function sendButtons(to, bodyText, buttons) {
  return whatsapp.messages.sendInteractiveButtons({ phoneNumberId: PHONE_NUMBER_ID, to, bodyText, buttons });
}
```

### `server.js`
1. Agregar `'interactive'` a `PROCESSABLE_TYPES`
2. En el loop de eventos, extraer texto según tipo:
```js
const text = msg.type === 'interactive'
  ? msg.interactive?.button_reply?.title || ''
  : msg.text?.body || msg.kapso?.content || '';
```

### `src/system-prompt.js` — nuevo tool

```js
{
  name: "ask_with_buttons",
  description: "Envía una pregunta con hasta 3 botones de respuesta rápida. Usar en FASE 1 para las 3 preguntas de calificación y al final de objeciones para dar opciones claras.",
  input_schema: {
    type: "object",
    properties: {
      body: { type: "string", description: "Texto de la pregunta (máx 1024 chars)" },
      buttons: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            id:    { type: "string", description: "ID interno (snake_case, sin espacios)" },
            title: { type: "string", description: "Texto del botón (máx 20 chars)" }
          },
          required: ["id", "title"]
        }
      }
    },
    required: ["body", "buttons"]
  }
}
```

Actualizar `[FASE 1]` del system prompt:
- Instrucción: "Usa `ask_with_buttons` para las 3 preguntas de calificación — más fácil para el prospecto."
- Instrucción: "Si el prospecto escribe texto libre en vez de tocar botón, procesa igual."

### `src/agent.js` — nuevo case

```js
case 'ask_with_buttons': {
  const { body, buttons } = toolInput;
  await sendButtons(phone, body, buttons);
  toolResult = { sent: true };
  break;
}
```

Agregar import: `import { sendText, sendTyping, sendButtons } from '../index.js';`

## Flujo completo FASE 1 con buttons

```
Bot → ask_with_buttons("¿Eres desarrollador...?", [Sí dev / Algo técnico / No aún])
Prospecto toca "Sí, soy dev"
Kapso webhook → msg.type = "interactive", title = "Sí, soy dev"
server.js → extrae "Sí, soy dev" → runAgent como texto normal
Bot → save_variable("experiencia", "dev") + ask_with_buttons("¿Qué te motivó...?", [...])
...
```

## Sin regresión

- Mensajes de texto libre siguen funcionando (filtro `msg.type === 'text'` sigue vigente, ahora también acepta `'interactive'`)
- El bot puede mezclar `sendText` y `ask_with_buttons` en la misma conversación
- Si Claude elige no usar buttons (ej. respuesta larga en FASE 2), sigue enviando texto
