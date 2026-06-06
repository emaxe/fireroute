import { FastifyInstance } from 'fastify';
import { TokenManager } from '../../services/token-manager.js';

export async function tokensRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async () => {
    return TokenManager.listTokens();
  });

  server.post('/', { onRequest: server.authenticate }, async (request, reply) => {
    const { name } = request.body as { name?: string };
    return TokenManager.createToken(name);
  });

  server.patch('/:id/revoke', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await TokenManager.revokeToken(id);
    return reply.status(204).send();
  });

  server.delete('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await TokenManager.deleteToken(id);
    return reply.status(204).send();
  });
}
