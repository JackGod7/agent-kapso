# Agent Kapso — Arquitectura

> Última actualización: 2026-06-29. Bot de ventas WhatsApp para GH-600 (bootcamp Jack Aguilar).

---

## Stack

| Capa | Tecnología | Para qué |
|---|---|---|
| Hosting | Railway (autodeploy on push to main) | Runtime + static assets |
| WhatsApp | Kapso API + `@kapso/whatsapp-cloud-api` | Mensajes in/out, transcripción de audio |
| AI | Anthropic Claude Sonnet 4.6 | Agent loop + tool use |
| Transcripción fallback | Groq (Whisper v3) | Si Kapso no provee transcript |
| Sesiones | Redis/Valkey (ioredis) + in-memory Map | Historial, variables, estado |
| CRM / archival | Chatwoot | Conversaciones completas, handoff humano |

---

## Archivos que corren en producción

```
server.js              — Express HTTP server, webhook entrypoint
index.js               — WhatsApp client: sendText/Doc/Image/Buttons, downloadMedia, saveContactNote
src/
  agent.js             — Claude agent loop, executeTool()
  state.js             — getSession/saveSession/resetSession (Redis + in-memory)
  system-prompt.js     — SYSTEM_PROMPT + TOOLS definitions
  transcribe.js        — Groq fallback audio transcription
  chatwoot.js          — upsertContact, createConversation, postMessage,
                         chatwootForward, ensureChatwootConversation, archiveToChatwoot
```

---

## Flujo principal

```
Usuario WhatsApp
  ↓
Kapso webhook → POST /webhook
  ↓ HMAC-SHA256 verify
  ↓ filtro: type ∈ {text, audio, interactive}
  ↓ audio → Kapso transcript || Groq fallback → msg.type='text'
  ↓ debounce 4s (acumula mensajes rápidos)
  ↓
processMessages(phone, messages[], contactInfo)
  ↓ check session.humanMode → skip si activo
  ↓ check session.completed → skip (o reset si >24h)
  ↓ sendTyping(phone, messageId)
  ↓ chatwootForward(incoming) — mensaje del usuario visible en Chatwoot en tiempo real
  ↓ saveSession — persiste chatwootConversationId a Redis
  ↓
runAgent(phone, text, contactInfo)
  ↓ session.history.push(user_msg)
  ↓ trim a últimos 20 mensajes
  ↓ Claude API loop (max 10 rounds)
    ↓ executeTool() por cada tool_use
    ↓ until end_turn
  ↓ reply = último text block
  ↓
chatwootForward(outgoing) — respuesta del bot visible en Chatwoot antes de enviar WA
  ↓
sendText(phone, reply)
```

---

## Endpoints propios

| Endpoint | Método | Propósito | Auth |
|---|---|---|---|
| `/webhook` | POST | Mensajes Kapso | HMAC-SHA256 |
| `/chatwoot-webhook` | POST | Eventos Chatwoot | HMAC-SHA256 |
| `/health` | GET | Estado + métricas básicas | Ninguna |
| `/stats` | GET | Funnel JSON | Ninguna ⚠️ |
| `/dashboard` | GET | Funnel HTML | Ninguna ⚠️ |
| `/temario` | GET | PDF estático | Ninguna |
| `/testimonios` | GET | JPG estático | Ninguna |

---

## APIs externas consumidas

| Servicio | URL base | Credencial | Propósito |
|---|---|---|---|
| Kapso WhatsApp | `https://api.kapso.ai/meta/whatsapp` | `KAPSO_API_KEY` | Mensajes in/out |
| Kapso Platform | `https://api.kapso.ai/platform/v1` | `KAPSO_API_KEY` | Broadcasts, contact notes |
| Anthropic | SDK | `ANTHROPIC_API_KEY` | Claude agent |
| Groq | SDK | `GROQ_API_KEY` | Transcripción fallback |
| Chatwoot | `CHATWOOT_BASE_URL` | `CHATWOOT_API_TOKEN` | CRM / archival |
| Redis/Valkey | `REDIS_URL` | — | Sesiones persistentes |

