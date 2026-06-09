import { FastifyInstance } from 'fastify';
import { handleProxy } from './utils.js';
import { BlockedEndpointService } from '../../services/blocked-endpoints-service.js';

/**
 * Catch-all proxy route that forwards any unmatched /v1/* request to Fireworks AI.
 * This MUST be registered after the specific OpenAI, Anthropic, and Responses routes
 * so that Fastify matches the more specific paths first.
 */
export async function wildcardRoutes(server: FastifyInstance) {
  server.all<{ Params: { '*': string } }>(
    '/*',
    { preHandler: server.verifyBearer },
    async (request, reply) => {
      // Rebuild endpoint: leading slash + wildcard capture (no prefix, no query)
      const path = '/' + request.params['*'];

      // Preserve query string from the raw URL so upstream receives pagination/filters
      const qIdx = request.url.indexOf('?');
      const endpoint = qIdx >= 0 ? path + request.url.slice(qIdx) : path;

      // Check if this endpoint is blocked in settings
      // Use full URL path including prefix so patterns match exactly what clients request
      const fullPath = request.url.split('?')[0];
      const blocked = await BlockedEndpointService.findByPattern(fullPath);
      if (blocked) {
        return reply.status(404).send({
          error: {
            message: blocked.message,
            type: 'error',
            code: 'NOT_FOUND',
          },
        });
      }

      return handleProxy(request, reply, endpoint);
    }
  );
}
