# Spec: Observabilidad Agentic (Sensores GH-600)

## Requisito

Un agente en producción sin sensores es opaco. No se puede iterar con confianza sin saber:
- qué decidió el agente y por qué
- cuánto cuesta cada conversación
- si el sistema está sano

## Sensores (4 mínimos)

### S1 — Agent Trace
**Qué**: log JSON al final de cada `runAgent()`.  
**Dónde**: `src/agent.js`, al retornar el resultado.  
**Formato**:
```json
{
  "type": "agent_trace",
  "phone_suffix": "1234",
  "turns": 3,
  "tools_called": ["get_program_info", "check_enrollment"],
  "stop_reason": "end_turn",
  "input_tokens": 4200,
  "output_tokens": 380,
  "duration_ms": 1840
}
```
**Consulta en Railway Logs**: filtrar `agent_trace`.

### S2 — Cost Tracking
**Qué**: acumular tokens por sesión, alertar si supera umbral.  
**Dónde**: `src/agent.js` + `src/state.js` (campo `totalTokens` en sesión).  
**Umbral inicial**: 50,000 tokens (~$0.15 por sesión con Sonnet).  
**Alerta**: `{ "type": "cost_alert", "phone_suffix": "...", "tokens": N }` en stdout.

### S3 — Health Metrics
**Qué**: extender `GET /health` con métricas del proceso.  
**Dónde**: `server.js`.  
**Respuesta**:
```json
{
  "status": "ok",
  "activeSessions": 3,
  "completedSessions": 47,
  "uptimeSeconds": 86400
}
```
**Uso**: Railway health check + monitoreo manual.

### S4 — Webhook Error Rate
**Qué**: contadores globales de requests/errores en el webhook.  
**Dónde**: `server.js` (vars globales, reset en restart — suficiente para uptime actual).  
**Expuesto en**: `/health` → `webhookTotal`, `webhookErrors`.

## Test determinístico

`node -e "import('./src/agent.js').then(m => console.log(typeof m.runAgent))"` → `function`.

Verificar S3: `curl http://localhost:3000/health` → respuesta incluye `activeSessions`.

## Límites conocidos

- Contadores en memoria → reset en restart (ponytail: suficiente hasta Redis)
- Railway Logs retention: 7 días en plan Hobby — exportar si se necesita histórico
- No hay alerting automático — monitoreo manual o webhook a WhatsApp del dueño