---

## Tools del agente

| Tool | Acción en state | Cuándo |
|---|---|---|
| `get_whatsapp_context` | Lee contactInfo | Primera interacción |
| `get_variable(name)` | Lee session.variables | Antes de personalizar |
| `save_variable(name, value)` | Escribe session.variables | Nombre, experiencia, objetivo |
| `ask_with_buttons(body, buttons)` | Envía interactive msg | FASE 1 preguntas |
| `send_material(type)` | Envía PDF/imagen vía Kapso | temario, testimonios |
| `save_contact_note(note)` | Kapso contacts.update [ROTO] | Antes de handoff |
| `handoff_to_human(reason)` | completed=true → Chatwoot + notif Jack | Precio / inscripción / pide Jack |
| `complete_task()` | completed=true → Chatwoot | Rechazo definitivo |

---

## Sesión (estado por número)

```js
{
  history: [],          // últimos N mensajes (Redis + in-memory, HISTORY_WINDOW=20 al enviar a Claude)
  variables: {},        // datos del prospecto (nombre, fase, perfil, etc.)
  completed: false,     // true → bot silenciado (reset automático a las 24h)
  completedAt: null,    // timestamp para calcular expiración
  humanMode: false,     // true → Chatwoot tomó control, bot silenciado
  totalTokens: 0,       // acumulado de tokens (alerta si >50k)
  source: 'organic',    // atribución: tiktok, facebook_ad, instagram_ad, meta_referral
  lastReply: null,               // dedup de respuestas idénticas consecutivas
  chatwootConversationId: null,  // ID conv en Chatwoot (persiste entre mensajes del mismo lead)
}
```

---

## Forwarding a Chatwoot en tiempo real (implementado 2026-06-29)

Cada mensaje (entrante y saliente) se postea a Chatwoot en tiempo real via `chatwootForward`.
La conversación es visible desde el primer "hola" — no solo al cierre.

Triggers de Chatwoot:
1. Cada mensaje incoming → `chatwootForward(incoming)` en processMessages
2. Cada reply del bot → `chatwootForward(outgoing)` en processMessages
3. `handoff_to_human` → `archiveToChatwoot` actualiza status=open + label=handoff
4. `complete_task` → `archiveToChatwoot` actualiza status=resolved
5. Reset 24h → `archiveToChatwoot` con fallback (replay history si no hay convId)

`session.chatwootConversationId` persiste en Redis para reusar la misma conv en mensajes subsiguientes.

---

## Backlog de features

| Feature | Prioridad | Estado |
|---|---|---|
| `conversation-archival` | Alta | ✅ implementado |
| `chatwoot-realtime` | Alta | ✅ implementado — forwarding en tiempo real |
| `save_contact_note` fix (endpoint Kapso) | Media | ⏳ pendiente — confirmar endpoint real |
| `/stats /dashboard` auth básica | Media | ⏳ pendiente |
| Broadcasts | Alta | 🔴 bloqueado — Meta business verification |
| Knowledge base tool (FAQ, precios dinámicos) | Media | ⏳ pendiente |
| Multi-canal (Instagram DM, web chat) | Baja | ⏳ depende de Kapso |
| Leads DB persistente (Postgres) | Baja | ⏳ evaluar si Redis no alcanza |

---

## Visión: Agente de Marca Personal Jack Aguilar

El bot actual califica leads para GH-600. La visión es un agente multicanal que:

1. **Califica** prospectos (actual) → WhatsApp
2. **Educa** sobre la marca Jack (futuro) → responde preguntas de contenido, portfolio
3. **Nurtured** leads fríos con broadcasts programados
4. **Archiva** todo en CRM (Chatwoot) para que Jack tenga contexto completo de cada persona
5. **Escala** a otros productos/bootcamps sin reescribir — solo nuevo SYSTEM_PROMPT + TOOLS

El bot nunca cierra. Jack cierra. El bot prepara.

---

## Git / Deploy

- Rama: `main` → Railway autodeploy
- Env vars: Railway (no en repo)
- `.env` local: solo para dev/debug, no comitear
