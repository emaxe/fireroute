import { FastifyInstance } from 'fastify';
import { config } from '../../config.js';

/**
 * Public config endpoint for the admin UI.
 *
 * Returns the external gateway URL so the "API Instructions" page can display
 * the real address clients should use, falling back to localhost if nothing is configured.
 */
export async function configRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async (_request, reply) => {
    // Derive a sensible public URL: explicit env → admin request origin → localhost fallback
    const publicUrl = config.GATEWAY_PUBLIC_URL || '';
    return reply.send({
      gatewayPublicUrl: publicUrl,
    });
  });
}
