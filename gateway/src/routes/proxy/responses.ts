import { FastifyInstance } from 'fastify';
import { handleProxy } from './utils.js';

export async function responsesRoutes(server: FastifyInstance) {
  server.post('/responses', { preHandler: server.verifyBearer }, async (request, reply) => {
    return handleProxy(request, reply, '/responses');
  });
}
