import { FastifyInstance } from 'fastify';
import { handleProxy } from './utils.js';

export async function anthropicRoutes(server: FastifyInstance) {
  server.post('/messages', { preHandler: server.verifyBearer }, async (request, reply) => {
    return handleProxy(request, reply, '/messages');
  });
}
