import { FastifyInstance } from 'fastify';
import { handleProxy } from './utils.js';

/**
 * OpenAI Responses API route (/responses).
 * Forwards to the upstream Fireworks endpoint through the shared proxy handler.
 */
export async function responsesRoutes(server: FastifyInstance) {
  server.post('/responses', { preHandler: server.verifyBearer }, async (request, reply) => {
    return handleProxy(request, reply, '/responses');
  });
}
