import { FastifyInstance } from 'fastify';
import { GatewayConfigService } from '../../services/gateway-config-service.js';

export async function gatewayConfigRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async (_request, reply) => {
    const rows = await GatewayConfigService.list();
    return reply.send(rows);
  });

  server.put('/:key', { onRequest: server.authenticate }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const { value } = request.body as { value: string };
    if (typeof value !== 'string') {
      return reply.status(400).send({ error: 'value must be a string' });
    }
    await GatewayConfigService.set(key, value);
    return reply.send({ key, value });
  });

  server.delete('/:key', { onRequest: server.authenticate }, async (request, reply) => {
    const { key } = request.params as { key: string };
    await GatewayConfigService.delete(key);
    return reply.status(204).send();
  });
}
