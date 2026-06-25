import { FastifyInstance } from 'fastify';
import { KeyManager } from '../../services/key-manager.js';

export async function groupsRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async () => {
    return KeyManager.listGroups();
  });

  server.post('/', { onRequest: server.authenticate }, async (request, reply) => {
    const { name, description } = request.body as { name: string; description?: string };
    if (!name) {
      return reply.status(400).send({ error: 'Name is required' });
    }
    return KeyManager.createGroup({ name, description });
  });

  server.patch('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, description, rotationMode } = request.body as { name?: string; description?: string; rotationMode?: string };
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (rotationMode !== undefined) updateData.rotationMode = rotationMode;
    return KeyManager.updateGroup(id, updateData);
  });

  server.delete('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await KeyManager.deleteGroup(id);
    return reply.status(204).send();
  });

  server.post('/:id/keys', { onRequest: server.authenticate }, async (request, reply) => {
    const { id: groupId } = request.params as { id: string };
    const { keyId } = request.body as { keyId: string };
    if (!keyId) {
      return reply.status(400).send({ error: 'keyId is required' });
    }
    return KeyManager.assignKeyToGroup(groupId, keyId);
  });

  server.delete('/:id/keys/:keyId', { onRequest: server.authenticate }, async (request, reply) => {
    const { id: groupId, keyId } = request.params as { id: string; keyId: string };
    await KeyManager.removeKeyFromGroup(groupId, keyId);
    return reply.status(204).send();
  });
}
