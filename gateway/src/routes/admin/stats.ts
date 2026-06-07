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

  server.get('/analytics', { onRequest: server.authenticate }, async (request, reply) => {
    const { range = '7d', keyId, groupId, tokenId } = request.query as {
      range?: string;
      keyId?: string;
      groupId?: string;
      tokenId?: string;
    };

    const validRanges = ['24h', '7d', '30d', '90d'] as const;
    if (!validRanges.includes(range as typeof validRanges[number])) {
      return reply.status(400).send({ error: 'Invalid range' });
    }

    const typedRange = range as '24h' | '7d' | '30d' | '90d';
    const rangeMs: Record<typeof typedRange, number> = {
      '24h':  24 * 60 * 60 * 1000,
      '7d':    7 * 24 * 60 * 60 * 1000,
      '30d':  30 * 24 * 60 * 60 * 1000,
      '90d':  90 * 24 * 60 * 60 * 1000,
    };

    const startTime = new Date(Date.now() - rangeMs[typedRange]);
    const bucketFn  = typedRange === '24h' ? 'hour' : 'day';

    const emptyResponse = {
      summary: { total: 0, errors: 0, avgLatency: 0 },
      timeseries: [], byKey: [], byGroup: [], byToken: [], topEndpoints: [],
    };

    try {
      return await StatsService.getAnalytics({
        startTime,
        bucketFn,
        keyId:   keyId   || undefined,
        groupId: groupId || undefined,
        tokenId: tokenId || undefined,
      });
    } catch (err) {
      server.log.error(err, 'getAnalytics failed');
      return emptyResponse;
    }
  });
}
