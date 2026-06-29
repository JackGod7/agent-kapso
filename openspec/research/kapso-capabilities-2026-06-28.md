# Kapso Full Capability Audit — 2026-06-28

102 agents, 25 verified claims (18 confirmed, 7 killed). Sources: docs.kapso.ai/llms-full.txt, gokapso/agent-skills, installed SDK dist/index.js.

## Confirmed Features

### 1. Workflow Agent Node ★★★
AI agent nativo en Kapso Workflows. Se mantiene activo hasta que llama `complete_task`. Soporta MCP (HTTP streamable only). Variable substitution en server URLs (`{{system.customer.external_customer_id}}`). Schema fields: `system_prompt`, `provider_model_id`, `max_iterations`, `temperature`, `message_delivery_mode`, `enabled_default_tools`, `flow_agent_mcp_servers`.
- **Podría reemplazar el agent loop hand-rolled de agent-kapso**

### 2. Workflow: 12 node types, 3 triggers
Node types: `start`, `send_text`, `send_template`, `send_interactive`, `wait_for_response`, `set_variable`, `decide`, `call`, `webhook`, `function`, `agent`, `handoff`.
Triggers: `inbound_message` (requiere phone_number_id), `api_call`, `whatsapp_event`.
- **Delivery/read receipts NO disponibles como workflow triggers — usar webhooks.**

### 3. Call Workflow Node
Subroutines hasta 10 niveles de profundidad. Child recibe copia de variables del parent; al completar, merge automático de vuelta al parent.

### 4. Broadcast API ★★★
3 pasos obligatorios: POST /whatsapp_broadcasts → POST /:id/recipients (≤1000/batch, dupes skipped) → POST /:id/send.
Soporta envío inmediato (async) y scheduled. Per-recipient delivery tracking vía GET.
- **Ideal para campañas de retargeting a prospectos pasados.**

### 5. Serverless Functions
Cloudflare Workers con KV built-in (`env.KV.get/put/delete`) y secrets (`env.SECRET_NAME`). URL invoke: `https://api.kapso.ai/platform/v1/functions/{function_id}/invoke`. Deploy async 10-60s. Invocables desde workflow steps.
- Nota: Supabase/Deno también documentado como runtime alternativo.

### 6. Webhook Scoping + Buffering
- Project-level (sin phone_number_id) = NO recibe mensajes/conversaciones
- Phone-level (con phone_number_id) = mensajes + conversaciones
- Buffering: debounce 1-60s, batch 1-100 msgs/entrega
- Auto-pause si >85% failure rate (min 10 failures + 20 deliveries en 15min)

### 7. Kapso Project MCP
Tools: send messages, read conversations + messages, manage templates, configure webhooks, provision WhatsApp numbers, manage customers + setup links. Ya configurado en .mcp.json de este proyecto.

### 8. WhatsApp Flows ★★
Kapso hace RSA+AES-128-GCM decrypt → llega JSON plano. SDK v0.2.2 (2026-06-24): `client.flows.deploy()`, `client.messages.sendInteractiveFlow()`, `receiveFlowEvent`, `respondToFlow`, `downloadFlowMedia`.
- **Requiere Meta OBA (Official Business Account) para publicar.**

### 9. Kapso Proxy Extensions (YA EN SDK INSTALADO) ★★
Gateadas por `assertKapsoProxy()` — requiere `kapsoApiKey` en el cliente.
- `client.conversations.list/get/updateStatus`
- `client.messages.query/listByConversation/get`
- `client.contacts.list/get/update`
- `client.calls.list/get`
- **Nada de esto existe en Meta Cloud API raw.**

### 10. Multi-tenant / Platform tier
Setup links para clientes conecten su propio número Meta. Soporta miles de tenants aislados. Tier "Platform" específico para SaaS providers.

## Refutados — NO construir contra esto
- ❌ Agent node NO tiene `handoff_to_human` built-in → usar node type `handoff` separado
- ❌ Workflows NO se definen vía `@kapso/workflows` npm lib → REST API o visual builder
- ❌ Kapso webhook NO soporta formato "raw Meta passthrough"
- ❌ `endpoint_uri` no debe ser omitido automáticamente por Kapso en Flows
- ❌ `"version":"3.0"` en data_exchange no es requisito obligatorio documentado

## Open Questions
1. Precio/rate limits del Broadcast API (¿mismo costo que mensajes normales?)
2. ¿Qué LLM providers acepta Agent Node? `provider_model_id` existe pero proveedores sin documentar
3. Cold-start / límites de ejecución de Functions (10-60s es deploy, no request time)
4. ¿White-label soporta billing/quota management por cliente?

## Prioridad de implementación
1. **Proxy Extensions** — 0 infra, ya en SDK, configura `kapsoApiKey` → historial + contactos
2. **Broadcast API** — retargeting prospectos pasados
3. **WhatsApp Flows** — calificación interactiva nativa (requiere OBA primero)
4. **Workflow Agent Node** — explorar migrar agent loop si Kapso soporta Anthropic como provider
