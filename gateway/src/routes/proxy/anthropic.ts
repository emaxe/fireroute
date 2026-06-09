import { FastifyInstance } from 'fastify';
import { handleProxy } from './utils.js';

/**
 * Anthropic-compatible route (/messages).
 * Uses the same shared handleProxy as the OpenAI routes so that stats,
 * key rotation, and error handling are uniform across all proxy endpoints.
 */
export async function anthropicRoutes(server: FastifyInstance) {
  server.post('/messages', { preHandler: server.verifyBearer }, async (request, reply) => {
    return handleProxy(request, reply, '/messages');
  });
}
