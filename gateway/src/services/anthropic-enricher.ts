/**
 * AnthropicEnricher — intercepts built-in Anthropic tools that Fireworks does not support
 * (e.g. web_search_preview) and executes them locally, injecting the results back
 * as tool_result blocks before the request reaches the upstream LLM.
 */

import { WebSearchService, SearchResult } from './web-search-service.js';
import { GatewayConfigService } from './gateway-config-service.js';

const WEB_SEARCH_ENABLED_KEY = 'web_search_preview_enabled';

interface ToolUseBlock {
  id: string;
  name: string;
  input: any;
}

export const AnthropicEnricher = {
  /**
   * Main entrypoint: inspect messages for unsupported tool_use blocks,
   * execute the tools locally, and return a body enriched with tool_results.
   */
  async enrich(body: any): Promise<any> {
    if (!body || typeof body !== 'object') return body;
    if (!Array.isArray(body.messages)) return body;

    const enabled = await GatewayConfigService.getBoolean(WEB_SEARCH_ENABLED_KEY, false);
    if (!enabled) return body;

    const toolCalls = this.extractWebSearchToolCalls(body.messages);
    if (toolCalls.length === 0) return body;

    // Execute searches in parallel
    const searchResults = await Promise.all(
      toolCalls.map(async (tc) => {
        const query = tc.input?.query || tc.input?.search_query || '';
        const results = await WebSearchService.search(query);
        return { toolUseId: tc.id, results };
      })
    );

    // Inject tool_result blocks into the messages array
    const enrichedMessages = this.injectToolResults(body.messages, searchResults);

    // Strip web_search_preview from tools list
    const cleanedTools = Array.isArray(body.tools)
      ? body.tools.filter((t: any) => t.name !== 'web_search_preview')
      : body.tools;

    // Fix tool_choice if it references the stripped tool
    let cleanedToolChoice = body.tool_choice;
    if (body.tool_choice?.name === 'web_search_preview') {
      cleanedToolChoice = 'auto';
    }

    return {
      ...body,
      messages: enrichedMessages,
      tools: cleanedTools?.length > 0 ? cleanedTools : undefined,
      tool_choice: cleanedToolChoice,
    };
  },

  /**
   * Find all tool_use blocks with name === 'web_search_preview' inside the
   * messages[].content[] arrays.
   */
  extractWebSearchToolCalls(messages: any[]): ToolUseBlock[] {
    const calls: ToolUseBlock[] = [];

    for (const msg of messages) {
      if (!Array.isArray(msg.content)) continue;

      for (const block of msg.content) {
        if (block?.type === 'tool_use' && block?.name === 'web_search_preview') {
          calls.push({
            id: block.id || block.tool_use_id || `search_${calls.length}`,
            name: block.name,
            input: block.input || {},
          });
        }
      }
    }

    return calls;
  },

  /**
   * Insert a new 'user' message containing tool_result blocks immediately after
   * the last assistant message that contained the matching tool_use blocks.
   */
  injectToolResults(
    messages: any[],
    searchResults: { toolUseId: string; results: SearchResult[] }[]
  ): any[] {
    // Find the last index of an assistant message that contained a tool_use
    let lastAssistantIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        if (msg.content.some((b: any) => b.type === 'tool_use')) {
          lastAssistantIndex = i;
          break;
        }
      }
    }

    if (lastAssistantIndex === -1) {
      // No assistant message with tool_use found; append at end
      lastAssistantIndex = messages.length - 1;
    }

    const toolResultBlocks = searchResults.map((sr) => ({
      type: 'tool_result',
      tool_use_id: sr.toolUseId,
      content: WebSearchService.formatResults(sr.results),
    }));

    const resultMessage = {
      role: 'user',
      content: toolResultBlocks,
    };

    const out = [...messages];
    out.splice(lastAssistantIndex + 1, 0, resultMessage);
    return out;
  },
};
