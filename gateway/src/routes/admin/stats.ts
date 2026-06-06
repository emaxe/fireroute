import { FastifyInstance } from 'fastify';
import { StatsService } from '../../services/stats-service.js';

export async function statsRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async () => {
    return StatsService.getStats();
  });

  server.get('/logs', { onRequest: server.authenticate }, async (request) => {
    const { limit = '100' } = request.query as { limit?: string };
    return StatsService.getRecentLogs(parseInt(limit, 10));
  });
}
