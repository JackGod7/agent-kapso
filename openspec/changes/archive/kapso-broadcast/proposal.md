# Proposal — kapso-broadcast

## Problema

Prospectos que no compraron el GH-600 en el primer contacto no reciben seguimiento. El bot solo responde inbound — no hay mecanismo para reactivar leads fríos con una nueva oferta, descuento, o fecha de cierre.

Kapso tiene Broadcast API: campaña → hasta 1000 destinatarios → scheduling → delivery tracking. Soporta templates aprobados por Meta y mensajes libres (dentro ventana 24h).

## Qué cambia

Un script CLI / agente de ops (no en server.js) que:
1. Recibe lista de teléfonos (CSV o array hardcoded)
2. Crea broadcast en Kapso
3. Agrega recipients en batches de ≤1000
4. Dispara envío (inmediato o scheduled)
5. Opcional: polling de delivery status

No se integra en el webhook loop — es una operación de ops disparada manualmente por Jack o por un cron.

## Por qué ahora

- Cohorte GH-600 cierra próximamente → window para retargeting
- Kapso ya tiene el API — 0 infra adicional
- Alternativa sin esto: Jack escribe a cada prospecto manualmente

## Flujo

```
Jack ejecuta: node scripts/broadcast.js --message "..." --phones phones.csv
  → POST /whatsapp_broadcasts
  → POST /:id/recipients (phone list)
  → POST /:id/send (immediate o scheduled)
  → GET /:id/recipients → log delivery status
```

## Fuera de scope

- UI para crear broadcasts — script CLI es suficiente
- Templates Meta (requieren aprobación previa) — usar message libre en ventana 24h primero
- Integración con CRM para segmentación automática — manual por ahora
- Rate limits / retry logic avanzado — Kapso maneja duplicados y delivery internamente
