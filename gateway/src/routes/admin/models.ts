import { FastifyInstance } from 'fastify';
import { ModelManager } from '../../services/model-manager.js';

export async function modelsRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async () => {
    return ModelManager.listMergedModels();
  });

  server.post('/', { onRequest: server.authenticate }, async (request, reply) => {
    const { modelId, name, type, source, active } = request.body as {
      modelId: string;
      name?: string;
      type?: string;
      source?: string;
      active?: boolean;
    };
    if (!modelId) {
      return reply.status(400).send({ error: 'modelId is required' });
    }
    try {
      return ModelManager.createModel({ modelId, name, type, source, active });
    } catch (err: any) {
      if (err.code === 'P2002') {
        return reply.status(409).send({ error: 'Model already exists' });
      }
      throw err;
    }
  });

  server.put('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, type, active, modelId } = request.body as {
      name?: string;
      type?: string;
      active?: boolean;
      modelId?: string;
    };
    // If id is missing or 'null', create a local record (used for toggling upstream models)
    if (!id || id === 'null' || id === 'undefined') {
      if (!modelId) {
        return reply.status(400).send({ error: 'modelId is required when id is not set' });
      }
      return ModelManager.createModel({
        modelId,
        name,
        type,
        source: 'upstream',
        active: active ?? true,
      });
    }
    return ModelManager.updateModel(id, { name, type, active });
  });

  server.get('/:id', { onRequest: server.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return ModelManager.getModelById(id);
  });

  server.delete('/:id', { onRequest: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!id || id === 'null' || id === 'undefined') {
      return reply.status(400).send({ error: 'Cannot delete upstream model without a local record' });
    }
    await ModelManager.deleteModel(id);
    return reply.status(204).send();
  });
}
