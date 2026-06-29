# Design — jack-handoff-notification

## Cambio en src/agent.js — case handoff_to_human

```js
case 'handoff_to_human': {
  session.completed = true;
  console.log(`[HANDOFF] ${phone}: ${input.reason}`);

  const jackPhone = process.env.JACK_PHONE_NUMBER;
  if (jackPhone) {
    const name = session.variables['nombre'] || contactInfo?.contact_name || phone;
    const vars = Object.entries(session.variables)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n') || '  (sin datos guardados)';

    const notification = [
      `🔔 Lead listo para hablar:`,
      ``,
      `Nombre: ${name}`,
      `Número: wa.me/${phone}`,
      `Razón: ${input.reason}`,
      ``,
      `Datos del prospecto:`,
      vars,
    ].join('\n');

    // importar sendText desde index.js (ya disponible en el scope del módulo vía import)
    await sendText(jackPhone, notification);
  }

  return 'handoff_initiated';
}
```

## Env var requerida

```
JACK_PHONE_NUMBER=51971388435   # número de Jack en formato E.164 sin +
```

Agregar en Railway vars del proyecto.

## Import necesario

`agent.js` necesita importar `sendText` de `../index.js`. Actualmente no lo importa.

```js
import { sendText } from '../index.js';
```

## Consideración: loop

`sendText` desde dentro de `executeTool` podría en teoría triggerear otro webhook si el número de Jack está conectado al mismo bot. Para evitar esto:
- Jack debe usar un número diferente al del bot
- O: verificar `phone !== jackPhone` en server.js antes de `runAgent()`

## Test determinista

1. Configurar `JACK_PHONE_NUMBER` en .env local
2. Trigger handoff en conversación de prueba
3. Verificar que Jack recibe WhatsApp con nombre, número, razón y variables
