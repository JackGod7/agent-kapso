import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, TOOLS } from './system-prompt.js';
import { getSession } from './state.js';
import { upsertContact, createConversation, postMessage } from './chatwoot.js';

const anthropic = new Anthropic();

export async function runAgent(phone, userText, contactInfo) {
  const session = getSession(phone);

  session.history.push({ role: 'user', content: userText });

  const messages = [...session.history];

  // Agent loop — handles tool use until end_turn
  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });
    session.history.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      return response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('') || null;
    }

    if (response.stop_reason !== 'tool_use') break;

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

  return null;
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

    case 'handoff_to_human':
      session.completed = true;
      console.log(`[HANDOFF] ${phone}: ${input.reason}`);
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

    case 'complete_task':
      session.completed = true;
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
