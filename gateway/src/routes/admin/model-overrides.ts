import { FastifyInstance } from 'fastify';
import { ModelOverrideManager } from '../../services/model-override-manager.js';

export async function modelOverrideRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async () => {
    return ModelOverrideManager.listOverrides();
  });

  server.post('/', { onRequest: server.authenticate }, async (request, reply) => {
    const { fromModel, toModel, active } = request.body as {
      fromModel: string;
      toModel: string;
      active?: boolean;
    };
    if (!fromModel || !toModel) {
      return reply.status(400).send({ error: 'fromModel and toModel are required' });
    }
    try {
      return ModelOverrideManager.createOverride({ fromModel, toModel, active });
    } catch (err: any) {
      if (err.code === 'P2002') {
        return reply.status(409).send({ error: 'Override for this fromModel already exists' });
      }
      throw err;
    }
  });

  server.put('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { toModel, active } = request.body as { toModel?: string; active?: boolean };
    return ModelOverrideManager.updateOverride(id, { toModel, active });
  });

  server.delete('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await ModelOverrideManager.deleteOverride(id);
    return reply.status(204).send();
  });
}
