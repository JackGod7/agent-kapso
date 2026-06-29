# Proposal — Chatwoot Real-Time Forwarding

## Resumen ejecutivo

El bot responde leads en WhatsApp pero Jack no puede ver ninguna conversación hasta que termina. Un lead que lleva 15 minutos hablando con el bot es invisible. Si el bot falla, la conversación se pierde. No hay forma de intervenir en el momento correcto.

Esta feature hace que cada mensaje aparezca en Chatwoot en tiempo real — desde el primer "hola".

---

## El problema hoy

### Visibilidad cero durante conversaciones activas

El flujo actual solo envía a Chatwoot en tres momentos:
- `handoff_to_human` — el lead calificó y preguntó precio
- `complete_task` — el lead rechazó definitivamente
- 24h de inactividad — la sesión expiró

Todo lo que pasa entre esos eventos es invisible. Un lead en FASE 2 (pitch), un lead con objeción activa, un lead que preguntó y no respondió — nada de eso llega a Chatwoot.

### Impacto directo en ventas

En un funnel de alto ticket, el momento de cierre no siempre es cuando el lead pregunta el precio. A veces es cuando:
- El lead hace una objeción y vacila — un humano puede entrar y resolver
- El lead lleva 10 minutos sin responder — Jack puede enviar un mensaje manual
- El bot entró en loop o no entendió al lead — Jack puede corregir antes de que el lead se vaya

Hoy Jack no sabe que ninguno de esos momentos está ocurriendo.

### Conversaciones perdidas por fallas del bot

Si Railway hace un redeploy, si Claude API tarda más de 30s, o si hay un error en `executeTool`, la conversación se pierde completamente. No hay ningún rastro en Chatwoot. El lead desaparece.

### Tabla: antes vs. después

| Situación | Hoy | Con esta feature |
|-----------|-----|-----------------|
| Lead en FASE 1 (calificación activa) | Invisible | Visible en Chatwoot desde el primer mensaje |
| Lead en FASE 4 (objeción activa) | Invisible | Jack puede ver y entrar a tiempo |
| Bot falla en mensaje 7 | Conversación perdida | Chatwoot tiene mensajes 1-6 |
| Lead no responde hace 10 min | Jack no sabe | Jack ve la conversación abierta y puede ping |
| Lead rechaza (complete_task) | Chatwoot recibe archival final | Chatwoot tenía la conv en tiempo real + status `resolved` al cierre |
| Handoff | Chatwoot recibe dump histórico | Chatwoot ya tiene la conv completa + status `open` al trigger |

---

## Solución

Cada mensaje visible (usuario → bot, bot → usuario) se postea a Chatwoot como ocurre, no al final.

### Cambios de comportamiento visibles para el operador

1. Abrir Chatwoot → ver todas las conversaciones activas en tiempo real
2. Conversaciones en `pending` = bot activo, sin intervención humana
3. Conversaciones en `open` = handoff iniciado, lead listo para Jack
4. Conversaciones en `resolved` = cerradas (rechazo o inactividad)
5. Gap de mensajes en Chatwoot = período de Chatwoot caído (bot siguió funcionando)

### Cambios técnicos (resumen ejecutivo)

| Componente | Cambio |
|-----------|--------|
| `src/chatwoot.js` | +3 funciones nuevas: `ensureChatwootConversation`, `chatwootForward`, `updateConversationStatus` |
| `src/chatwoot.js` | `archiveToChatwoot` actualizada: idempotente (usa conv existente si hay) |
| `server.js` | `processMessages` llama `chatwootForward` antes y después de `runAgent` |
| `src/agent.js` | `archiveToChatwoot` se mueve a `chatwoot.js`; sin cambios a la lógica |
| `session` (Redis) | +1 campo: `chatwootConversationId: null \| number` |
| Infraestructura | Sin cambios — mismo Railway, mismo Chatwoot, mismas env vars |

---

## Alternativas consideradas y descartadas

### Alternativa A: polling periódico (Jack revisa Kapso API cada N minutos)

Kapso tiene un script de observación (`observe-whatsapp`). Jack podría revisar conversaciones manualmente.

**Descartada porque:** no es tiempo real, requiere acción manual, no escala cuando hay múltiples leads simultáneos, y no da visibilidad de mensajes individuales.

