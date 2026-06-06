import { FastifyInstance } from 'fastify';
import { UserManager } from '../../services/user-manager.js';

export async function usersRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async () => {
    return UserManager.listUsers();
  });

  server.post('/', { onRequest: server.authenticate }, async (request, reply) => {
    const { email, password, name } = request.body as {
      email: string;
      password: string;
      name?: string;
    };
    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }
    return UserManager.createUser({ email, password, name });
  });

  server.delete('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await UserManager.deleteUser(id);
    return reply.status(204).send();
  });

  server.post('/:id/tokens', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = request.body as { name?: string };
    return UserManager.createServiceToken(id, name);
  });

  server.delete('/tokens/:tokenId', { onRequest: server.authenticate }, async (request, reply) => {
    const { tokenId } = request.params as { tokenId: string };
    await UserManager.revokeToken(tokenId);
    return reply.status(204).send();
  });
}
