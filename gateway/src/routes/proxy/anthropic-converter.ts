import { randomUUID } from 'crypto';

/**
 * Convert Anthropic API request format to OpenAI-compatible format.
 *
 * Anthropic → OpenAI differences handled:
 *  - system[] blocks → system message in messages[]
 *  - messages[].content[] arrays → string content
 *  - tools[].type="web_search_..." and other built-in Anthropic tools are stripped
 *    because Fireworks/Qwen doesn't support them; only custom tools with input_schema are kept
 *  - tool_choice referencing a stripped tool → reset to 'auto'
 *  - metadata / output_config removed (Anthropic-only)
 */
export function convertAnthropicToOpenAI(body: any): any {
  const result: any = {
    model: body.model,
    messages: [],
    stream: body.stream,
  };

  // --- system ---
  if (body.system) {
    const systemTexts: string[] = [];
    if (Array.isArray(body.system)) {
      for (const block of body.system) {
        if (block.type === 'text' && block.text) {
          systemTexts.push(block.text);
        }
      }
    } else if (typeof body.system === 'string') {
      systemTexts.push(body.system);
    }
    if (systemTexts.length > 0) {
      result.messages.push({ role: 'system', content: systemTexts.join('\n') });
    }
  }

  // --- messages ---
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      const converted: any = { role: msg.role };
      if (Array.isArray(msg.content)) {
        const blocks: any[] = [];
        for (const block of msg.content) {
          if (block.type === 'text' && block.text !== undefined) {
            blocks.push({ type: 'text', text: block.text });
          }
          // Vision / image blocks are kept as-is because OpenAI supports the same shape
          else if (block.type === 'image' && block.source) {
            blocks.push(block);
          }
          // Convert Anthropic tool_use and tool_result blocks to plain text
          // so OpenAI-compatible upstream models can still consume the context
          else if (block.type === 'tool_use') {
            blocks.push({
              type: 'text',
              text: `[Tool use: ${block.name || 'unknown'}]\n${typeof block.input === 'object' ? JSON.stringify(block.input, null, 2) : String(block.input ?? '')}`,
            });
          }
          else if (block.type === 'tool_result') {
            const content = typeof block.content === 'string'
              ? block.content
              : JSON.stringify(block.content, null, 2);
            blocks.push({
              type: 'text',
              text: `[Tool result: ${block.tool_use_id || 'unknown'}]\n${content}`,
            });
          }
        }
        // Keep structured content if original was structured; fallback to empty string
        converted.content = blocks.length > 0 ? blocks : '';
      } else if (typeof msg.content === 'string') {
        converted.content = msg.content;
      } else {
        converted.content = '';
      }
      result.messages.push(converted);
    }
  }

  // --- tools ---
  // Strip Anthropic built-in tools (web_search, computer, etc.) that don't have input_schema.
  // Fireworks/Qwen only supports custom function tools with a JSON schema.
  const supportedTools = Array.isArray(body.tools)
    ? body.tools.filter((tool: any) => {
        // A supported tool must have an input schema (custom tool) or already be in OpenAI function shape
        return !!(
          tool.input_schema ||
          tool.parameters ||
          tool.function?.parameters ||
          (tool.type === 'function' && tool.function)
        );
      })
    : [];

  if (supportedTools.length > 0) {
    result.tools = supportedTools.map((tool: any) => ({
      type: 'function',
      function: {
        name: tool.name || tool.function?.name || 'unknown',
        description: tool.description || tool.function?.description || '',
        parameters: tool.input_schema || tool.parameters || tool.function?.parameters || {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    }));
  }

  // --- tool_choice ---
  if (body.tool_choice) {
    const chosenName = body.tool_choice.name;
    const chosenExists = chosenName
      ? supportedTools.some((t: any) => (t.name || t.function?.name) === chosenName)
      : true;

    if (body.tool_choice.type === 'tool' && chosenExists) {
      result.tool_choice = {
        type: 'function',
        function: { name: body.tool_choice.name },
      };
    } else if (body.tool_choice.type === 'auto') {
      result.tool_choice = 'auto';
    } else if (body.tool_choice.type === 'any') {
      result.tool_choice = 'auto'; // OpenAI doesn't have 'any', map to auto
    } else if (body.tool_choice.type === 'tool' && !chosenExists) {
      // Referenced tool was stripped (e.g. web_search), fall back to auto
      result.tool_choice = 'auto';
    } else {
      result.tool_choice = body.tool_choice;
    }
  }

  // Copy common OpenAI fields
  if (body.max_tokens !== undefined) result.max_tokens = body.max_tokens;
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.top_k !== undefined) result.top_k = body.top_k;
  if (body.stop !== undefined) result.stop = body.stop;
  if (body.seed !== undefined) result.seed = body.seed;

  return result;
}

/** Map OpenAI finish_reason to Anthropic stop_reason. */
function mapFinishReason(reason: string | null): string | null {
  if (reason === 'stop') return 'end_turn';
  if (reason === 'length') return 'max_tokens';
  if (reason === 'tool_calls') return 'tool_use';
  return null;
}

/**
 * Convert OpenAI non-streaming JSON response to Anthropic message format.
 */
export function convertOpenAIToAnthropic(body: any, model: string): any {
  const choice = body.choices?.[0];
  const usage = body.usage || {};

  return {
    id: `msg_${randomUUID().replace(/-/g, '')}`,
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: choice?.message?.content || '',
      },
    ],
    model,
    stop_reason: mapFinishReason(choice?.finish_reason || null),
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
    },
  };
}

/** Format an Anthropic SSE event string. */
export function sseEvent(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Convert a single OpenAI SSE chunk into Anthropic SSE text.
 * Returns the Anthropic text (may be empty) and signals when stream is done.
 */
export function convertOpenAISSEChunkToAnthropic(
  text: string,
  state: {
    msgId: string;
    model: string;
    started: boolean;
    outputTokens: number;
    done: boolean;
  }
): string {
  let result = '';
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) continue;

    const dataStr = trimmed.slice(6);
    if (dataStr === '[DONE]') {
      if (!state.started) {
        state.started = true;
        result +=
          sseEvent('message_start', {
            type: 'message_start',
            message: {
              id: state.msgId,
              type: 'message',
              role: 'assistant',
              content: [],
              model: state.model,
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          }) +
          sseEvent('content_block_start', {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          });
      }
      if (!state.done) {
        result +=
          sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }) +
          sseEvent('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: state.outputTokens },
          }) +
          sseEvent('message_stop', { type: 'message_stop' });
        state.done = true;
      }
      continue;
    }

    try {
      const data = JSON.parse(dataStr);
      const choice = data.choices?.[0];
      const delta = choice?.delta;

      if (!state.started) {
        state.started = true;
        result +=
          sseEvent('message_start', {
            type: 'message_start',
            message: {
              id: state.msgId,
              type: 'message',
              role: 'assistant',
              content: [],
              model: state.model,
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          }) +
          sseEvent('content_block_start', {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          }) +
          sseEvent('ping', { type: 'ping' });
      }

      if (delta?.content) {
        state.outputTokens += 1;
        result +=
          sseEvent('content_block_delta', {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: delta.content },
          });
      }

      if (choice?.finish_reason && !state.done) {
        const stopReason = mapFinishReason(choice.finish_reason);
        result +=
          sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }) +
          sseEvent('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: { output_tokens: state.outputTokens },
          }) +
          sseEvent('message_stop', { type: 'message_stop' });
        state.done = true;
      }
    } catch {
      // skip malformed JSON
    }
  }

  return result;
}
