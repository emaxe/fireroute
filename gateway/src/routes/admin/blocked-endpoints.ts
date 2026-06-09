import { FastifyInstance } from 'fastify';
import { BlockedEndpointService } from '../../services/blocked-endpoints-service.js';

export async function blockedEndpointsRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async () => {
    return BlockedEndpointService.getAll();
  });

  server.post('/', { onRequest: server.authenticate }, async (request, reply) => {
    const { pattern, message } = request.body as { pattern: string; message?: string };
    if (!pattern || typeof pattern !== 'string' || !pattern.startsWith('/')) {
      return reply.status(400).send({ error: 'Pattern must be a valid path starting with /' });
    }
    try {
      const created = await BlockedEndpointService.create({ pattern, message });
      return reply.status(201).send(created);
    } catch (err: any) {
      if (err.code === 'P2002') {
        return reply.status(409).send({ error: 'Pattern already exists' });
      }
      throw err;
    }
  });

  server.patch('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { pattern, message, active } = request.body as {
      pattern?: string;
      message?: string;
      active?: boolean;
    };
    try {
      const updated = await BlockedEndpointService.update(id, { pattern, message, active });
      return reply.status(200).send(updated);
    } catch (err: any) {
      if (err.code === 'P2002') {
        return reply.status(409).send({ error: 'Pattern already exists' });
      }
      if (err.code === 'P2025') {
        return reply.status(404).send({ error: 'Not found' });
      }
      throw err;
    }
  });

  server.delete('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await BlockedEndpointService.delete(id);
      return reply.status(204).send();
    } catch (err: any) {
      if (err.code === 'P2025') {
        return reply.status(404).send({ error: 'Not found' });
      }
      throw err;
    }
  });
}
