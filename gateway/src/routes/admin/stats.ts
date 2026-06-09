import { FastifyInstance } from 'fastify';
import { StatsService } from '../../services/stats-service.js';

export async function statsRoutes(server: FastifyInstance) {
  server.get('/', { onRequest: server.authenticate }, async () => {
    return StatsService.getStats();
  });

  server.get('/logs', { onRequest: server.authenticate }, async (request) => {
    const q = request.query as Record<string, string>;
    const limit = Math.min(parseInt(q.limit || '50', 10), 500);
    const offset = parseInt(q.offset || '0', 10);
    return StatsService.getRecentLogs({
      limit,
      offset,
      endpoint: q.endpoint || undefined,
      status: q.status !== undefined ? parseInt(q.status, 10) : undefined,
      keyId: q.keyId || undefined,
      groupId: q.groupId || undefined,
      tokenId: q.tokenId || undefined,
      search: q.search || undefined,
      sortBy: q.sortBy || 'createdAt',
      sortOrder: (q.sortOrder === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
    });
  });

  server.get('/analytics', { onRequest: server.authenticate }, async (request, reply) => {
    const { range = '7d', keyId, groupId, tokenId } = request.query as {
      range?: string;
      keyId?: string;
      groupId?: string;
      tokenId?: string;
    };

    const validRanges = ['today', '24h', '7d', '30d', '90d'] as const;
    if (!validRanges.includes(range as typeof validRanges[number])) {
      return reply.status(400).send({ error: 'Invalid range' });
    }

    const typedRange = range as 'today' | '24h' | '7d' | '30d' | '90d';
    let startTime: Date;
    let bucketFn: 'hour' | 'day';

    if (typedRange === 'today') {
      const now = new Date();
      startTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      bucketFn = 'hour';
    } else {
      const rangeMs: Record<'24h' | '7d' | '30d' | '90d', number> = {
        '24h':  24 * 60 * 60 * 1000,
        '7d':    7 * 24 * 60 * 60 * 1000,
        '30d':  30 * 24 * 60 * 60 * 1000,
        '90d':  90 * 24 * 60 * 60 * 1000,
      };
      startTime = new Date(Date.now() - rangeMs[typedRange]);
      bucketFn = typedRange === '24h' ? 'hour' : 'day';
    }

    const emptyResponse = {
      summary: { total: 0, errors: 0, avgLatency: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      timeseries: [], byKey: [], byGroup: [], byToken: [], topEndpoints: [],
      imageGeneration: { summary: { total: 0, errors: 0, avgLatency: 0 }, timeseries: [] },
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
