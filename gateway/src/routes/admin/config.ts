import { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import os from 'os';

function getExternalIp(): string | undefined {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return undefined;
}

/**
 * Public config endpoint for the admin UI.
 *
 * Returns the external gateway URL so the "API Instructions" page can display
 * the real address clients should use, falling back to auto-detected external IP or localhost.
 */
export async function configRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async (_request, reply) => {
    // Priority: explicit env → auto-detected external IP → empty (frontend falls back to origin)
    const explicit = config.GATEWAY_PUBLIC_URL?.trim();
    const autoIp = getExternalIp();
    const fallback = autoIp ? `http://${autoIp}:${config.GATEWAY_PORT}` : '';
    const publicUrl = explicit || fallback;
    return reply.send({
      gatewayPublicUrl: publicUrl,
    });
  });
}
