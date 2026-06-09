import { FastifyInstance } from 'fastify';
import { config } from '../../config.js';

export async function configRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async (_request, reply) => {
    // Derive a sensible public URL: explicit env → admin request origin → localhost fallback
    const publicUrl = config.GATEWAY_PUBLIC_URL || '';
    return reply.send({
      gatewayPublicUrl: publicUrl,
    });
  });
}
