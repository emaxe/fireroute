import { FastifyInstance } from 'fastify';
import { handleProxy } from './utils.js';

export async function openaiRoutes(server: FastifyInstance) {
  server.get('/models', { onRequest: server.verifyBearer }, async (request, reply) => {
    return handleProxy(request, reply, '/models', 'default');
  });

  server.post('/chat/completions', { onRequest: server.verifyBearer }, async (request, reply) => {
    const body = request.body as { group?: string };
    const groupId = body.group || 'default';
    return handleProxy(request, reply, '/chat/completions', groupId);
  });
}
