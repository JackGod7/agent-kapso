# Proposal — message-batching

## Problema (confirmado en producción)

WhatsApp users mandan 2-3 mensajes cortos seguidos en vez de uno largo. El bot responde a CADA mensaje por separado antes de que el usuario termine de escribir.

Jack Aguilar explícitamente dijo: "además respondes a cada mensaje, creo que debes esperar un momento" y "para que la conversacion sea más natural".

En su conversación envió: "pensé que eras sofisticado, más pareces un bot" / "ni funnel tienes creo" / "jejejeje" — tres mensajes separados en segundos. El bot intentó responder a cada uno, generando 3 respuestas distintas y repetitivas.

## Qué cambia

**Debounce de 4 segundos por phone.** Si llega un mensaje y hay otro en los próximos 4 segundos del mismo número, se concatenan y se procesan juntos como un solo turno.

```
Usuario: "pensé que eras sofisticado"   [t=0]
Usuario: "ni funnel tienes creo"        [t=1.2s]  
Usuario: "jejejeje"                     [t=2.4s]
Bot procesa los 3 juntos               [t=2.4s + 4s = t=6.4s]
Bot responde UNA VEZ
```

## Implementación

Timer por phone en server.js. Acumular mensajes en buffer. Limpiar buffer al disparar.

## Por qué ahora

Esto es lo que más daña la naturalidad del bot. Jack lo notó explícitamente. Es un cambio en server.js, no requiere tocar el agent ni el prompt.

## Trade-off

Latencia de respuesta aumenta 4 segundos en el peor caso (mensaje único). Aceptable para WhatsApp — el usuario ya espera unos segundos a que el "bot escriba".
