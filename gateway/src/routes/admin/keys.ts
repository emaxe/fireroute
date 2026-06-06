import { FastifyInstance } from 'fastify';
import { KeyManager } from '../../services/key-manager.js';

export async function keysRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async () => {
    return KeyManager.listKeys();
  });

  server.post('/', { onRequest: server.authenticate }, async (request, reply) => {
    const { name, key } = request.body as { name: string; key: string };
    if (!name || !key) {
      return reply.status(400).send({ error: 'Name and key are required' });
    }
    return KeyManager.createKey({ name, key });
  });

  server.delete('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await KeyManager.deleteKey(id);
      return reply.status(204).send();
    } catch (err: any) {
      if (err.message?.includes('Cannot delete key assigned to group')) {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }
  });

  server.patch('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { active } = request.body as { active: boolean };
    return KeyManager.toggleKey(id, active);
  });
}
