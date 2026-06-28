import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, TOOLS } from './system-prompt.js';
import { getSession } from './state.js';
import { upsertContact, createConversation, postMessage } from './chatwoot.js';
import { sendText, sendDocument } from '../index.js';

const anthropic = new Anthropic();
const HISTORY_WINDOW = 20;

export async function runAgent(phone, userText, contactInfo) {
  const session = getSession(phone);
  const startTime = Date.now();
  const toolsUsed = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let reply = null;

  session.history.push({ role: 'user', content: userText });

  // Send Claude only the last HISTORY_WINDOW messages, starting on a user turn
  let trimmed = session.history.slice(-HISTORY_WINDOW);
  const firstUser = trimmed.findIndex(m => m.role === 'user');
  if (firstUser > 0) trimmed = trimmed.slice(firstUser);
  const messages = trimmed;

  // Agent loop — handles tool use until end_turn
  const MAX_TOOL_ROUNDS = 10;
  let rounds = 0;
  while (true) {
    if (++rounds > MAX_TOOL_ROUNDS) {
      console.error(`[agent] ${phone}: max tool rounds (${MAX_TOOL_ROUNDS}) exceeded — breaking`);
      break;
    }
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    // Sensor 1+2: accumulate tokens per round
    totalInputTokens += response.usage?.input_tokens || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;

    messages.push({ role: 'assistant', content: response.content });
    session.history.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('') || null;
      break;
    }

    if (response.stop_reason !== 'tool_use') break;

    response.content.filter(b => b.type === 'tool_use').forEach(b => toolsUsed.push(b.name));

    const toolResults = await Promise.all(
      response.content
        .filter(b => b.type === 'tool_use')
        .map(async b => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: String(await executeTool(b.name, b.input, phone, contactInfo)),
        }))
    );

    messages.push({ role: 'user', content: toolResults });
    session.history.push({ role: 'user', content: toolResults });
  }

  // Sensor 1: agent_trace
  console.log(JSON.stringify({
    type: 'agent_trace',
    phone_suffix: phone.slice(-4),
    rounds,
    tools_called: toolsUsed,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    duration_ms: Date.now() - startTime,
  }));

  // Sensor 2: cost tracking per session (~$0.003/1K tokens Sonnet)
  session.totalTokens = (session.totalTokens || 0) + totalInputTokens + totalOutputTokens;
  if (session.totalTokens > 50_000) {
    console.log(JSON.stringify({ type: 'cost_alert', phone_suffix: phone.slice(-4), tokens: session.totalTokens }));
  }

  return reply;
}

async function executeTool(name, input, phone, contactInfo) {
  const session = getSession(phone);

  switch (name) {
    case 'get_whatsapp_context':
      return JSON.stringify({
        contact_name: contactInfo?.contact_name || contactInfo?.profile?.name || 'Usuario',
        phone_number: phone,
      });

    case 'get_variable':
      return JSON.stringify(session.variables[input.name] ?? null);

    case 'save_variable':
      session.variables[input.name] = input.value;
      return 'ok';

    case 'handoff_to_human': {
      session.completed = true;
      session.completedAt = Date.now();
      console.log(`[HANDOFF] ${phone}: ${input.reason}`);

      const jackPhone = process.env.JACK_PHONE_NUMBER;
      if (jackPhone) {
        const name = session.variables['nombre'] || session.variables['name'] || contactInfo?.contact_name || phone;
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
        try {
          await sendText(jackPhone, notification);
        } catch (err) {
          console.warn(`[HANDOFF] notify Jack failed: ${err.message}`);
        }
      }

      try {
        const name = session.variables['nombre'] || session.variables['name'] || phone;
        const contactId = await upsertContact(phone, name);
        const conversationId = await createConversation(contactId);
        for (const msg of session.history) {
          const text = extractText(msg.content);
          if (!text) continue;
          await postMessage(conversationId, text, msg.role === 'user' ? 'incoming' : 'outgoing');
        }
        console.log(`[CHATWOOT] ${phone} → conversation ${conversationId}`);
      } catch (err) {
        console.error(`[CHATWOOT] handoff failed: ${err.message}`);
      }

      return 'handoff_initiated';
    }

    case 'send_material': {
      const MATERIALS = {
        temario: { url: 'https://agent-kapso-production.up.railway.app/temario', filename: 'Temario GH-600.pdf', caption: 'Temario oficial — Agentic AI Developer GH-600' },
      };
      const m = MATERIALS[input.type];
      if (!m) return `unknown_material: ${input.type}`;
      await sendDocument(phone, m.url, m.filename, m.caption);
      return 'material_sent';
    }

    case 'complete_task':
      session.completed = true;
      session.completedAt = Date.now();
      return 'completed';

    default:
      return `unknown_tool: ${name}`;
  }
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
  return '';
}
