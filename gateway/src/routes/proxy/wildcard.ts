import { FastifyInstance } from 'fastify';
import { handleProxy } from './utils.js';

/**
 * Catch-all proxy route that forwards any unmatched /v1/* request to Fireworks AI.
 * This MUST be registered after the specific OpenAI, Anthropic, and Responses routes
 * so that Fastify matches the more specific paths first.
 */
export async function wildcardRoutes(server: FastifyInstance) {
  server.all<{ Params: { '*': string } }>(
    '/*',
    { onRequest: server.verifyBearer },
    async (request, reply) => {
      // Rebuild endpoint: leading slash + wildcard capture (no prefix, no query)
      const path = '/' + request.params['*'];

      // Preserve query string from the raw URL so upstream receives pagination/filters
      const qIdx = request.url.indexOf('?');
      const endpoint = qIdx >= 0 ? path + request.url.slice(qIdx) : path;

      // Honour optional group field in JSON body (same pattern as openaiRoutes)
      const body = request.body as { group?: string } | null;
      const groupId = body?.group || 'default';

      return handleProxy(request, reply, endpoint, groupId);
    }
  );
}