### Alternativa B: webhook de Kapso hacia Chatwoot directamente (sin pasar por el bot)

Kapso podría tener una integración nativa con Chatwoot.

**Descartada porque:** Kapso no tiene integración nativa con Chatwoot. Implementarla requeriría código en la plataforma Kapso, que no controlamos. Nuestra solución pasa por el bot que sí controlamos.

### Alternativa C: fire-and-forget (no esperar respuesta de Chatwoot)

Lanzar `chatwootForward` sin `await` para no agregar latencia al flujo del bot.

**Descartada porque:** si Chatwoot falla y el proceso termina antes de que el Promise se resuelva, el mensaje se pierde silenciosamente sin log. Con `await` dentro de try/catch, la falla es visible en logs aunque el bot continúe. La latencia añadida (~100-300ms) es aceptable frente a los 10-15s del ciclo completo de Claude.

### Alternativa D: guardar mensajes en Redis y sync batch periódico

Acumular mensajes en Redis y enviarlos a Chatwoot en batch cada 30s.

**Descartada porque:** añade un job periódico (complejidad), introduce delay de hasta 30s (no real-time), y requiere lógica de dedup entre sesiones. La complejidad no vale el beneficio.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| Chatwoot caído → bot se bloquea | Media | Alto | `chatwootForward` es try/catch no-fatal; AbortController timeout 8s |
| Chatwoot lento → latencia agregada | Media | Medio | AbortController 8s; evaluable fire-and-forget en v2 si mide >400ms p95 |
| Conversaciones duplicadas en Chatwoot | Baja | Bajo | `ensureChatwootConversation` idempotente por session; guard `if (session.chatwootConversationId)` |
| Redis falla entre forward y saveSession → ID perdido | Muy baja | Bajo | Conv duplicada en Chatwoot al próximo mensaje; bot funciona; aceptable |
| Label no existe en Chatwoot → 422 | Media (si P1 no hecho) | Bajo | `archiveToChatwoot` absorbe 422; status se actualiza igual |
| Stale conv ID (conv eliminada de Chatwoot) | Muy baja | Bajo | 404 absorbido; mensajes perdidos hasta resetSession; stale ID recovery en v2 |

---

## Métricas de éxito

| Métrica | Baseline (hoy) | Target post-feature |
|---------|---------------|---------------------|
| % conversaciones visibles en Chatwoot en tiempo real | 0% | 100% de mensajes desde deploy |
| Tiempo hasta primer mensaje en Chatwoot | N/A (solo al cierre) | < 3s desde webhook |
| Conversaciones perdidas por falla del bot | 100% | 0% (Chatwoot tiene hasta el fallo) |
| Latencia added por forward (p95) | 0ms | < 400ms |
| Bot uptime afectado por Chatwoot down | N/A | 0% (no-fatal) |

---

## Qué NO cambia

- Lógica del agente Claude (`runAgent`, `executeTool`, SYSTEM_PROMPT, TOOLS)
- Redis schema excepto un campo nuevo (backward compat total)
- Infraestructura (Railway, Kapso, Valkey)
- El `/chatwoot-webhook` reverse direction (Chatwoot → bot) — ya existe, no se toca
- Frecuencia de deploys o proceso de CI/CD

## Qué NO hacemos (decisiones explícitas y por qué)

| Decisión | Motivo |
|----------|--------|
| No forward de tool calls internos | `save_variable`, `get_variable` son ruido de implementación. Un agente humano en Chatwoot no necesita ver que el bot consultó una variable. |
| No forward de `ask_with_buttons` body | El canal Chatwoot WABiz nativo ya recibe los mensajes interactivos. Duplicar crearía eco. |
| No retry de mensajes perdidos cuando Chatwoot se recupera | Requiere cola persistente de reintentos (Redis pub/sub o similar) — complejidad alta para un gap que el operador puede ver en logs. V2 si se mide frecuencia de gaps. |
| No asignación automática a agente específico | Configuración de Chatwoot, no de código. Jack configura las reglas de asignación en Chatwoot Settings. |
| No nueva infraestructura | No hay beneficio que justifique aumentar la superficie de operación. |
