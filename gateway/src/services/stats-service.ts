import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export const StatsService = {
  async log(data: {
    tokenId?: string;
    keyId?: string;
    groupId?: string;
    endpoint: string;
    status: number;
    latencyMs: number;
    error?: string;
  }) {
    return prisma.requestLog.create({ data });
  },

  async getStats() {
    const total = await prisma.requestLog.count();
    const errors = await prisma.requestLog.count({
      where: { status: { gte: 400 } },
    });
    const avgLatency = await prisma.requestLog.aggregate({
      _avg: { latencyMs: true },
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await prisma.requestLog.count({
      where: { createdAt: { gte: today } },
    });
    return {
      total,
      errors,
      avgLatency: Math.round(avgLatency._avg.latencyMs || 0),
      todayCount,
    };
  },

  async getRecentLogs(limit = 100) {
    return prisma.requestLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        token: { select: { name: true } },
        key: { select: { name: true } },
      },
    });
  },

  async getAnalytics(params: {
    startTime: Date;
    bucketFn: 'hour' | 'day';
    keyId?: string;
    groupId?: string;
    tokenId?: string;
  }) {
    const { startTime, bucketFn, keyId, groupId, tokenId } = params;

    // Shared time + optional filter conditions (re-used by each query)
    const baseConditions = (): Prisma.Sql[] => {
      const c: Prisma.Sql[] = [Prisma.sql`created_at >= ${startTime}`];
      if (keyId)   c.push(Prisma.sql`key_id   = ${keyId}`);
      if (groupId) c.push(Prisma.sql`group_id = ${groupId}`);
      if (tokenId) c.push(Prisma.sql`token_id = ${tokenId}`);
      return c;
    };

    const bucketExpr = bucketFn === 'hour'
      ? Prisma.sql`date_trunc('hour', created_at)`
      : Prisma.sql`date_trunc('day',  created_at)`;

    // Helper to convert bigint → number
    const n = (v: bigint | number) => Number(v);

    // ── Summary ──────────────────────────────────────────────────────────────
    const where = Prisma.join(baseConditions(), ' AND ', 'WHERE ', '');

    const [summaryRow] = await prisma.$queryRaw<
      { total: bigint; errors: bigint; avg_latency: number }[]
    >`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(CASE WHEN status >= 400 THEN 1 END)            AS errors,
        COALESCE(AVG(latency_ms)::float8, 0)                 AS avg_latency
      FROM request_logs
      ${where}
    `;

    // ── Timeseries ────────────────────────────────────────────────────────────
    const timeseriesRows = await prisma.$queryRaw<
      { time: Date; requests: bigint; errors: bigint; avg_latency: number }[]
    >`
      SELECT
        ${bucketExpr}                                         AS time,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN status >= 400 THEN 1 END)            AS errors,
        COALESCE(AVG(latency_ms)::float8, 0)                 AS avg_latency
      FROM request_logs
      ${where}
      GROUP BY ${bucketExpr}
      ORDER BY time ASC
    `;

    // ── byKey (only rows where key_id IS NOT NULL) ────────────────────────────
    const keyConditions = [...baseConditions(), Prisma.sql`r.key_id IS NOT NULL`];
    const byKeyRows = await prisma.$queryRaw<
      { id: string; name: string; requests: bigint; errors: bigint; avg_latency: number }[]
    >`
      SELECT
        r.key_id                                              AS id,
        COALESCE(ak.name, r.key_id)                          AS name,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN r.status >= 400 THEN 1 END)          AS errors,
        COALESCE(AVG(r.latency_ms)::float8, 0)               AS avg_latency
      FROM request_logs r
      LEFT JOIN api_keys ak ON ak.id = r.key_id
      ${Prisma.join(keyConditions, ' AND ', 'WHERE ', '')}
      GROUP BY r.key_id, ak.name
      ORDER BY requests DESC
      LIMIT 10
    `;

    // ── byGroup ───────────────────────────────────────────────────────────────
    const groupConditions = [...baseConditions(), Prisma.sql`r.group_id IS NOT NULL`];
    const byGroupRows = await prisma.$queryRaw<
      { id: string; name: string; requests: bigint; errors: bigint; avg_latency: number }[]
    >`
      SELECT
        r.group_id                                            AS id,
        COALESCE(kg.name, r.group_id)                        AS name,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN r.status >= 400 THEN 1 END)          AS errors,
        COALESCE(AVG(r.latency_ms)::float8, 0)               AS avg_latency
      FROM request_logs r
      LEFT JOIN LATERAL (
        SELECT name FROM key_groups
        WHERE id = r.group_id OR name = r.group_id
        LIMIT 1
      ) kg ON true
      ${Prisma.join(groupConditions, ' AND ', 'WHERE ', '')}
      GROUP BY r.group_id, kg.name
      ORDER BY requests DESC
      LIMIT 10
    `;

    // ── byToken ───────────────────────────────────────────────────────────────
    const tokenConditions = [...baseConditions(), Prisma.sql`r.token_id IS NOT NULL`];
    const byTokenRows = await prisma.$queryRaw<
      { id: string; name: string; requests: bigint; errors: bigint; avg_latency: number }[]
    >`
      SELECT
        r.token_id                                            AS id,
        COALESCE(st.name, st.id)                             AS name,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN r.status >= 400 THEN 1 END)          AS errors,
        COALESCE(AVG(r.latency_ms)::float8, 0)               AS avg_latency
      FROM request_logs r
      LEFT JOIN service_tokens st ON st.id = r.token_id
      ${Prisma.join(tokenConditions, ' AND ', 'WHERE ', '')}
      GROUP BY r.token_id, st.name, st.id
      ORDER BY requests DESC
      LIMIT 10
    `;

    // ── topEndpoints ──────────────────────────────────────────────────────────
    const endpointRows = await prisma.$queryRaw<
      { endpoint: string; requests: bigint; errors: bigint }[]
    >`
      SELECT
        endpoint,
        COUNT(*)                                    AS requests,
        COUNT(CASE WHEN status >= 400 THEN 1 END)   AS errors
      FROM request_logs
      ${where}
      GROUP BY endpoint
      ORDER BY requests DESC
      LIMIT 10
    `;

    return {
      summary: {
        total:      n(summaryRow.total),
        errors:     n(summaryRow.errors),
        avgLatency: Math.round(summaryRow.avg_latency),
      },
      timeseries: timeseriesRows.map((r) => ({
        time:       r.time.toISOString(),
        requests:   n(r.requests),
        errors:     n(r.errors),
        avgLatency: Math.round(r.avg_latency),
      })),
      byKey: byKeyRows.map((r) => ({
        id: r.id, name: r.name,
        requests: n(r.requests), errors: n(r.errors),
        avgLatency: Math.round(r.avg_latency),
      })),
      byGroup: byGroupRows.map((r) => ({
        id: r.id, name: r.name,
        requests: n(r.requests), errors: n(r.errors),
        avgLatency: Math.round(r.avg_latency),
      })),
      byToken: byTokenRows.map((r) => ({
        id: r.id, name: r.name,
        requests: n(r.requests), errors: n(r.errors),
        avgLatency: Math.round(r.avg_latency),
      })),
      topEndpoints: endpointRows.map((r) => ({
        endpoint: r.endpoint,
        requests: n(r.requests),
        errors:   n(r.errors),
      })),
    };
  },
};
