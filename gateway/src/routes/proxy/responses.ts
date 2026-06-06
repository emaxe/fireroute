import { FastifyInstance } from 'fastify';
import { handleProxy } from './utils.js';

export async function responsesRoutes(server: FastifyInstance) {
  server.post('/responses', { onRequest: server.verifyBearer }, async (request, reply) => {
    const body = request.body as { group?: string };
    const groupId = body.group || 'default';
    return handleProxy(request, reply, '/responses', groupId);
  });
}
