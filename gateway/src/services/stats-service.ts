import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * StatsService — analytics aggregation layer.
 *
 * All data is fetched from the `request_logs` table using raw SQL queries
 * because Prisma's aggregate API does not support grouping by arbitrary time
 * buckets (hour/day) while also joining related tables for names.
 *
 * Key design choices:
 *  - `baseConditions()` builds shared WHERE clauses (time range + optional filters)
 *    so every analytic query uses the same filter logic.
 *  - `bucketExpr()` generates `date_trunc` SQL for hour or day buckets.
 *  - Bigint values from PostgreSQL COUNT/SUM are converted to JS numbers via `n()`.
 *  - Image-generation analytics are filtered by `endpoint LIKE '%/image%'`.
 */
export const StatsService = {
  async log(data: {
    tokenId?: string;
    keyId?: string;
    groupId?: string;
    endpoint: string;
    status: number;
    latencyMs: number;
    error?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
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

  async getRecentLogs(params: {
    limit: number;
    offset: number;
    endpoint?: string;
    status?: number;
    keyId?: string;
    groupId?: string;
    tokenId?: string;
    search?: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  }) {
    const { limit, offset, endpoint, status, keyId, groupId, tokenId, search, sortBy, sortOrder } = params;

    const where: Prisma.RequestLogWhereInput = {};
    if (endpoint) where.endpoint = { contains: endpoint };
    if (status !== undefined) where.status = status;
    if (keyId) where.keyId = keyId;
    if (groupId) where.groupId = groupId;
    if (tokenId) where.tokenId = tokenId;
    if (search) {
      where.OR = [
        { endpoint: { contains: search, mode: 'insensitive' } },
        { error: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.RequestLogOrderByWithRelationInput = {};
    if (sortBy === 'latency') orderBy.latencyMs = sortOrder;
    else orderBy.createdAt = sortOrder;

    const [data, total] = await Promise.all([
      prisma.requestLog.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        include: {
          token: { select: { name: true } },
          key: { select: { name: true } },
        },
      }),
      prisma.requestLog.count({ where }),
    ]);

    return { data, total, limit, offset };
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
    const baseConditions = (alias = ''): Prisma.Sql[] => {
      const col = (name: string) => (alias ? `${alias}.${name}` : name);
      const c: Prisma.Sql[] = [Prisma.sql`${Prisma.raw(col('created_at'))} >= ${startTime}`];
      if (keyId)   c.push(Prisma.sql`${Prisma.raw(col('key_id'))}   = ${keyId}`);
      if (groupId) c.push(Prisma.sql`${Prisma.raw(col('group_id'))} = ${groupId}`);
      if (tokenId) c.push(Prisma.sql`${Prisma.raw(col('token_id'))} = ${tokenId}`);
      return c;
    };

    const bucketExpr = (alias = '') => {
      const col = alias ? `${alias}.created_at` : 'created_at';
      return bucketFn === 'hour'
        ? Prisma.sql`date_trunc('hour', ${Prisma.raw(col)})`
        : Prisma.sql`date_trunc('day',  ${Prisma.raw(col)})`;
    };

    // Helper to convert bigint → number
    const n = (v: bigint | number) => Number(v);

    // ── Summary ───────────────────────────────────────────────────────────────────────────────────────────────
    const where = Prisma.join(baseConditions(), ' AND ', 'WHERE ', '');

    const [summaryRow] = await prisma.$queryRaw<
      { total: bigint; errors: bigint; avg_latency: number; prompt_tokens: bigint; completion_tokens: bigint; total_tokens: bigint }[]
    >`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(CASE WHEN status >= 400 THEN 1 END)            AS errors,
        COALESCE(AVG(latency_ms)::float8, 0)                 AS avg_latency,
        COALESCE(SUM(prompt_tokens), 0)                      AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)                  AS completion_tokens,
        COALESCE(SUM(total_tokens), 0)                     AS total_tokens
      FROM request_logs
      ${where}
    `;

    // ── Timeseries ───────────────────────────────────────────────────────────────────────────────
    const timeseriesRows = await prisma.$queryRaw<
      { time: Date; requests: bigint; errors: bigint; avg_latency: number; prompt_tokens: bigint; completion_tokens: bigint; total_tokens: bigint }[]
    >`
      SELECT
        ${bucketExpr()}                                       AS time,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN status >= 400 THEN 1 END)            AS errors,
        COALESCE(AVG(latency_ms)::float8, 0)                 AS avg_latency,
        COALESCE(SUM(prompt_tokens), 0)                      AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)                  AS completion_tokens,
        COALESCE(SUM(total_tokens), 0)                       AS total_tokens
      FROM request_logs
      ${where}
      GROUP BY ${bucketExpr()}
      ORDER BY time ASC
    `;

    // ── byKey (only rows where key_id IS NOT NULL) ─────────────────────────────────────────────
    const keyConditions = [...baseConditions('r'), Prisma.sql`r.key_id IS NOT NULL`];
    const byKeyRows = await prisma.$queryRaw<
      { id: string; name: string; requests: bigint; errors: bigint; avg_latency: number; prompt_tokens: bigint; completion_tokens: bigint; total_tokens: bigint }[]
    >`
      SELECT
        r.key_id                                              AS id,
        COALESCE(ak.name, r.key_id)                          AS name,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN r.status >= 400 THEN 1 END)          AS errors,
        COALESCE(AVG(r.latency_ms)::float8, 0)               AS avg_latency,
        COALESCE(SUM(r.prompt_tokens), 0)                    AS prompt_tokens,
        COALESCE(SUM(r.completion_tokens), 0)                AS completion_tokens,
        COALESCE(SUM(r.total_tokens), 0)                     AS total_tokens
      FROM request_logs r
      LEFT JOIN api_keys ak ON ak.id = r.key_id
      ${Prisma.join(keyConditions, ' AND ', 'WHERE ', '')}
      GROUP BY r.key_id, ak.name, ak.created_at
      ORDER BY ak.created_at ASC
      LIMIT 10
    `;

    // ── byGroup ────────────────────────────────────────────────────────────────────────────────────
    const groupConditions = [...baseConditions('r'), Prisma.sql`r.group_id IS NOT NULL`];
    const byGroupRows = await prisma.$queryRaw<
      { id: string; name: string; requests: bigint; errors: bigint; avg_latency: number; prompt_tokens: bigint; completion_tokens: bigint; total_tokens: bigint }[]
    >`
      SELECT
        r.group_id                                            AS id,
        COALESCE(kg.name, r.group_id)                        AS name,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN r.status >= 400 THEN 1 END)          AS errors,
        COALESCE(AVG(r.latency_ms)::float8, 0)               AS avg_latency,
        COALESCE(SUM(r.prompt_tokens), 0)                    AS prompt_tokens,
        COALESCE(SUM(r.completion_tokens), 0)                AS completion_tokens,
        COALESCE(SUM(r.total_tokens), 0)                     AS total_tokens
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

    // ── byToken ────────────────────────────────────────────────────────────────────────────────────
    const tokenConditions = [...baseConditions('r'), Prisma.sql`r.token_id IS NOT NULL`];
    const byTokenRows = await prisma.$queryRaw<
      { id: string; name: string; requests: bigint; errors: bigint; avg_latency: number; prompt_tokens: bigint; completion_tokens: bigint; total_tokens: bigint }[]
    >`
      SELECT
        r.token_id                                            AS id,
        COALESCE(st.name, st.id)                             AS name,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN r.status >= 400 THEN 1 END)          AS errors,
        COALESCE(AVG(r.latency_ms)::float8, 0)               AS avg_latency,
        COALESCE(SUM(r.prompt_tokens), 0)                    AS prompt_tokens,
        COALESCE(SUM(r.completion_tokens), 0)                AS completion_tokens,
        COALESCE(SUM(r.total_tokens), 0)                     AS total_tokens
      FROM request_logs r
      LEFT JOIN service_tokens st ON st.id = r.token_id
      ${Prisma.join(tokenConditions, ' AND ', 'WHERE ', '')}
      GROUP BY r.token_id, st.name, st.id
      ORDER BY requests DESC
      LIMIT 10
    `;

    // ── topEndpoints ───────────────────────────────────────────────────────────────────────────────
    const endpointRows = await prisma.$queryRaw<
      { endpoint: string; requests: bigint; errors: bigint; prompt_tokens: bigint; completion_tokens: bigint; total_tokens: bigint }[]
    >`
      SELECT
        endpoint,
        COUNT(*)                                    AS requests,
        COUNT(CASE WHEN status >= 400 THEN 1 END)   AS errors,
        COALESCE(SUM(prompt_tokens), 0)             AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)         AS completion_tokens,
        COALESCE(SUM(total_tokens), 0)            AS total_tokens
      FROM request_logs
      ${where}
      GROUP BY endpoint
      ORDER BY requests DESC
      LIMIT 10
    `;

    // ── Image Generation ───────────────────────────────────────────────────────────────────────────────
    const imageConditions = [...baseConditions(), Prisma.sql`endpoint LIKE '%/image%'`];
    const imageWhere = Prisma.join(imageConditions, ' AND ', 'WHERE ', '');

    const [imageSummaryRow] = await prisma.$queryRaw<
      { total: bigint; errors: bigint; avg_latency: number }[]
    >`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(CASE WHEN status >= 400 THEN 1 END)            AS errors,
        COALESCE(AVG(latency_ms)::float8, 0)                 AS avg_latency
      FROM request_logs
      ${imageWhere}
    `;

    const imageTimeseriesRows = await prisma.$queryRaw<
      { time: Date; requests: bigint; errors: bigint; avg_latency: number }[]
    >`
      SELECT
        ${bucketExpr()}                                       AS time,
        COUNT(*)                                              AS requests,
        COUNT(CASE WHEN status >= 400 THEN 1 END)            AS errors,
        COALESCE(AVG(latency_ms)::float8, 0)                 AS avg_latency
      FROM request_logs
      ${imageWhere}
      GROUP BY ${bucketExpr()}
      ORDER BY time ASC
    `;

    return {
      summary: {
        total:      n(summaryRow.total),
        errors:     n(summaryRow.errors),
        avgLatency: Math.round(summaryRow.avg_latency),
        promptTokens:     n(summaryRow.prompt_tokens),
        completionTokens: n(summaryRow.completion_tokens),
        totalTokens:      n(summaryRow.total_tokens),
      },
      timeseries: timeseriesRows.map((r) => ({
        time:       r.time.toISOString(),
        requests:   n(r.requests),
        errors:     n(r.errors),
        avgLatency: Math.round(r.avg_latency),
        promptTokens:     n(r.prompt_tokens),
        completionTokens: n(r.completion_tokens),
        totalTokens:      n(r.total_tokens),
      })),
      byKey: byKeyRows.map((r) => ({
        id: r.id, name: r.name,
        requests: n(r.requests), errors: n(r.errors),
        avgLatency: Math.round(r.avg_latency),
        promptTokens:     n(r.prompt_tokens),
        completionTokens: n(r.completion_tokens),
        totalTokens:      n(r.total_tokens),
      })),
      byGroup: byGroupRows.map((r) => ({
        id: r.id, name: r.name,
        requests: n(r.requests), errors: n(r.errors),
        avgLatency: Math.round(r.avg_latency),
        promptTokens:     n(r.prompt_tokens),
        completionTokens: n(r.completion_tokens),
        totalTokens:      n(r.total_tokens),
      })),
      byToken: byTokenRows.map((r) => ({
        id: r.id, name: r.name,
        requests: n(r.requests), errors: n(r.errors),
        avgLatency: Math.round(r.avg_latency),
        promptTokens:     n(r.prompt_tokens),
        completionTokens: n(r.completion_tokens),
        totalTokens:      n(r.total_tokens),
      })),
      topEndpoints: endpointRows.map((r) => ({
        endpoint: r.endpoint,
        requests: n(r.requests),
        errors:   n(r.errors),
        promptTokens:     n(r.prompt_tokens),
        completionTokens: n(r.completion_tokens),
        totalTokens:      n(r.total_tokens),
      })),
      imageGeneration: {
        summary: {
          total:      n(imageSummaryRow.total),
          errors:     n(imageSummaryRow.errors),
          avgLatency: Math.round(imageSummaryRow.avg_latency),
        },
        timeseries: imageTimeseriesRows.map((r) => ({
          time:       r.time.toISOString(),
          requests:   n(r.requests),
          errors:     n(r.errors),
          avgLatency: Math.round(r.avg_latency),
        })),
      },
    };
  },
};
