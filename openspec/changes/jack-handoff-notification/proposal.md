# Proposal — jack-handoff-notification

## Problema

Cuando el bot hace `handoff_to_human()`, Jack no se entera. El bot le dice al prospecto "Jack te contacta pronto" pero Jack nunca recibe una notificación. Jack tiene que revisar manualmente si alguien pidió hablar con él.

Evidencia en código: `agent.js:73` tiene `// ponytail: notify Jack here`.

## Qué cambia

Al ejecutar `handoff_to_human(reason)`:
1. Bot le dice al prospecto que Jack lo contactará
2. **Nuevo**: bot envía WhatsApp a Jack con: nombre del prospecto, su número, y la razón del handoff

## Canal elegido

WhatsApp a Jack — mismo canal que el bot usa. Rápido, sin fricción, Jack ya lo tiene abierto.

El número de Jack se configura via env var `JACK_PHONE_NUMBER` para no hardcodear.

## Formato del mensaje a Jack

```
🔔 Nuevo lead listo para hablar:

Nombre: {contact_name}
Número: {phone}
Razón: {reason}

Contexto guardado:
{variables del prospecto si existen}
```

## Fuera de scope

- Slack / email — agregar después si Jack no usa WhatsApp para esto
- Dashboard de leads — eso es Chatwoot
